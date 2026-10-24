"""Read-only checks for the current design, references and retained assets."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import ast, hashlib, json, re, struct

ROOT = Path(__file__).resolve().parents[1]
SCENE = ROOT / 'design/scene'
errors, stats = [], {}
def check(ok, message):
    if not ok:
        errors.append(message)
def load(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))
def ref(source, target):
    target = target.strip().split(' "',1)[0].strip('<>')
    if not target or target.startswith('#'):
        return
    if re.match(r'^[A-Za-z]:[/\\]', target):
        dest = Path(unquote(target))
    else:
        url = urlsplit(target)
        if url.scheme or url.netloc:
            return
        dest = (source.parent / unquote(url.path)).resolve()
    check(dest.exists(), f'Missing reference: {source.relative_to(ROOT)} -> {target}')

class Links(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.source = source
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('href','src') and value:
                ref(self.source, value)

files = [p for p in ROOT.rglob('*') if p.is_file()]
for p in files:
    if p.suffix == '.json':
        try:
            load(p)
        except Exception as exc:
            errors.append(f'Invalid JSON: {p}: {exc}')
    elif p.suffix == '.py':
        ast.parse(p.read_text(encoding='utf-8-sig'), filename=str(p))
    elif p.suffix == '.md':
        text = p.read_text(encoding='utf-8-sig')
        for target in re.findall(r'!?\[[^\]]*\]\(([^)\n]+)\)', text):
            ref(p, target)
    elif p.suffix == '.html':
        Links(p).feed(p.read_text(encoding='utf-8-sig'))
    elif p.suffix == '.png':
        data = p.read_bytes()
        check(data[:8] == b'\x89PNG\r\n\x1a\n', f'Invalid PNG: {p}')
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            width,height = struct.unpack('>II',data[16:24])
            check(width > 0 and height > 0, f'Empty image: {p}')

g, placements = load(SCENE/'geometry.json'), load(SCENE/'placements.json')
rooms = {r['id']:r for r in g['rooms']}
expected = {f'F{i}' for i in range(1,11)} | {'S'} | {f'U{i}' for i in range(1,9)} | {f'O{i}' for i in range(1,7)}
check(set(rooms) == expected and len(g['rooms']) == 25, 'Room ID set mismatch')
check(len(g['openings']) == 28 and len(g['windows']) == 12, 'Geometry inventory mismatch')
check({s['id'] for s in placements['scenes']} == expected, 'Placement room mismatch')
edges = {frozenset((o['a'],o['b'])) for o in g['openings']}
graph = {i:set() for i in expected - {'O6'}}
for opening in g['openings']:
    a,b=opening['a'],opening['b']
    check(a in rooms and b in rooms, f'Opening target missing: {opening["id"]}')
    if a in graph and b in graph and opening.get('gate') != 'never_open':
        graph[a].add(b)
        graph[b].add(a)
seen,stack=set(),['O1']
while stack:
    node=stack.pop()
    if node not in seen:
        seen.add(node)
        stack.extend(graph[node]-seen)
check(seen == set(graph), 'Walkable normal graph is disconnected')
check(any(o.get('gate') == 'never_open' and 'O6' in (o['a'],o['b']) for o in g['openings']), 'O6 boundary must remain closed')
routes=load(SCENE/'layout-reference/flow-routes.json')
check((SCENE/'layout-reference'/routes['geometry_authority']).resolve() == (SCENE/'geometry.json').resolve(), 'Route geometry must refer to sole source')
for group in ('phases','hidden_routes'):
    for route in routes.get(group,[]):
        nodes=route.get('nodes',[])
        check(all(n in rooms and n != 'O6' for n in nodes), f'Invalid walkable node in {route.get("id")}')
        for a,b in zip(nodes,nodes[1:]):
            check(a == b or frozenset((a,b)) in edges, f'Undeclared route edge {route.get("id")}: {a}->{b}')
for i in expected:
    check((SCENE/'scenes'/f'{i}.md').is_file(), f'Scene spec missing: {i}')
    check((SCENE/'plans'/f'{i}.png').is_file(), f'Plan missing: {i}')
manifest=load(SCENE/'scene-manifest.json')
check({r['id'] for r in manifest['scenes']} == expected, 'Scene manifest mismatch')
for record in manifest['scenes']:
    for key in ('spec','plan'):
        check((SCENE/record[key]).is_file(), f'Manifest missing {key}: {record["id"]}')
    image=SCENE/record['image']
    check(image.is_file() == record['image_exists'], f'Image existence drift: {record["id"]}')
    if image.is_file():
        check(hashlib.sha256(image.read_bytes()).hexdigest() == record['image_sha256'], f'Image hash drift: {record["id"]}')
for view in load(SCENE/'layout-reference/view-manifest.json'):
    check((SCENE/'layout-reference'/view['file']).is_file(), f'View missing: {view["file"]}')
interaction=load(SCENE/'interactions.json')['interactions']
for item in interaction:
    check(all(room in rooms for room in item['room_id'].split('/')), f'Unknown interaction room: {item["id"]}')

first=(ROOT/'design/first-night.md').read_text(encoding='utf-8')
for prefix, count, pad in (('A',52,2),('N',9,0),('H',6,0),('I',5,0),('R',8,0),('D',8,0),('X',4,0),('Q',20,2)):
    start = 0 if prefix in ('N','I','D') else 1
    for i in range(start,start+count):
        check(re.search(rf'(?<![A-Za-z0-9]){prefix}{str(i).zfill(pad)}(?![0-9])', first), f'Design section missing: {prefix}{i}')
for retired in ('family_visitor','preview','production','story','.agents','.codex','.claude','.cursor','.harness','docs','work'):
    check(not (ROOT/retired).exists(), f'Retired directory still exists: {retired}')
check(not list(SCENE.glob('layout-reference/geometry.json')), 'Duplicate geometry source')
check(not list(SCENE.glob('layout-reference/placements.json')), 'Duplicate placement source')
check(not any(p.suffix in ('.gd','.godot','.glb','.blend','.exe','.wav') for p in files), 'Retired engine assets remain')
check(not any(p.name == '__pycache__' for p in ROOT.rglob('*')), 'Python cache generated')

stats.update(files=len(files), bytes=sum(p.stat().st_size for p in files), rooms=len(rooms),
             openings=len(g['openings']), windows=len(g['windows']), walkable_nodes=len(graph),
             scene_specs=25, plans=len(list((SCENE/'plans').glob('*.png'))),
             concept_images=len(list((SCENE/'images').glob('*.png'))),
             images_with_scene=sum(r['image_exists'] for r in manifest['scenes']),
             views=len(load(SCENE/'layout-reference/view-manifest.json')),
             interactions=len(interaction), routes=len(routes['phases'])+len(routes['hidden_routes']), errors=errors)
print(json.dumps(stats, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)

