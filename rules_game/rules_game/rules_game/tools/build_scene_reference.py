"""Rebuild measured drawings and the local review gallery from authored source data.
This generates reference documents, not Blender models or engine assets.
"""
from pathlib import Path
import json, math, html, hashlib
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / 'design' / 'scene'
def read(name):
    return json.loads((ROOT / name).read_text(encoding='utf-8-sig'))
def save(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
def font(size):
    return ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', size)
def area(poly):
    return abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(poly,poly[1:]+poly[:1])))/2
def bounds(poly):
    return min(p[0] for p in poly),min(p[1] for p in poly),max(p[0] for p in poly),max(p[1] for p in poly)
def inside(p, poly):
    x,y=p; result=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: result=not result
    return result
def labelpoint(poly):
    x0,y0,x1,y1=bounds(poly)
    c=((x0+x1)/2,(y0+y1)/2)
    if inside(c,poly): return c
    pts=[(x0+(x1-x0)*i/10,y0+(y1-y0)*j/10) for i in range(1,10) for j in range(1,10)]
    return min((p for p in pts if inside(p,poly)),key=lambda p:math.dist(p,c))
def table(headers, rows):
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(map(str,r))+' |' for r in rows])
def main():
    g=read('geometry.json'); scenes=read('scene-content.json')['scenes']
    placements=read('placements.json') if (ROOT/'placements.json').exists() else {'scenes':[]}
    placed={s['id']:s for s in placements['scenes']}
    rooms={r['id']:r for r in g['rooms']}
    for folder in ('plans','scenes'): (ROOT/folder).mkdir(exist_ok=True)
    def drawing(ids, filename, title, single=False):
        rr=[rooms[i] for i in ids]
        x0,y0,x1,y1=bounds([p for r in rr for p in r['polygon']])
        W,H=(1500,1150) if single else (1800,1450)
        im=Image.new('RGB',(W,H),'#f5f0e6');d=ImageDraw.Draw(im)
        scale=min((W-280)/(x1-x0+1),(H-290)/(y1-y0+1))
        cx,cy=(x0+x1)/2,(y0+y1)/2
        def xy(p): return (W/2+(p[0]-cx)*scale,150+(H-300)/2-(p[1]-cy)*scale)
        d.text((50,30),title,font=font(34),fill='#263c3b')
        d.text((50,82),'米制平面 · 北↑ · X向东 / Y向北 · 几何以 geometry.json 为准',font=font(20),fill='#516361')
        for x in range(math.floor(x0),math.ceil(x1)+1):
            a,b=xy((x,y0)),xy((x,y1));d.line([a,b],fill='#e0ddd5',width=1)
            d.text((a[0]-8,xy((x,y0))[1]+14),str(x),font=font(14),fill='#627370')
        for y in range(math.floor(y0),math.ceil(y1)+1):
            a,b=xy((x0,y)),xy((x1,y));d.line([a,b],fill='#e0ddd5',width=1)
            d.text((a[0]-35,a[1]-8),str(y),font=font(14),fill='#627370')
        for r in rr:
            d.polygon([xy(p) for p in r['polygon']],fill='#dce3d4' if r['floor']=='outside' else '#e9ddc8',outline='#384947',width=max(2,int(scale*.12)))
            if single:
                for prop in placed.get(r['id'],{}).get('props',[]):
                    fp=prop.get('footprint',[])
                    if fp:
                        d.polygon([xy(p) for p in fp],fill='#bbad96' if prop.get('collision',True) else '#c5d9df',outline='#686759',width=2)
                        p=labelpoint(fp);d.text(xy(p),prop['kit'],font=font(13),fill='#233c3d',anchor='mm')
            if not single:
                bx0,by0,bx1,by1=bounds(r['polygon'])
                fs=max(12,min(19,int((bx1-bx0)*scale/6)))
                name=r['name'].split('（')[0]
                if len(name)>6:name=name[:6]
                d.multiline_text(xy(labelpoint(r['polygon'])),r['id']+'\n'+name,font=font(fs),fill='#223a39',anchor='mm',align='center',spacing=3)
        if 'S' in ids or 'U1' in ids:
            st=g['stair']
            if 'U1' in ids:
                d.polygon([xy(v) for v in st['upper_floor_slab_opening']],fill='#c2c4c1',outline='#634d45',width=3)
            for key in ('lower_flight','upper_flight','turning_landing','upper_landing'):
                poly=st[key]['polygon'];d.polygon([xy(v) for v in poly],outline='#725541',width=2)
                if 'flight' in key:
                    ax,ay,bx,by=bounds(poly)
                    for n in range(9):d.line([xy((ax+n*(bx-ax)/8,ay)),xy((ax+n*(bx-ax)/8,by))],fill='#725541',width=2)
            h=st['history_wall_field'];d.line([xy(v) for v in h['wall_line']],fill='#9d4770',width=6)
            if single:d.text(xy(h['wall_line'][0]),'V3',font=font(17),fill='#9d4770')
        if not single and 'O1' in ids:
            for x,y in g['support_plan']['front_veranda_support']['columns']:
                d.polygon([xy(v) for v in [(x-.15,y-.15),(x+.15,y-.15),(x+.15,y+.15),(x-.15,y+.15)]],fill='#775f48')
        for o in g['openings']+g['windows']:
            win='room' in o
            if not (o['room'] in ids if win else o['a'] in ids or o['b'] in ids): continue
            x,y=o['center'][:2];w=o['width']/2
            a,b=([(x-w,y),(x+w,y)] if o['axis']=='X' else [(x,y-w),(x,y+w)])
            color='#267e9c' if win else '#b06d27'
            d.line([xy(a),xy(b)],fill=color,width=max(5,int(scale*.14)))
            px,py=xy((x,y));d.text((px+5,py-22),o['id'],font=font(15 if single else 13),fill=color)
        if single:
            cam=placed.get(ids[0],{}).get('camera')
            if cam:
                p,t=xy(cam['position']),xy(cam['target'])
                d.line([p,t],fill='#9d4770',width=3);d.ellipse((p[0]-7,p[1]-7,p[0]+7,p[1]+7),fill='#9d4770')
                d.text((p[0]+8,p[1]),'CAM',font=font(16),fill='#9d4770')
            d.text((50,H-125),f'外包络 {x1-x0:.2f} × {y1-y0:.2f} m；基准多边形面积 {area(rr[0]["polygon"]):.2f} m²',font=font(21),fill='#263c3b')
        else:
            for p in g.get('site_paths',[]):
                if p['from'] in ids and p['to'] in ids:d.line([xy(v) for v in p['polyline']],fill='#7a7542',width=3)
        d.text((50,H-80),'蓝：窗/采光口　棕：门洞/门槛　紫：相机　填色：陈设；所有标高与启闭条件见分场景稿。',font=font(18),fill='#415654')
        d.text((50,H-45),'设计建模参考；生成透视图不承担尺寸、门窗数量与结构验收。',font=font(17),fill='#667873')
        im.save(ROOT/'plans'/filename)
    drawing([r['id'] for r in g['rooms'] if r['floor']!=1],'MASTER-ground.png','《规则之间》总场景 · 一层与室外')
    drawing([r['id'] for r in g['rooms'] if r['floor']==1],'MASTER-upper.png','《规则之间》总场景 · 二层')
    manifest=[]; cards=[]
    for s in scenes:
        i=s['id'];r=rooms[i];p=placed.get(i,{})
        drawing([i],f'{i}.png',f'{i} · {s["name"]}',True)
        doors=[o for o in g['openings'] if i in (o['a'],o['b'])]
        windows=[w for w in g['windows'] if w['room']==i]
        props=p.get('props',[])
        x0,y0,x1,y1=bounds(r['polygon'])
        floor='一层' if r['floor']==0 else '二层' if r['floor']==1 else '室外' if r['floor']=='outside' else '唯一主楼梯'
        materials='湿区：灰绿釉面砖/矿物防滑地砖、白陶瓷、拉丝或镀铬五金。' if i in ['F5','F7','F9','U7'] else '室外：灰石铺地、红褐砖基、灰泥围墙，排水沟与地标独立分件。' if i.startswith('O') else '室内：灰米矿物抹灰、深棕木窗及踢脚、保养木地板；现代修补克制保留。'
        image_md = f'![场景参考](../images/{i}.png)' if (ROOT/'images'/f'{i}.png').exists() else '此节点暂无独立透视参考；以米制图和文字规格为准。'
        prompt_md = f'[图片提示词](../prompts/{i}.txt) · ' if (ROOT/'prompts'/f'{i}.txt').exists() else ''
        image_card = f'<a href="images/{i}.png"><img loading="lazy" src="images/{i}.png" alt="{s["name"]}场景参考"></a>' if (ROOT/'images'/f'{i}.png').exists() else '<p>暂无独立透视参考，请查看米制平面。</p>'
        prompt_card = f'<a href="prompts/{i}.txt">图片提示词</a>' if (ROOT/'prompts'/f'{i}.txt').exists() else ''
        md=f'# {i} · {s["name"]}\n\n{s["asset_id"]} · {floor} · 第一夜建模参考，尚非已建成模型。\n\n{image_md}\n\n## 场景叙事与镜头\n\n{s["visual"]}\n\n事件：{s["events"]}。必须可读：{s["must_read"]}\n\n推荐构图：{s["camera"]} 透视图表达材质和氛围，下面的坐标与正交图控制建模。\n\n## 精确结构\n\n![米制平面](../plans/{i}.png)\n\n世界坐标 X 东/Y 北/Z 上，单位米。地坪 Z={r["z"]}；净高参考 {r["height"]}；基准包络 {x1-x0:.2f}×{y1-y0:.2f}；多边形面积 {area(r["polygon"]):.2f}㎡。面积为基准线围合面积，净面积须按 geometry.json 的墙厚约定扣除。\n\n基准顶点：`{r["polygon"]}`。房间源对象原点：`[{x0}, {y1}, {r["z"]}]`；禁止整体重置 Location。\n\n'
        md+='门洞：\n\n'+table(['编号','相邻节点','门槛中心 XYZ','净宽×高','沿轴','门禁'],[(o['id'],o['b'] if o['a']==i else o['a'],o['center'],f'{o["width"]}×{o["height"]}',o['axis'],o['gate']) for o in doors])+'\n\n'
        md+='窗/开口：\n\n'+(table(['编号','中心 XYZ','宽×高','窗台','沿轴','视线目标'],[(w['id'],w['center'],f'{w["width"]}×{w["height"]}',w['sill'],w['axis'],w['view_to']) for w in windows]) if windows else '无独立外窗；不允许从透视图复制新增窗洞。')+'\n\n'
        md+='## 陈设与观察位\n\n'+(table(['资产套件','尺寸 W/D/H','底面中心 XYZ','Z旋转°','碰撞','说明'],[(q['kit'],q['size'],q['position'],q.get('rotation_z_degrees',0),q.get('collision',True),q.get('notes','')) for q in props]) if props else '摆放坐标尚待补齐，不能以此页作为最终装配依据。')+'\n\n'
        md+=f'相机：`{json.dumps(p.get("camera",{}),ensure_ascii=False)}`。\n\n通行检查：{p.get("clearance_notes","尚待摆放检查")}\n\n## 状态与制作分件\n\n{s["states"]}\n\n{materials} 精确色值、材质粗糙度、贴图复用规则见 [visual-bible.md](../visual-bible.md)。\n\n静态墙地顶、门窗框和普通陈设分集合制作；可动门扇、窗帘、锁、开关、抽屉、纸张、电话及手镜必须独立。关键道具尺寸、状态和操作见 [interaction-specs.md](../interaction-specs.md)。\n\nBlender 保留高精度可编辑源，倒角按真实尺度制作，禁止把贴图阴影烘成唯一细节。优化导出单独生成；面数/贴图预算由实机性能复核，不能以占位模型冒充最终资产。完整交接见 [blender-handoff.md](../blender-handoff.md)。\n\n## 此场景验收\n\n- 逐一核对本页门窗与 geometry.json；检查墙厚、门扇扫掠区与上方梁底净空。\n- 从相机位确认“必须可读”的道具与退路都可辨，普通装饰不得遮挡。\n- 核对 M/W/G 只变化本页批准的局部；不引入额外通道。\n- 建模完成后另验 UV、法线、贴图嵌入、碰撞与 目标引擎 运行；当前包不提供这些尚未发生的通过证据。\n\n{prompt_md}[返回总览](../index.html)\n'
        (ROOT/'scenes'/f'{i}.md').write_text(md,encoding='utf-8')
        ip=ROOT/'images'/f'{i}.png'
        manifest.append({'id':i,'asset_id':s['asset_id'],'name':s['name'],'spec':f'scenes/{i}.md','plan':f'plans/{i}.png','image':f'images/{i}.png','image_exists':ip.exists(),'image_sha256':hashlib.sha256(ip.read_bytes()).hexdigest() if ip.exists() else None,'placements':bool(props),'status':'design_reference_not_model'})
        esc=html.escape
        cards.append(f'<article id="{i}" data-search="{esc(i+" "+s["name"]+" "+s["events"])}"><div class="row"><h2>{i} {esc(s["name"])}</h2><span>{floor}</span></div>{image_card}<p>{esc(s["visual"])}</p><p><b>探索重点</b> {esc(s["must_read"])}</p><p class="state">{esc(s["states"])}</p><details><summary>米制平面</summary><a href="plans/{i}.png"><img loading="lazy" src="plans/{i}.png" alt="{i}平面"></a></details><nav><a href="scenes/{i}.md">完整建模文字稿</a>{prompt_card}</nav></article>')
    save('scene-manifest.json',{'scope':'25 functional scene references, not built models','scenes':manifest})
    page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>规则之间 · 场景制作参考</title><style>*{box-sizing:border-box}body{margin:0;background:#eee9df;color:#263b39;font:17px/1.75 "Microsoft YaHei",sans-serif}header,main{max-width:1380px;margin:auto;padding:36px}h1{font-size:42px;margin:0}h2{font-size:24px;margin:12px 0}a{color:#35695e}img{width:100%;display:block;border-radius:6px}header>img{margin:24px 0}nav{display:flex;flex-wrap:wrap;gap:20px}input{font:inherit;width:100%;padding:14px;border:1px solid #a8b3a5;border-radius:6px;margin:20px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:#faf7ef;padding:22px;border-radius:10px;box-shadow:0 4px 18px #243b3810}.row{display:flex;justify-content:space-between;align-items:center}.state{color:#667365;font-size:15px}summary{cursor:pointer;color:#35695e}details{margin:15px 0}.plans{display:grid;grid-template-columns:1fr 1fr;gap:20px}footer{padding:40px;text-align:center;color:#69766c}@media(max-width:800px){.grid,.plans{grid-template-columns:1fr}header,main{padding:18px}h1{font-size:30px}}</style><header><p>上海旧宅民宿 / 第一夜 / 场景设计与建模交接</p><h1>《规则之间》场景制作参考</h1><p>一栋洋楼，四间客房，室内与院巷逐步开放。表线完成生存，里线追查前人并以旧手镜辨认历史入口。</p><img src="images/MASTER-exterior.png" alt="洋楼材质与外观参考"><p>外观图用于材质与尺度气质参考；下方正交图与几何数据控制实际门窗、墙线和空间关系。此包交付设计图片与文字，不代表 Blender 模型或 目标引擎 场景已制作验收。</p><nav><a href="README.md">交付说明</a><a href="geometry.json">几何数据</a><a href="placements.json">陈设与相机坐标</a><a href="interaction-specs.md">关键交互道具</a><a href="blender-handoff.md">Blender交接规范</a><a href="visual-bible.md">视觉规范</a></nav><div class="plans"><a href="plans/MASTER-ground.png"><img src="plans/MASTER-ground.png" alt="一层与场地"></a><a href="plans/MASTER-upper.png"><img src="plans/MASTER-upper.png" alt="二层"></a></div><input id="search" placeholder="查找房间编号、名称或事件，例如 U3、镜子、厨房" aria-label="查找场景"></header><main class="grid">'''+''.join(cards)+'''</main><footer>定点旧景与局部异常复用原场景骨架；第二夜仅预留历史入口。</footer><script>document.querySelector('#search').addEventListener('input',e=>{let q=e.target.value.toLowerCase().trim();document.querySelectorAll('article').forEach(a=>a.hidden=!(a.innerText+' '+a.dataset.search).toLowerCase().includes(q))})</script></html>'''
    (ROOT/'index.html').write_text(page,encoding='utf-8')
    print(json.dumps({'scenes':len(manifest),'images':sum(s['image_exists'] for s in manifest),'placed':sum(s['placements'] for s in manifest),'plans':len(list((ROOT/'plans').glob('*.png')))},ensure_ascii=False))
if __name__=='__main__': main()
