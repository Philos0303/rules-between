// level.js —— 从 geometry.json / placements.json 程序化生成灰盒关卡
// 坐标约定（数据源）：Blender，X 东 Y 北 Z 上，米。
// Three.js 映射：world(x, y, z) <- blender(bx, by, bz) => (bx, bz, -by)
import * as THREE from 'three';

const WALL_T = 0.2;          // 内墙厚（中心线两侧各 0.10）
const FENCE_T = 0.15;
const EPS = 0.03;

export function bp(bx, by, bz) { return new THREE.Vector3(bx, bz, -by); }

function segKey(p, q) {
  const a = [p[0].toFixed(3), p[1].toFixed(3)].join(',');
  const b = [q[0].toFixed(3), q[1].toFixed(3)].join(',');
  return a < b ? a + '|' + b : b + '|' + a;
}

// 两条线段是否共线且重叠（用于围挡跳过建筑外墙）
function overlap2D(p1, q1, p2, q2) {
  const d1 = [q1[0] - p1[0], q1[1] - p1[1]];
  const d2 = [q2[0] - p2[0], q2[1] - p2[1]];
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  const l1 = Math.hypot(...d1) || 1;
  if (Math.abs(cross) / l1 > 0.02) return false;          // 不平行
  // p2 到线段1所在直线的垂距（平行不代表共线）
  const n = [-d1[1] / l1, d1[0] / l1];
  const dist = Math.abs((p2[0] - p1[0]) * n[0] + (p2[1] - p1[1]) * n[1]);
  if (dist > 0.05) return false;
  const d = [p2[0] - p1[0], p2[1] - p1[1]];
  const t0 = (d[0] * d1[0] + d[1] * d1[1]) / (l1 * l1);
  const l2 = Math.hypot(...d2) / l1;
  return Math.max(0, t0) < Math.min(1, t0 + l2) + 0.01 &&
         Math.min(1, t0 + l2) > Math.max(0, t0) - 0.01;
}

// 点到线段投影：返回 [距离, 参数t, 垂足]
function projOnSeg(c, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const t = len2 ? ((c[0] - a[0]) * abx + (c[1] - a[1]) * aby) / len2 : 0;
  const px = a[0] + abx * t, py = a[1] + aby * t;
  return [Math.hypot(c[0] - px, c[1] - py), t, [px, py]];
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function centroid(poly) {
  let x = 0, y = 0;
  for (const [px, py] of poly) { x += px; y += py; }
  return [x / poly.length, y / poly.length];
}

// ---------- 材质 ----------
// PBR 贴图来自 Poly Haven（CC0），1k jpg：diff(反照率) / nor_gl(法线) / arm(AO+粗糙+金属打包)。
// UV 采用世界坐标平铺：地板 ShapeGeometry 的 uv 即 (x,y)，除以 TILE 即得连续拼贴；
// 墙体 BoxGeometry uv 为 0-1，在 addBox 里按实际长高缩放。
const TILE = 3;   // 每张贴图覆盖 3 米
const tl = new THREE.TextureLoader();
const loadMap = (path, srgb = false) => {
  const t = tl.load(`../assets/tex/${path}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const pbr = name => ({
  map: loadMap(`${name}/diff.jpg`, true),
  normalMap: loadMap(`${name}/nor_gl.jpg`),
  roughnessMap: loadMap(`${name}/arm.jpg`),
  roughness: 1.0,
});
const M = {
  wall:   new THREE.MeshStandardMaterial({ color: 0xcfc9bd, ...pbr('painted_worn_brick') }),
  wallIn: new THREE.MeshStandardMaterial({ color: 0xffffff, ...pbr('damaged_plaster') }),
  fence:  new THREE.MeshLambertMaterial({ color: 0x6e685c }),
  floor:  new THREE.MeshStandardMaterial({ color: 0xffffff, ...pbr('old_wood_floor') }),   // 二层：旧木地板
  floorIn:new THREE.MeshStandardMaterial({ color: 0xffffff, ...pbr('herringbone_parquet') }), // 一层：人字拼
  ground: new THREE.MeshStandardMaterial({ color: 0xffffff, ...pbr('brick_pavement') }),   // 院巷：砖铺地
  ceil:   new THREE.MeshLambertMaterial({ color: 0xb5ad9c, side: THREE.DoubleSide }),
  glass:  new THREE.MeshLambertMaterial({ color: 0x8899aa, transparent: true, opacity: 0.28 }),
  wood:   new THREE.MeshStandardMaterial({ color: 0xd9cdbb, ...pbr('old_wood_floor') }),
  fabric: new THREE.MeshLambertMaterial({ color: 0x5d5a52 }),
  metal:  new THREE.MeshLambertMaterial({ color: 0x8f959a }),
  plant:  new THREE.MeshLambertMaterial({ color: 0x4a5d3a }),
  dark:   new THREE.MeshLambertMaterial({ color: 0x3a3833 }),
};
// 世界坐标 UV 缩放（ShapeGeometry：uv = 顶点坐标）
const worldUVs = geo => {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TILE, uv.getY(i) / TILE);
  uv.needsUpdate = true;
};
// BoxGeometry uv 缩放（u 沿长度、v 沿高度）
const boxUVs = (geo, len, h) => {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / TILE, uv.getY(i) * h / TILE);
  uv.needsUpdate = true;
};
function propMat(kit) {
  const k = kit.toLowerCase();
  if (/mat|rug|carpet/.test(k)) return M.fabric;
  if (/sofa|bed|bench|chair|cushion|pillow/.test(k)) return M.fabric;
  if (/table|desk|console|sideboard|wardrobe|cabinet|stand|shelf|frame|bench/.test(k)) return M.wood;
  if (/kitchen|prep|sink|shower|appliance|radiator|meter|box|panel|machine/.test(k)) return M.metal;
  if (/planter|plant|tree|grass/.test(k)) return M.plant;
  if (/lamp|light/.test(k)) return M.dark;
  return new THREE.MeshLambertMaterial({ color: 0x8a8378 });
}

export function buildLevel(scene, g, p) {
  const rooms = {};
  for (const r of g.rooms) rooms[r.id] = r;
  const isIndoor = r => r.floor !== 'outside';
  const colliders = [];        // 墙：{ax,ay,bx,by,half}
  const propBoxes = [];        // 家具：{minx,miny,maxx,maxy}
  const lampRefs = {};         // 房间灯引用（供剧情开关灯）
  const floorMeshes = {};      // 房间地板网格（N7 W 回放换材质）
  const dynamic = {};          // 需要动画的网格（院门等）

  // ---------- 地板 / 天花 ----------
  const shapeOf = poly => {
    const s = new THREE.Shape();
    s.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) s.lineTo(poly[i][0], poly[i][1]);
    s.closePath();
    return s;
  };
  for (const r of g.rooms) {
    const shape = shapeOf(r.polygon);
    const geo = new THREE.ShapeGeometry(shape);
    worldUVs(geo);
    if (isIndoor(r)) {
      const f = new THREE.Mesh(geo, r.floor === 1 ? M.floorIn : M.floor);
      f.rotation.x = -Math.PI / 2;
      f.position.y = r.z;
      scene.add(f);
      floorMeshes[r.id] = f;
      const c = new THREE.Mesh(geo, M.ceil);
      c.rotation.x = -Math.PI / 2;
      c.position.y = r.z + r.height;
      scene.add(c);
      // 房间暖光
      const [cx, cy] = centroid(r.polygon);
      const li = new THREE.PointLight(0xffd9a0, 9, 9, 2);
      li.position.set(cx, r.z + r.height - 0.7, -cy);
      scene.add(li);
      lampRefs[r.id] = li;
    } else {
      const f = new THREE.Mesh(geo, M.ground);
      f.rotation.x = -Math.PI / 2;
      f.position.y = r.z || 0;
      scene.add(f);
    }
  }

  // ---------- 收集墙边（仅室内房间的多边形边） ----------
  const edges = new Map();
  for (const r of g.rooms) {
    if (!isIndoor(r)) continue;
    const poly = r.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const key = segKey(a, b);
      if (!edges.has(key)) edges.set(key, { a, b, rooms: [] });
      edges.get(key).rooms.push(r.id);
    }
  }
  // 室外围挡边（两端都不是室内）
  const fenceEdges = [];
  const indoorIds = new Set(g.rooms.filter(isIndoor).map(r => r.id));
  for (const r of g.rooms) {
    if (isIndoor(r)) continue;
    const poly = r.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (edges.has(segKey(a, b))) continue;              // 与室内共边 → 已是外墙
      // 跳过与任何室内边共线重叠的边（如前院北缘与 F1 正立面）
      if (fenceEdges.some(e => segKey(e.a, e.b) === segKey(a, b))) continue;
      let overlapsIndoor = false;
      for (const ie of edges.values()) {
        if (overlap2D(a, b, ie.a, ie.b)) { overlapsIndoor = true; break; }
      }
      if (overlapsIndoor) continue;
      fenceEdges.push({ a, b });
    }
  }

  // ---------- 在边上开洞（统一米制：s 为沿边距离/米） ----------
  const cutOf = (edge, list, useSill) => {
    const cuts = [];
    const len = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]);
    for (const item of list) {
      const c = item.center;
      const [d, t] = projOnSeg(c, edge.a, edge.b);
      if (d < EPS && t > 0.02 && t < 0.98) {
        cuts.push({
          s: t * len,
          w: item.width,
          z0: useSill ? (item.sill ?? 0) : (c[2] ?? 0),
          z1: useSill ? (item.sill ?? 0) + item.height : (c[2] ?? 0) + item.height,
          kind: item.kind || 'window', passable: item.kind !== 'window',
          item,
        });
      }
    }
    return cuts.sort((x, y) => x.s - y.s);
  };

  const buildEdge = (edge, openings, wins, thick, mat, z0, z1) => {
    const cuts = [...cutOf(edge, openings, false), ...cutOf(edge, wins, true)]
      .sort((x, y) => x.s - y.s);
    const len = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]);
    const dx = (edge.b[0] - edge.a[0]) / len, dy = (edge.b[1] - edge.a[1]) / len;
    const yaw = Math.atan2(dy, dx);
    const addBox = (t0, t1, bz, bt, collide) => {
      if (t1 - t0 < 0.01 || bt - bz < 0.01) return;
      const L = t1 - t0;
      const bgeo = new THREE.BoxGeometry(L, bt - bz, thick);
      boxUVs(bgeo, L, bt - bz);
      const mesh = new THREE.Mesh(bgeo, mat);
      const midX = edge.a[0] + dx * (t0 + t1) / 2, midY = edge.a[1] + dy * (t0 + t1) / 2;
      mesh.position.set(midX, (bz + bt) / 2, -midY);
      mesh.rotation.y = yaw;
      scene.add(mesh);
      if (collide) {
        colliders.push({
          ax: edge.a[0] + dx * t0, ay: edge.a[1] + dy * t0,
          bx: edge.a[0] + dx * t1, by: edge.a[1] + dy * t1, half: thick / 2,
        });
      }
    };
    let cursor = 0;
    for (const c of cuts) {
      const t0 = Math.max(0, Math.min(len, c.s - c.w / 2));
      const t1 = Math.max(0, Math.min(len, c.s + c.w / 2));
      addBox(cursor, t0, z0, z1, true);                     // 洞旁实体墙
      addBox(t0, t1, z0, c.z0, true);                       // 窗下墙（也挡人）
      addBox(t0, t1, c.z1, z1, false);                      // 门楣/窗楣
      if (c.kind === 'window') {
        // 玻璃
        const gl = new THREE.Mesh(new THREE.BoxGeometry(t1 - t0, c.z1 - c.z0, 0.04), M.glass);
        const midX = edge.a[0] + dx * (t0 + t1) / 2, midY = edge.a[1] + dy * (t0 + t1) / 2;
        gl.position.set(midX, (c.z0 + c.z1) / 2, -midY);
        gl.rotation.y = yaw;
        scene.add(gl);
        colliders.push({                                    // 窗洞在 2D 上视为实体
          ax: edge.a[0] + dx * t0, ay: edge.a[1] + dy * t0,
          bx: edge.a[0] + dx * t1, by: edge.a[1] + dy * t1, half: thick / 2,
        });
      } else if (c.item && c.item.id === 'D00') {
        dynamic.gate = { edge, t0, t1, dx, dy, z0, z1 };
      }
      cursor = t1;
    }
    addBox(cursor, len, z0, z1, true);
  };

  const allOpen = [...g.openings, ...(g.boundary_openings || [])];
  for (const e of edges.values()) {
    const rs = e.rooms.map(id => rooms[id]);
    const z0 = Math.min(...rs.map(r => r.z));
    const z1 = Math.max(...rs.map(r => r.z + r.height));
    buildEdge(e, allOpen, g.windows, WALL_T, M.wallIn, z0, z1);
  }
  for (const e of fenceEdges) {
    buildEdge(e, allOpen, [], FENCE_T, M.fence, 0, 2.1);
  }

  // 院门网格（可开合）
  if (dynamic.gate) {
    const gt = dynamic.gate;
    const w = gt.t1 - gt.t0;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, gt.z1 - gt.z0, 0.08), M.wood);
    // 门轴设在洞的 t0 端：用 Group 平移旋转
    const pivot = new THREE.Group();
    const midX = gt.edge.a[0] + gt.dx * (gt.t0 + gt.t1) / 2;
    const midY = gt.edge.a[1] + gt.dy * (gt.t0 + gt.t1) / 2;
    pivot.position.set(gt.edge.a[0] + gt.dx * gt.t0, (gt.z0 + gt.z1) / 2, -(gt.edge.a[1] + gt.dy * gt.t0));
    mesh.position.set((w - 0.04) / 2, 0, 0);
    pivot.rotation.y = Math.atan2(gt.dy, gt.dx);
    pivot.add(mesh);
    scene.add(pivot);
    dynamic.gateGroup = pivot;
  }

  // ---------- 可锁门的临时碰撞（I2 锁 / 门闩 / 永不开放边界） ----------
  const LOCK_GATES = new Set(['I2', 'O5_side_bolt', 'inside_bolt', 'never_open']);
  const doorLocks = {};
  for (const o of g.openings) {
    if (!LOCK_GATES.has(o.gate)) continue;
    const c = o.center;
    let col;
    if (o.axis === 'X') {
      col = { ax: c[0] - o.width / 2, ay: c[1], bx: c[0] + o.width / 2, by: c[1], half: 0.08 };
    } else {
      col = { ax: c[0], ay: c[1] - o.width / 2, bx: c[0], by: c[1] + o.width / 2, half: 0.08 };
    }
    colliders.push(col);
    doorLocks[o.id] = { col, center: c, z: c[2] ?? 0, gate: o.gate };
  }

  // ---------- 楼梯 ----------
  const st = g.stair;
  const addSlab = (poly, zBase, zTop, mat = M.floorIn) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(
      Math.abs(poly[1][0] - poly[0][0]), zTop - zBase, Math.abs(poly[2][1] - poly[1][1])), mat);
    m.position.set((poly[0][0] + poly[1][0]) / 2, (zBase + zTop) / 2, -(poly[0][1] + poly[2][1]) / 2);
    scene.add(m);
  };
  // 两跑台阶（每跑 8 踏步 + 顶步并 入平台，连续坡度供行走）
  const lower = st.lower_flight.polygon;    // x -2.25..-0.25, y 0.8..1.95
  const upper = st.upper_flight.polygon;    // x -2.25..-0.25, y 2.05..3.2
  const stepMat = M.wood;
  for (let i = 0; i < 9; i++) {
    const z = 0.2 * (i + 1);
    const x1 = -0.25 - i * 0.25, x0 = x1 - 0.25;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, z, lower[2][1] - lower[1][1]), stepMat);
    m.position.set((x0 + x1) / 2, z / 2, -(lower[1][1] + lower[2][1]) / 2);
    scene.add(m);
  }
  for (let i = 0; i < 9; i++) {
    const z = 1.8 + 0.2 * (i + 1);
    const x0 = -2.25 + i * 0.25, x1 = x0 + 0.25;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, z - 1.8, upper[2][1] - upper[1][1]), stepMat);
    m.position.set((x0 + x1) / 2, (z + 1.8) / 2, -(upper[1][1] + upper[2][1]) / 2);
    scene.add(m);
  }
  addSlab(st.turning_landing.polygon, 1.7, 1.8);
  addSlab(st.upper_landing.polygon, 3.5, 3.6);
  // 楼梯井洞口：二楼地板 ShapeGeometry 已覆盖 S 上方 —— 移除 U 房地板会破洞，简化：灰盒阶段接受
  // （S 顶 U1 相接处由楼梯坡度解决）

  // ---------- 家具 ----------
  const kitMesh = (kit, pr) => {
    const [w, d, h] = pr.size;
    const mat = propMat(kit);
    if (/lamp|light/.test(kit.toLowerCase())) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.75, d), M.dark);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 0.25, d * 0.55),
        new THREE.MeshLambertMaterial({ color: 0xffe6b0, emissive: 0xffc866, emissiveIntensity: 1.4 }));
      bulb.position.y = h * 0.72;
      base.add(bulb);
      return base;
    }
    if (/street_lamp/.test(kit)) {
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h - 0.3, 8), M.dark);
      pole.position.y = (h - 0.3) / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xffe6b0, emissive: 0xffc866, emissiveIntensity: 2 }));
      head.position.y = h - 0.22;
      grp.add(pole, head);
      const pl = new THREE.PointLight(0xffc987, 26, 16, 2);
      pl.position.y = h - 0.3;
      grp.add(pl);
      return grp;
    }
    if (/cup|glass|bowl/.test(kit.toLowerCase())) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.033, 0.085, 12),
        new THREE.MeshLambertMaterial({ color: 0xf0ece2 }));
      m.position.y = 0.0425;
      return m;
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.y = h / 2;
    return m;
  };

  for (const sc of p.scenes) {
    for (const pr of sc.props) {
      const mesh = kitMesh(pr.kit, pr);
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.position.set(pr.position[0], pr.position[2], -pr.position[1]);
      grp.rotation.y = THREE.MathUtils.degToRad(pr.rotation_z_degrees || 0);
      scene.add(grp);
      if (pr.collision) {
        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        const fp = pr.footprint || (() => {
          const [w, d] = pr.size, cx = pr.position[0], cy = pr.position[1];
          return [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]];
        })();
        for (const [fx, fy] of fp) {
          minx = Math.min(minx, fx); maxx = Math.max(maxx, fx);
          miny = Math.min(miny, fy); maxy = Math.max(maxy, fy);
        }
        propBoxes.push({ minx, miny, maxx, maxy });
      }
      if (pr.kit === 'cup_on_mat' || /cup/.test(pr.kit)) dynamic.cup = grp;
    }
  }

  // ---------- 外部环境 ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240),
    new THREE.MeshLambertMaterial({ color: 0x3c4034 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  // 灯光基调：黄昏
  scene.add(new THREE.AmbientLight(0x8088a0, 0.5));
  scene.add(new THREE.HemisphereLight(0x445066, 0x2a2318, 0.5));
  const sun = new THREE.DirectionalLight(0xff9a5c, 0.7);
  sun.position.set(-30, 14, 18);
  scene.add(sun);

  scene.fog = new THREE.FogExp2(0x11141c, 0.016);
  scene.background = new THREE.Color(0x1a2030);

  // ---------- 行走高度 ----------
  const groundHeightAt = (bx, by, curY) => {
    // 楼梯优先（带楼层保护：只在接近的高度带生效，避免楼下穿行被"吸"上楼）
    if (curY < 2.1 && pointInPoly(bx, by, lower)) return Math.min(1.8, Math.max(0, (-0.25 - bx) / 2.0) * 1.8);
    if (curY > 1.4 && curY < 2.3 && pointInPoly(bx, by, st.turning_landing.polygon)) return 1.8;
    if (curY > 1.5 && pointInPoly(bx, by, upper)) return 1.8 + Math.min(1, Math.max(0, (bx + 2.25) / 2.0)) * 1.8;
    if (curY > 3.0 && pointInPoly(bx, by, st.upper_landing.polygon)) return 3.6;
    // 房间：取与当前高度最接近的候选层
    let best = 0;
    let bestD = Infinity;
    for (const r of g.rooms) {
      if (pointInPoly(bx, by, r.polygon)) {
        const z = isIndoor(r) ? r.z : 0;
        const d = Math.abs(z - curY);
        if (d < bestD) { bestD = d; best = z; }
      }
    }
    return best;
  };

  const roomAt = (bx, by, curY) => {
    let best = null, bestD = Infinity;
    for (const r of g.rooms) {
      if (pointInPoly(bx, by, r.polygon)) {
        const z = isIndoor(r) ? r.z : 0;
        const d = Math.abs(z - curY);
        if (d < bestD) { bestD = d; best = r.id; }
      }
    }
    return best;
  };

  return {
    rooms, colliders, propBoxes, lampRefs, dynamic, groundHeightAt, roomAt,
    stair: st, floorMeshes, doorLocks,
  };
}
