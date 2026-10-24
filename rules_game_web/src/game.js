// game.js —— 玩家控制、碰撞、交互与 N0–N1 剧情状态机
import * as THREE from 'three';
import { buildLevel, bp, pointInPoly } from './level.js';

// ---------- 载入数据（源文件带 BOM，需剥离） ----------
async function loadJSON(url) {
  const text = await (await fetch(url)).text();
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}
const [geo, plac] = await Promise.all([
  loadJSON('./data/geometry.json'),
  loadJSON('./data/placements.json'),
]);

// ---------- 渲染基础 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.12, 300);

const level = buildLevel(scene, geo, plac);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- UI 引用 ----------
const $ = id => document.getElementById(id);
const ui = {
  start: $('start'), hud: $('hud'), clock: $('clock'), objective: $('objective'),
  pollution: $('pollution'), prompt: $('prompt'), note: $('note'),
  noteTitle: $('note-title'), noteBody: $('note-body'), noteChoices: $('note-choices'),
  noteClose: $('note-close'), notes: $('notes'), notesList: $('notes-list'),
  fade: $('fade'), end: $('end'), endText: $('end-text'),
};

// ---------- 音效（WebAudio 合成敲门声） ----------
let actx = null;
function knockSound(soft = false) {
  if (!actx) return;
  const t = actx.currentTime;
  const g = actx.createGain();
  g.gain.setValueAtTime(soft ? 0.10 : 0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  const o = actx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(72, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.15);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + 0.2);
  // 木质瞬态
  const buf = actx.createBuffer(1, 2200, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const n = actx.createBufferSource();
  n.buffer = buf;
  const ng = actx.createGain();
  ng.gain.setValueAtTime(0.12, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  n.connect(ng).connect(actx.destination);
  n.start(t);
}

// ---------- 玩家 ----------
const EYE = 1.62, RADIUS = 0.32, SPEED = 2.8;
const player = { x: 2.0, y: -4.6, z: 0, yaw: Math.PI, pitch: 0, locked: false };
// blender yaw：0 = 朝北(+y)，玩家出生朝北看民宿

const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); toggleNotes(); }
  if (e.code === 'KeyE') onE();
  if (/^Digit[1-3]$/.test(e.code)) clickChoice(+e.code.slice(5) - 1);
});
addEventListener('keyup', e => keys[e.code] = false);

renderer.domElement.addEventListener('click', () => {
  if (gameStarted && !modalOpen && !player.locked) renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  player.locked = document.pointerLockElement === renderer.domElement;
});
addEventListener('mousemove', e => {
  if (!player.locked) return;
  player.yaw -= e.movementX * 0.0023;
  player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * 0.0023, -1.45, 1.45);
});

// ---------- 碰撞 ----------
// ox/oy 为本帧移动前的位置：当玩家中心恰好在墙线上（d≈0，普通推出失效）
// 时，用它判断应被推到墙的哪一侧，杜绝"卡进墙里自由穿行"。
function collide(px, py, ox, oy) {
  for (let iter = 0; iter < 8; iter++) {
    let moved = false;
    for (const s of level.colliders) {
      // 圆 vs 线段(半厚 half)
      const abx = s.bx - s.ax, aby = s.by - s.ay;
      const len2 = abx * abx + aby * aby;
      let t = len2 ? ((px - s.ax) * abx + (py - s.ay) * aby) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = s.ax + abx * t, cy = s.ay + aby * t;
      const min = RADIUS + s.half;
      // 越线守卫：本步从墙的一侧跨到另一侧（异常推出/传送等），弹回旧位置一侧
      if (ox !== undefined && len2 > 1e-9) {
        const nl = Math.sqrt(len2);
        const nx2 = -aby / nl, ny2 = abx / nl;
        const sNew = (px - s.ax) * nx2 + (py - s.ay) * ny2;
        const sOld = (ox - s.ax) * nx2 + (oy - s.ay) * ny2;
        const tRaw = ((ox - s.ax) * abx + (oy - s.ay) * aby) / len2;
        if (Math.abs(sNew) < min && sOld * sNew < 0 &&
            tRaw > -0.05 && tRaw < 1.05) {
          px += nx2 * (Math.sign(sOld) * min - sNew);
          py += ny2 * (Math.sign(sOld) * min - sNew);
          moved = true;
          continue;
        }
      }
      let dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy);
      if (d < min && d > 1e-6) {
        px += dx / d * (min - d);
        py += dy / d * (min - d);
        moved = true;
      } else if (d <= 1e-6) {
        // 中心正好在墙线上：沿法线推到「旧位置所在的一侧」
        const nl = Math.hypot(aby, abx) || 1;
        let nx2 = -aby / nl, ny2 = abx / nl;
        if (nx2 * (ox - cx) + ny2 * (oy - cy) < 0) { nx2 = -nx2; ny2 = -ny2; }
        px += nx2 * min;
        py += ny2 * min;
        moved = true;
      }
    }
    for (const b of level.propBoxes) {
      if (px > b.minx && px < b.maxx && py > b.miny && py < b.maxy) {
        // 完全在盒内：推向最近的边（固定 +x 会把人推进墙里）
        const dl = px - b.minx, dr = b.maxx - px;
        const db = py - b.miny, df = b.maxy - py;
        const m = Math.min(dl, dr, db, df);
        if (m === dl) px = b.minx - RADIUS;
        else if (m === dr) px = b.maxx + RADIUS;
        else if (m === db) py = b.miny - RADIUS;
        else py = b.maxy + RADIUS;
        moved = true;
        continue;
      }
      const cx = Math.max(b.minx, Math.min(px, b.maxx));
      const cy = Math.max(b.miny, Math.min(py, b.maxy));
      let dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy);
      if (d < RADIUS && d > 1e-6) {
        px += dx / d * (RADIUS - d); py += dy / d * (RADIUS - d);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [px, py];
}

// ---------- 定时器（游戏时钟驱动） ----------
const timers = [];
function after(sec, fn) { timers.push({ t: clockNow() + sec, fn }); }
const clockNow = () => performance.now() / 1000;

// ---------- 剧情状态 ----------
const S = {
  phase: 'boot', clock: '17:40', clockSub: '黄昏 · 十月二十一日',
  pollution: 0, notes: [],
  orderSeen: false, gateOpen: false, enteredF1: false, registerRead: false,
  hotInfo: false, cupSeen: false, cupMoved: false,
  luggage: false, lampOn: false, windowLook: false,
  hotTried: false, r1Read: false, indicatorSeen: false,
  knocking: false, knockDone: false, crossed: false, finished: false,
  // N2–N4
  r3read: false, i1: false, r4read: false, streetChecked: false,
  i2: false, safePower: false, r2read: false,
  knockRound: 0, n3Retreated: false,
  n4step: 0, ringing: false, phoneVerified: false, cupNoted: false,
  // N5–N8 + 里线
  floor: 0, r5read: false,
  anchorPlate: false, anchorRail: false, loopIdentified: false, loopResolved: false, n5Warned: false,
  i3: false, d6read: false, ditchSeen: false, treeSeen: false, routeReturned: false, o1GateChecked: false,
  wMode: false, curtainPulled: false, curtainSealed: false, lightSafe: false, finalChecked: false,
  dawnReached: false, morningGround: false, morningDitch: false, e1Done: false, historyEntered: false,
  s3step: 0, mirrorOwned: false, mirrorPast: false, mirrorLimit: false, wallCompared: false,
  thresholdAligned: false, historyReady: false, doors: {},
};
let gameStarted = false;
let modalOpen = false;
let currentRoom = null;
let objective = '';

function setClock(t, sub) { S.clock = t; if (sub) S.clockSub = sub; renderHUD(); }
function setPhase(p) { S.phase = p; }
function setObjective(t) { objective = t; renderHUD(); }
function renderHUD() {
  ui.clock.innerHTML = `${S.clock}<small>${S.clockSub} · ${roomName(currentRoom)}</small>`;
  ui.objective.textContent = objective;
  ui.pollution.textContent = `污染 ${S.pollution}`;
}
function roomName(id) {
  if (!id) return '';
  const r = level.rooms[id];
  return r ? r.name || id : id;
}
function addNote(title, body) {
  S.notes.push({ title, body, clock: S.clock });
}
// ---------- 污染（含阶段下限） ----------
function pollute(d) {
  S.pollution = d > 0
    ? Math.min(99, Math.max(S.floor, S.pollution + d))
    : Math.max(S.floor, S.pollution + d);
  renderHUD();
}

// ---------- 纸张弹层 ----------
function showNote({ title, body, choices = null, onClose = null, html = null }) {
  modalOpen = true;
  ui.noteTitle.textContent = title;
  if (html) {
    ui.noteBody.innerHTML = html;
    ui.noteBody.classList.add('mirror');
  } else {
    ui.noteBody.textContent = body;
    ui.noteBody.classList.remove('mirror');
  }
  ui.noteChoices.innerHTML = '';
  ui.noteClose.style.display = choices ? 'none' : 'block';
  if (choices) {
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.dataset.k = i + 1;
      b.onclick = () => { hideNote(); c.fn && c.fn(); };
      ui.noteChoices.appendChild(b);
    });
  }
  ui.note.style.display = 'flex';
  ui.note._onClose = onClose;
  if (document.pointerLockElement) document.exitPointerLock();
}
function clickChoice(i) {
  if (!modalOpen) return;
  const b = ui.noteChoices.children[i];
  if (b) b.click();
}
function hideNote() {
  modalOpen = false;
  ui.note.style.display = 'none';
  const cb = ui.note._onClose;
  ui.note._onClose = null;
  if (cb) cb();
}
function toggleNotes() {
  if (!gameStarted) return;
  const show = ui.notes.style.display !== 'block';
  ui.notes.style.display = show ? 'block' : 'none';
  if (show) {
    ui.notesList.innerHTML = S.notes.length
      ? S.notes.map(n => `<div class="item"><i>${n.clock} · ${n.title}</i>${n.body}</div>`).join('')
      : '<div class="empty">（还没有记录）</div>';
  }
}

// ---------- 交互点 ----------
const interactables = [];
function addInt(x, y, z, label, cond, act, r = 2.1) {
  interactables.push({ pos: new THREE.Vector3(x, z, -y), label, cond, act, r });
}

// 自建小物件：餐桌上的杯子（F3 低强度异常）
const cupGrp = new THREE.Group();
{
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.09, 14),
    new THREE.MeshLambertMaterial({ color: 0xf0ece2 }));
  cup.position.y = 0.045;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 14, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0xf0ece2 }));
  handle.position.set(0.045, 0.045, 0);
  handle.rotation.y = Math.PI / 2;
  cupGrp.add(cup, handle);
  const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.008, 16),
    new THREE.MeshLambertMaterial({ color: 0x9a7d55 }));
  coaster.position.y = 0.004;
  cupGrp.add(coaster);
}
cupGrp.position.set(6.5, 0.79, -6.0);
scene.add(cupGrp);

// U2 床头灯（可开关）
const lampGrp = new THREE.Group();
const lampBulbMat = new THREE.MeshLambertMaterial({ color: 0x554433, emissive: 0x000000 });
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.03, 10), M_dark());
  base.position.y = 0.015;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), M_dark());
  stem.position.y = 0.13;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.11, 12, 1, true), lampBulbMat);
  shade.position.y = 0.28;
  lampGrp.add(base, stem, shade);
  const pl = new THREE.PointLight(0xffd9a0, 0, 5, 2);
  pl.position.y = 0.3;
  lampGrp.add(pl);
  lampGrp.userData.light = pl;
  lampGrp.position.set(-2.35, 3.6 + 0.52, 1.18); // nightstand 顶
  scene.add(lampGrp);
}
function M_dark() { return new THREE.MeshLambertMaterial({ color: 0x3a3833 }); }

// 手机照明（停电时可用，挂在相机上）
const phoneLight = new THREE.PointLight(0xcfd8ff, 0, 5, 2);
phoneLight.position.set(0.15, -0.12, -0.3);
camera.add(phoneLight);
scene.add(camera);

// ---------- 剧情文本 ----------
const TXT = {
  order: `【手机订单】\n\n十月二十一日 · 一号客房（U2）· 自助入住 · 今晚仅此一单。\n\n房东留言：门钥匙在玄关西侧收纳台的抽屉里。热水若不热，先看厨房墙上贴的说明。其余客房今日空置，请勿打扰。\n\n——信号：仅此一条，之后发送一直转圈。`,
  register: `【入住册 · 维护页 D0】\n\n今晚登记：一号客房，一位客人。\n\n维护页：热水异常请查看厨房说明。应急钥匙在服务廊电箱旁。其余客房今日空置。\n\n（册页边缘有反复翻动的旧折痕。）`,
  hotInfo: `【厨房 · 热水控制说明】\n\n热水由厨房热水器集中供给。若各处不出热水：先看热水器面板的指示灯。\n\n指示灯灭＝公共照明同一路断路；指示灯亮而水冷＝等两分钟再试。\n\n（纸角被人用铅笔点过一个重重的点。）`,
  cupA: `【餐桌】\n\n一只白瓷杯端端正正放在杯垫的正中央。茶是凉的，像是放了很久。`,
  cupB: `【餐桌】\n\n杯子从杯垫中央偏到了边缘——你刚才明明看到它在正中。\n\n（低强度异常 · 已记录）`,
  windowU2: `【窗外 · U2】\n\n南侧是民宿的前院门廊：院墙、院门、路灯。街对面偶尔有车灯扫过。\n\n厨房的排风口在楼下短廊的另一侧。一切都在它该在的位置上。\n\n（手机上的时间比走廊挂钟快一分钟。）`,
  r1: `【便笺 R1 · 压在入住册下】\n\n「夜里有人敲门，不要开。先留在屋里。」\n\n——林远\n\n（纸边整齐，比夹层里更旧的碎纸新得多。字迹稳定，是认真写下给人看的。）`,
  indicator: `【热水器面板】\n\n指示灯不亮。再看电闸箱方向——公共照明也灭了半边。\n\n和说明上写的一致：这是同一路故障，去服务廊的电箱就能复位。\n\n（你想起便笺上的话。夜里。不要开。）`,
  clip: `【入住册 · 新露出的一行】\n\nR1 这一次有效。门外已经恢复：花砖变回水泥地，车声回来了。\n\n在旧纸的下方，还有一行更小的字：\n\n「那次门外恢复了。次数不能决定一切。」\n\n（你把纸放回册页间。就在这时，公共灯灭了。）`,
  // ---------- N2 ----------
  r3: `【窗边旧纸 R3 · F5】\n\n「停电后别把灯打开。」\n\n——早期住客\n\n（字迹比林远的旧。没有写为什么，也没有写当时的窗和外面是什么样子。你想起便笺上那句话：夜里，有人敲门，不要开。可现在停的是灯——一样的选择吗？）`,
  i1: `【F6 · 门边应急架】\n\n一支小手电，电量充足。自动低位照明，不刺眼。\n\n（获得：I1 小手电 · 已入行囊。灯灭时，它和手机一样安全——你现在可以自己判断这一点了。）`,
  r4: `【电箱旁 · 整理页 R4】\n\n「走廊灯灭了，先恢复照明，再找回房间。」\n\n——林远\n\n（和 R3 正好相反。两个人都遇到过黑暗，做法却对不上。谁的条件和你现在一样？先核对，再动手。）`,
  street: `【F1 正门 · 观察位】\n\n你把门开到观察位，只看不动。\n\n前院路灯亮着，灯下排水沟的砖沿清晰。远处有车声驶过。\n\n——这是现代的院子。停电只是停电，门外没有变。（证据一：外部照明与声景仍是 M。）`,
  breakerLock: `【配电箱 · F8】\n\n箱盖锁着。锁孔是服务钥匙规格。\n\n旁边的现代标签还在：「生活照明 / 热水器 —— 同一路」。\n\n（证据二：这是现代配电箱的正规标签，不是旧物。需要服务钥匙开盖。应急钥匙盒就在旁边墙上。）`,
  breakerReset: `【配电箱 · 复位】\n\n钥匙转动，箱盖打开。跳闸的只有一只开关：生活照明。\n\n你把它拨回去。\n\n室内低位灯次第亮起，热水器控制恢复工作。窗外没有变化，路灯仍亮。\n\n——R3 说别开灯，R4 说先恢复照明。你核对过两个时代，也核对过门外。这里是你自己的现代电路。\n\n（safe_power 已确立。获得：I2 服务钥匙圈 · 永久持有。）`,
  curtain: `【窗帘内衬 D1 · F5 窗边】\n\n你把现代窗帘的背面翻开：内衬上贴着一行旧字，还有几个旧钉孔。\n\n「不是屋里不能亮。外面黑下去的时候，光别漏出去。我把这句抄短了，差点害了自己。」\n\n——早期住客\n\n（她纠正过自己：R3 少写了窗线与外部状态。这个动作不增加污染。）`,
  // ---------- N3 ----------
  r2: `【门边旧抽屉 R2 · F1】\n\n「第三回敲完，我打开了门，走廊恢复了。」\n\n——早期住客\n\n（纸更旧，边缘发脆。和 R1 冲突：一个说别开，一个说第三回开了就好。两次记录的条件不同——你只能核对现场。）`,
  round1: `【门缝 · 第一轮】\n\n门内：现代木地板，廊灯稳定。\n门外：水泥地、花砖边缘、路灯、车声——全都正常，都还是 M。\n\n敲门声不轻不重，像住客半夜回来忘了带钥匙。\n\n（两项证据都是现代。第一轮，门是连续的。）`,
  round2: `【门缝 · 第二轮】\n\n门内：还是你的走廊。\n门外：水泥地不见了——旧砖、遮光帘、一盏旧灯泡的光。远处没有车声，只有一种持续的、旧时代夜晚的安静。\n\n（门内 M，门外 W。这一次，门槛两侧不一致。）`,
  round3: `【门缝 · 第三轮】\n\n门框在现代木与旧木之间错接，砖缝断开，接缝像两张纸没有对齐。\n\n同一句脚步声在原地重复——不是有人走来，是同一段声音在播放。\n\n（数量对上了 R2：第三回。但 R2 说开了就恢复——现场却明显不连续。次数不是原因。）`,
  roundDone: `【先看门槛 · A24】\n\n你关上门，退回客厅。\n\n三回敲门，三次现场：第一次连续，第二次门外换了时代，第三次连门框都错接了。次数一格一格涨，门却越来越不连续。\n\n旧纸旁的小字：「那次门外恢复了。」\n\n——恢复的原因是她开门的时机，还是那晚本来就会恢复？R2 没有写。你记下了：先看门槛，次数不能决定。\n\n（N3 完成。故事钟走向 00:10。）`,
  retreatEarly: `【留在客厅 · 听完剩下的轮次】\n\n你不再靠近正门，坐在客厅里听完。\n\n第二声。第三声。每声之间隔着一段固执的安静。\n\n最后，你趁门关着时看了一眼残留的证据：门框下沿，现代木与旧木的错接砖缝还在。\n\n（你用更保守的方式完成了同等观察。R2 的答案仍然只能由现场给出：次数不能决定。）`,
  crossWarn: `【错位】\n\n你跨出门槛半步——\n\n脚下既不是木地板也不是完整的旧砖。身后的门还在，但门框的位置似乎和你记得的差了一拳。远处多出一道不该有的门框轮廓。\n\n你退回门内。警告：这是第二次危险承诺（+8）。\n\n（观察不触发危险。是跨越触发的。）`,
  // ---------- N4 ----------
  r5: `【电话底座旁 · 旧便笺 R5 · U6】\n\n「我跟着那个女人的声音，找到了电话旁的房间。」\n\n——早期住客\n\n（桌上电话是实体转盘机，话筒连着螺旋线。铃还响着。先看纸，再决定拿不拿。）`,
  call: `【听筒 · 8 秒片段】\n\n「……电话是不是又断了？」\n\n是一个年轻女人的声音，短促、日常，像是从隔壁房间随口问出来的。背景里有杯碟轻碰的细响。\n\n然后是拨号音缺失的空白。八秒，结束。\n\n（铃锤、杯碟、声音——在铃响时是同步的。你握着听筒，把这一段完整听完。）`,
  hangup: `【放回听筒】\n\n你把听筒搁回叉簧。铃锤停了。\n\n两秒后——\n\n「……电话是不是又断了？」\n\n同样的短句。同样的杯碟细响。但它不在听筒里，它从 U1 短廊的深处传来，而桌上电话一动不动。\n\n（你核对过一次无源重复：声音是真的，发声的地方却没有这个人。phone_verified。）`,
  phoneQuiet: `【电话已安静】\n\n你再看电话：铃锤不动，杯碟没有声音。\n\n刚才那一遍，不从这里来。`,
  corridor: `【U1 门口 · 朝短廊深处观察】\n\n你站在 U1 靠楼梯的门口，朝短廊深处看。\n\n设备停止，声音仍在别处——两项事实同时成立。走廊尽头的门牌、栏杆、地板缝，现在都还老实待在原位。\n\n（C5 已建立。N5 的重复走廊尚未实装——你已站在它的入口。）`,
  // ---------- N5 ----------
  r7: `【U6 门边 · 通路示意与 R7 摘录】\n\n早期住客写的是具体路线：「从电话厅南门出来，沿楼梯上口木栏杆与地板缝回到 S。」\n\n不是抽象的「连续左转」——是两样看得见摸得着的东西：栏杆，和一条地板缝。\n\n（你先核对这两样，再决定往哪边走。）`,
  plate: `【中段门牌】\n\n同一块「二号房」门牌，出现在中段门框上——而真正的 D22 二号房门还在走廊尽头，门牌也在。\n\n两个门牌，一间房。（锚点一）`,
  rail: `【楼梯上口 · 木栏杆与地板缝】\n\n木栏杆在这里，地板缝也从这里延伸向 S——它们还在楼梯这一侧，和 R7 写的一样。\n\n但中段那扇复制门框，怎么都接不上这条缝。（锚点二）`,
  loopFound: `【比较两项 · A32】\n\n门牌复制了，栏杆和地板缝没有复制。重复门框悬在半空，和任何真实地标都对不上。\n\n你退回 U6——电话桌还在原位。从这里经 U8 阳台绕行，可以完全避开这段短廊。（loop_identified · -8）`,
  n5warn: `【错位短廊】\n\n你往深处走了几步——同一段走廊开始重复。脚下地板的接缝和三步前一样。\n\n身后 U6 的门还在，还亮着。（+8 · 第一次警告。退回 U6 是安全的。）`,
  x4hint: `记号重复了，但窗/树与路的关系已经改变。`,
  // ---------- N6 ----------
  d7: `【F10 · 林远的录音 I3 与外圈图】\n\n桌上一台旧录音机，标签写着：「我叫林远。如果你已经走到这里，先记住来路。经过后院，沿侧巷到有树的院子，从洗衣间那边回前院。别只看箭头。二号房有更早的记录，我照着走过，有些有用，有些少写了条件。天亮以后再看院门。」\n\n墙上钉着外圈示意图：F8→F9→O5→O4→O3→O2→F5。（获得：I3 录音机 · C6 已建立）`,
  d6: `【F4 书房 · 整理页 D6】\n\n「我试过街角，也走回过院门。先别把箭头当路。看树和水沟是不是还在两边，回到客厅再等。天亮后我确认过，沟沿接到了街灯底下，门外已经可以走了。先把屋里的位置守住，外面的路接上了，才算能走。」\n\n——林远（自动抄入笔记）`,
  ditch: `【O3 · 排水沟】\n\n排水沟沿着侧巷向北，流向有树的院子（O4）。水沟是连续的，沟沿在墙根清晰可辨。\n\n（事实记录：正常关系——沟由侧巷流向树院。）`,
  tree: `【O4 · 树与沟沿】\n\n树在近墙一侧，根沿墙根铺开；排水沟沿在相对一侧，连接侧巷方向。\n\n墙上有个箭头，指向前方小院的门（O5）。\n\n——但东墙上还有一扇门，门面上画着同一个箭头，朝向围挡（O6）。（树根与沟沿都和那扇门对不上。）`,
  fakeDoor: `【假门 · 朝 O6 的门面】\n\n门面是后来贴上去的：箭头崭新，门缝里的砖和两边墙不接。\n\n树不在它旁边，沟也不从它下面过。`,
  fakeCross: `【你跨了进去】\n\n半步之后脚下就断了：门里是 O6 一侧的静态错位景，砖缝、沟沿、树影全都对不上这扇门。\n\n你能退回来。身后的 O4 院子清晰可见。（+8 · 首次警告）`,
  bolt: `【O5→O1 · 门闩】\n\n你拔开门闩，推开后勤小院的门——前院就在眼前，位置和楼上看到的完全一致。\n\n（route_returned=true · -8。外圈走通了。）`,
  o1gateN6: `【O1 · 院门外（核对）】\n\n你把脸凑近院门缝：门外的排水沟凭空中断，沟沿不接路灯的方向；路灯底座旁边——还有一个路灯底座。\n\n即使样式完全是现代的，这也不是安全出口。（A40 · 事实记录）`,
  // ---------- N7 ----------
  sofaWait: `【F2 · 沙发】\n\n你按林远的方法坐下来：先把屋里的位置守住。\n\n1 秒暗转——脚下已经是旧木地板。客厅、玄关、餐厅连成连续的旧时生活区：遮光的帘、暗下来的灯、外部沉下去的街声。\n\n（C7 已建立 · 进入 N7。R3 与 R4 现在是真正的选择。）`,
  curtain: `【F3 · 餐厅窗帘】\n\n厚帘开着。窗外：路灯消失了，远处只有旧遮光帘的痕迹和微弱的室外天光。\n\nA43：先拉合窗帘。`,
  curtainSealed: `【窗帘 · 已拉合】\n\n你检查下摆：两个固定漏缝——一个在右下角。你把搭扣压好。\n\n窗线不再透光。（curtain_sealed=true。旧钉孔和 D1 记录的是同一个位置。）`,
  lampWarn: `【台灯 · 亮了】\n\n你拨亮台灯——窗帘没拉严，窗线上立刻显出一道亮带。\n\n墙上还留着旧日的固定警告痕：有人为此付出过代价。（+8 · 警告。关灯或合帘都能解除。）`,
  lampSafe: `【台灯 · 光被窗线挡住了】\n\n台灯的光只落在客厅和玄关，窗线外一片暗。\n\n窗帘完整、灯亮而不漏光。R3 的条件补齐了：不是不能亮，是不能让光漏出去。（light_safe=true · -8）`,
  a46: `【A46 · 林远的声音副本】\n\nF1 外传来林远录音里「二号房」的同一句话。\n\n你查看 I3：录音机的播放指示不亮——设备是安静的。声音来自玄关外。\n\n（录音内容听着像他，不等于他在说话。）`,
  finalCheck: `【F1 · 门框与门外地面（最终核对）】\n\n门内：旧木地板，W。门外：拼着现代门廊的地面，M。\n\n局部材质与窗线都不连续。你没有追声开门——关好观察门。\n\n（final_boundary_checked=true。忽略声音的身份，完成最终判断。）`,
  dawn: `【等待】\n\n窗帘完整，灯亮而不漏光，玄关门已关并已核对，没有活动的警告。\n\n你坐回沙发，留在这里。\n\n2 秒淡黑——05:50。三个节点同时恢复 M。窗帘还是那幅窗帘，只是外面天亮了。（dawn_reached · 进入 N8）`,
  // ---------- N8 / 结局 ----------
  morning: `【清晨 · 门内外（A49）】\n\n你蹲下来看：门内外地面连续，排水沟一路接到真实的路灯底座，沟沿没有中断，路灯只有一盏。\n\n有与街景相符的声源：早班车的声音由远及近。（C8 已建立 · 两项连接已核对）`,
  leaveConfirm: `【O1 · 院门】\n\n门外：连续的沟沿，真实的路灯，普通的清晨街道。\n\n要离开这里吗？`,
  epiWake: `【06:10 · U2】\n\n你在自己的床上醒来。手机日期是次日。普通床品，现代城市声。\n\n你记得经历的一切。\n\n（尾声：行李还在长凳下。收拾好，从正门离开这个普通的民宿。）`,
  // ---------- 里线 H2–H6 ----------
  d2: `【U3 · 桌面 D2/R7 原稿】\n\n「电话响的时候，桌边的杯子也在动。后来声音换到走廊，杯子没再动。我却还是跟了过去。」\n\n旁边是 R7 的原始稿：从电话厅南门出来，沿楼梯上口木栏杆与地板缝回到 S——当时真的能走。\n\n一杯早已干涸的水。整理好却没带走的小旅行包。`,
  d3: `【U3 · D3 · 桌面折页背面】\n\n「那面镜子照出的柜子不在这里。我拿它找路，走回来的次数越来越多。镜子放在楼梯下，抽屉比外面看起来浅。先放下它，再看脚下。」\n\n门边铅笔线：三条以同一扇窗为起点、却互相重叠的短路线。桌面上留着三份同一句地址的抄写，字迹一次比一次不稳。\n\n（她记录了镜子存放的确切位置：楼梯下的换鞋凳，下层抽屉，「第二挡」。）`,
  h3a: `【下层抽屉】\n\n你拉开换鞋凳的下层抽屉：第一眼只有一块擦鞋布。\n\n但抽屉的内外深度不一样——外面看是浅的，里面还有空间。（D3 没写错。）`,
  h3b: `【右侧木挡】\n\n抽屉右内侧有一道木挡。按下去，一声轻响。`,
  h3c: `【第二挡】\n\n抽屉拉到第二挡——暗格露出来。\n\n里面是一面旧手镜，金属背壳有摩擦痕，随附一页折起的纸。`,
  d4: `【D4 · 随镜子的林远末页】\n\n「她把镜子留在这里。我用过，仍放回原位。门的位置记住以后，不必带着它进去。天亮时院门外的路已经接上了。我本来可以走。」\n\n背面画着三处位置：书房旧柜 · 原主卧梳妆台 · 楼梯下这面墙。\n\n（他本来可以走——这是里线第一次确认的事实。获得：I4 旧手镜。）`,
  v1: `【V1 · 书房旧柜位】\n\n你站到地板的矩形磨痕旁，把镜子对准旧柜位。`,
  v1old: `镜中是一只尚未拆除的旧书柜，柜脚落在两处压痕上，柜背贴着墙上那块较浅的矩形印。`,
  v1now: `现实里：现代书桌，外露的墙面。地上有两处柜脚压痕，墙上有一块较浅的矩形印——和镜中书柜的脚与背完全对应。`,
  v1done: `镜中的柜子已经拆掉，地面还留着它的痕迹。（mirror_past_verified=true。D4 的第二处位置：原主卧梳妆台。）`,
  v2old: `镜中：一把空椅子，窗上钉着遮光布，墙上有一扇过去存在的窄门。椅子上没有人，只有一小段与已知句子相同的生活回放。`,
  v2now: `现实：窄门的方向是完整外墙，墙脚与窗台连续。镜中窗下的旧地板缝，与现实窗台方向不相接。`,
  v2done: `过去的门存在过，不代表现在能走。（mirror_limit_verified=true。D5 写着楼梯下的补缝——D4 的第三处。）`,
  d5: `【D5 · 梳妆台背缘 · 林远补写】\n\n「镜中那张椅子一直空着。电话响过，人没有回来。我想知道她等到了没有。楼梯下面那道补缝，不在旧墙上。」\n\n——他主动选择了进一步查看。`,
  v2cross: `【贴墙一步】\n\n你朝镜中窄门的方向迈了一步——脚下线条与墙面断接，这只是一步深的预览，身后 U5 还在。（+8 · 警告。退回安全。）`,
  v3a: `【V3 · 楼梯墙 · 补缝】\n\n踢脚线有一道接缝，墙面有一片补漆边——两项实体痕迹确认这里曾经改造过。\n\n补缝对面就是换鞋凳。`,
  v3old: `镜中旧景没有这块补漆。那里是一扇门——门框下缘，正好对应现实的接缝。`,
  v3need: `轮廓仍在两层墙之间重叠，脚下也没有接上。（还缺：${''}`,
  v3aligned: `你沿门框轮廓检查了两个固定点——现实表层显出旧门。门内 W，站立的平台此刻仍 M。\n\n你选择留在平台，核对门槛：短暂暗转后，站立处地砖与灯影一起回到 W。门内外砖缝相接，光源方向一致。\n\n（threshold_aligned=true · history_ready=true。入口资格已保存。）`,
  histOpen: `【历史门 · 观察位】\n\n门内是 W：旧灯、旧墙、一段安静的走廊。站立的平台与门内，砖缝相接，灯影一致。\n\n这门后是什么，没有说明。`,
  histEnter: `【继续探查这栋房子的过去。当前版本到此结束。】\n\n你跨过门槛。旧灯亮起，电话声响起——六秒以内，一切沉入黑暗。\n\n（第一夜结束 · 历史入口已找到）`,
  doorLocked: `门锁着。锁孔是服务钥匙规格。`,
  doorBolt: `门从另一侧闩着。`,
};

// ---------- 注册交互点 ----------
addInt(2.3, -4.9, 1.35, '手机 · 查看订单', () => !S.orderSeen, () => {
  S.orderSeen = true;
  addNote('手机订单', TXT.order.split('\n\n').slice(1).join('\n\n'));
  showNote({ title: 'A01 · 手机订单', body: TXT.order, onClose: () => {
    if (S.phase === 'boot') { setPhase('A01gate'); setObjective('打开院门，走进民宿。'); }
  }});
});
addInt(1.8, -5.7, 1.25, '院门', () => S.orderSeen && !S.gateOpen, () => {
  S.gateOpen = true;
  if (level.dynamic.gateGroup) {
    const g0 = level.dynamic.gateGroup.rotation.y;
    const turn = () => {
      level.dynamic.gateGroup.rotation.y -= 0.05;
      if (level.dynamic.gateGroup.rotation.y > g0 - Math.PI / 2) requestAnimationFrame(turn);
    };
    turn();
  }
  setPhase('A01walk');
  setObjective('穿过前院，走进玄关（F1）。');
});
addInt(6.65, 2.68, 0.85, '入住册', () => {
  return (S.enteredF1 && !S.registerRead) || S.phase === 'N1b' || S.phase === 'N1f';
}, () => {
  if (S.phase === 'N1b') {
    S.r1Read = true;
    addNote('R1 · 夜里有人敲门，不要开', '「夜里有人敲门，不要开。先留在屋里。」——林远');
    showNote({ title: 'A08 · 册后便笺', body: TXT.r1, onClose: () => {
      setPhase('N1c');
      setObjective('按说明：到厨房（F5）查看热水器指示灯。');
    }});
  } else if (S.phase === 'N1f') {
    showNote({ title: 'A12 · 夹页', body: TXT.clip, onClose: () => startN2() });
  } else {
    S.registerRead = true;
    addNote('入住册 · 维护页 D0', TXT.register);
    showNote({ title: 'A02 · 入住册与维护页', body: TXT.register, onClose: () => {
      if (S.phase === 'A02' || S.phase === 'A01walk') {
        setPhase('A03');
        setObjective('熟悉一楼：餐厅 F3 · 厨房 F5 热水说明 · 书房 F4 · 服务廊 F8。');
      }
    }});
  }
});
addInt(1.0, 6.15, 1.45, '热水控制说明', () => S.enteredF1, () => {
  S.hotInfo = true;
  addNote('热水控制说明', TXT.hotInfo);
  showNote({ title: 'A03 · 厨房墙上的说明', body: TXT.hotInfo });
});
addInt(6.5, 6.0, 1.0, '桌上的杯子', () => true, () => {
  showNote({ title: 'A03 · 餐桌', body: S.cupMoved ? TXT.cupB : TXT.cupA });
  if (S.cupMoved && !S.cupNoted) {
    S.cupNoted = true;
    addNote('低强度异常 · 杯子偏移', '离开餐厅再回来时，杯子从杯垫中央偏到了边缘。');
  }
  if (!S.cupSeen) S.cupSeen = true;
});
addInt(0.8, 6.05, 1.2, '热水器指示灯', () => S.phase === 'N1c', () => {
  S.indicatorSeen = true;
  showNote({ title: 'A09 · 热水指示灯', body: TXT.indicator, onClose: () => {
    setPhase('N1d');
    setObjective('回客厅（F2）确认。');
  }});
});
// U2 三件事
addInt(0.55, -1.58, 4.25, '放行李', () => S.phase === 'A04' && !S.luggage, () => {
  S.luggage = true;
  showNote({ title: 'A04 · 放行李', body: '行李箱推进长凳下的空档，正好。\n\n（这个房间像是早就等着有人来住。）', onClose: () => u2check() });
});
addInt(-2.35, -1.0, 4.35, '床头灯', () => S.phase === 'A04' && !S.lampOn, () => {
  S.lampOn = true;
  lampBulbMat.emissive.setHex(0xffc866);
  lampBulbMat.emissiveIntensity = 1.2;
  lampGrp.userData.light.intensity = 4;
  showNote({ title: 'A04 · 开床头灯', body: '暖黄的光落在床头。窗外黄昏正在退潮。', onClose: () => u2check() });
});
addInt(-1.4, -3.05, 4.55, '看窗外', () => S.phase === 'A04' && !S.windowLook, () => {
  S.windowLook = true;
  addNote('窗外 · U2', '南侧前院门廊、院墙与院门方向；厨房在房门外短廊的另一侧。手机比走廊钟快一分钟。');
  showNote({ title: 'A04 · 窗外', body: TXT.windowU2, onClose: () => u2check() });
});
function u2check() {
  if (S.luggage && S.lampOn && S.windowLook) {
    setPhase('A06');
    saveC('C0');
    setObjective('入住完成（C0）。选择「休息一会儿」。');
  }
}
addInt(-3.25, -2.0, 4.35, '休息一会儿', () => S.phase === 'A06', () => {
  setPhase('resting');
  setObjective('');
  ui.fade.style.opacity = 1;
  after(2.0, () => {
    setClock('20:30', '夜');
    ui.fade.style.opacity = 0;
    setPhase('N1a');
    setObjective('睡不着。去 U7 卫浴间再试一次热水。');
  });
});
addInt(5.42, -1.15, 4.6, '热水龙头', () => S.phase === 'N1a', () => {
  S.hotTried = true;
  showNote({ title: 'A07 · 再试热水', body: '水是冷的。\n\n和楼上楼下所有水嘴一样冷。目标已经在脑子里成形：查清楚这栋房子的热水到底怎么了。', onClose: () => {
    setPhase('N1b');
    setObjective('回客厅（F2）——入住册的册页间好像露出了什么。');
  }});
});
addInt(1.8, 0.45, 1.25, '查看门缝', () => S.phase === 'N1e' || S.phase === 'N1cross' || S.phase === 'N3door', () => {
  // ----- N3 三轮敲门 -----
  if (S.phase === 'N3door') {
    const R = S.knockRound;
    if (R === 1) {
      showNote({ title: 'A21 · 门缝 · 第一轮', body: TXT.round1, choices: [
        { label: '继续听第二轮', fn: () => { S.knockRound = 2; after(2.0, () => knockSound()); } },
        { label: '不再靠近，退回 F2（听完剩余轮次）', fn: () => retreatToLivingRoom() },
      ]});
    } else if (R === 2) {
      showNote({ title: 'A22 · 门缝 · 第二轮', body: TXT.round2, choices: [
        { label: '继续听第三轮', fn: () => { S.knockRound = 3; after(2.0, () => knockSound()); } },
        { label: '跨出门槛', fn: () => crossInN3() },
        { label: '不再靠近，退回 F2（听完剩余轮次）', fn: () => retreatToLivingRoom() },
      ]});
    } else {
      showNote({ title: 'A23 · 门缝 · 第三轮', body: TXT.round3, choices: [
        { label: '关门，退回 F2', fn: () => {
            showNote({ title: 'A24 · 先看门槛', body: TXT.roundDone, onClose: () => startN4() });
          } },
        { label: '跨出门槛', fn: () => crossInN3() },
      ]});
    }
    return;
  }
  // ----- N1 首敲 -----
  showNote({
    title: 'A10 · 门缝对照',
    body: '你把门开到观察位。\n\n门内：现代木地板，鞋柜在原位，廊灯亮着。\n门外：旧花砖一路延伸到院子里——路灯灭了，车声消失了。\n\n门槛两侧，不是同一个院子。两项证据同时成立。',
    choices: [
      { label: '保持门关闭，退回客厅（F2）', fn: () => {
          setPhase('N1keep');
          setObjective('退回 F2，等最后一声音响。');
          after(2.0, () => {
            knockSound(true);
            S.knockDone = true;
            setPhase('N1f');
            setObjective('回 F2 查看夹页的新一行。');
          });
        } },
      { label: '跨出门槛', fn: () => {
          pollute(8);
          S.crossed = true;
          setPhase('N1cross');
          ui.fade.style.transition = 'opacity .4s'; ui.fade.style.opacity = 1;
          after(0.6, () => {
            showNote({ title: '错位', body: '你踏出门槛一步。\n\n脚下既不是木地板，也不是完整的花砖。身后门还在，门内灯光还亮，但远处的院门方向多出了一道不该有的门框。\n\n风声是同一段，在重复。', choices: [
              { label: '退回 F1（关上门）', fn: () => {
                  ui.fade.style.opacity = 0;
                  after(0.8, () => { ui.fade.style.transition = 'opacity 1.8s'; });
                  setPhase('N1e');
                  setObjective('退回来了。门外在恢复之前，保持门关闭，退回 F2。');
                } },
            ]});
          });
        } },
    ],
  });
});

// ---------- N2：停电与复位 ----------
addInt(0.9, 7.3, 1.55, '窗边旧纸', () => S.phase === 'N2' && !S.r3read, () => {
  S.r3read = true;
  addNote('R3 · 停电后别把灯打开', '「停电后别把灯打开。」——早期住客（未写条件）');
  showNote({ title: 'A14 · 窗边旧纸 R3', body: TXT.r3, onClose: () => {
    setObjective('到 F6 储物小间，取门边应急架上的小手电。');
  }});
});
addInt(0.9, 7.35, 1.3, '窗帘内衬', () => S.phase === 'N2', () => {
  addNote('D1 · 窗帘内衬（H1）', '「不是屋里不能亮。外面黑下去的时候，光别漏出去。」——早期住客纠正过自己的 R3。');
  showNote({ title: 'H1 · 窗帘内衬', body: TXT.curtain });
});
addInt(0.55, 4.0, 1.85, '应急架 · 小手电', () => S.phase === 'N2' && !S.i1, () => {
  S.i1 = true;
  showNote({ title: 'A14 · 取小手电 I1', body: TXT.i1, onClose: () => {
    setObjective('去服务廊（F8）：电箱旁有林远的整理页 R4。');
  }});
});
addInt(11.45, 4.0, 1.5, '电箱旁整理页', () => S.phase === 'N2' && S.i1 && !S.r4read, () => {
  S.r4read = true;
  addNote('R4 · 先恢复照明，再找回房间', '「走廊灯灭了，先恢复照明，再找回房间。」——林远');
  showNote({ title: 'A15 · 整理页 R4', body: TXT.r4, onClose: () => {
    setObjective('核对现代证据（可选）：F1 正门外路灯。然后开配电箱。');
  }});
});
addInt(1.8, 0.5, 1.1, '正门外路灯（观察位）', () => S.phase === 'N2', () => {
  S.streetChecked = true;
  addNote('证据一 · 门外路灯仍亮', '停电后经 D01 核对：前院路灯亮、车声仍在——院子这一侧还是现代。');
  showNote({ title: 'A15 · 核对外部', body: TXT.street });
});
addInt(12.18, 4.05, 1.45, '应急钥匙盒', () => S.phase === 'N2' && !S.i2, () => {
  S.i2 = true;
  showNote({ title: 'A16 · 打开应急盒', body: '钥匙圈上挂着三四把，胶带上写着「服务」。\n\n（获得：I2 服务钥匙圈 · 永久持有。）', onClose: () => {
    setObjective('用服务钥匙开配电箱盖，复位生活照明。');
  }});
});
addInt(11.45, 4.22, 1.45, '配电箱', () => S.phase === 'N2', () => {
  if (!S.i2) {
    showNote({ title: 'A15 · 配电箱（锁着）', body: TXT.breakerLock });
    return;
  }
  if (!S.safePower) {
    S.safePower = true;
    setPublicLights(true);
    phoneLight.intensity = 0;
    addNote('A16 · 复位生活照明', 'I2 开盖、拨回跳闸开关。室内低位灯亮，热水器恢复。safe_power 成立。');
    showNote({ title: 'A16 · 配电箱 · 复位', body: TXT.breakerReset, onClose: () => {
      setPhase('N2back');
      setObjective('回客厅（F2）确认灯稳定。');
    }});
  } else {
    showNote({ title: '配电箱', body: '生活照明稳定。没有别的开关需要动。' });
  }
});

// ---------- N3：门边抽屉 R2 ----------
addInt(2.75, 0.4, 0.95, '门边旧抽屉', () => S.phase === 'N3door' && !S.r2read, () => {
  S.r2read = true;
  addNote('R2 · 第三回敲完，我打开了门', '「第三回敲完，我打开了门，走廊恢复了。」——早期住客');
  showNote({ title: 'A20 · 旧抽屉 R2', body: TXT.r2, onClose: () => {
    setObjective('查看正门门缝（第一轮）。');
  }});
});

// N3 辅助：提前退回（剩余轮次在客厅听完）
function retreatToLivingRoom() {
  setPhase('N3wait');
  setObjective('留在 F2，听完剩余的轮次。');
  const remaining = 3 - S.knockRound;
  let t = 1.5;
  for (let i = 0; i < remaining; i++) { after(t, () => knockSound()); t += 2.2; }
  after(t + 0.5, () => {
    showNote({ title: 'A24 · 残留的证据', body: TXT.retreatEarly, onClose: () => startN4() });
  });
}
function crossInN3() {
  pollute(8);
  showNote({ title: '错位 · 警告', body: TXT.crossWarn });
}

// ---------- N4：电话 ----------
addInt(-3.5, 5.58, 4.55, '电话与听筒', () => S.phase === 'N4a' || S.phase === 'N4b' || S.phase === 'N4c', () => {
  if (S.phase === 'N4a' && !S.r5read) {
    S.r5read = true;
    addNote('R5 · 我跟着那个女人的声音', '「我跟着那个女人的声音，找到了电话旁的房间。」——早期住客');
    showNote({ title: 'A26 · 电话底座旁 R5', body: TXT.r5, onClose: () => {
      setObjective('铃还在响。拿起听筒。');
    }});
  } else if (S.phase === 'N4a') {
    S.ringing = false;                       // 接听，铃声停
    setPhase('N4b');
    setObjective('听完这一段。');
    showNote({ title: 'A26 · 听筒', body: TXT.call });
  } else if (S.phase === 'N4b') {
    setPhase('N4c');
    setObjective('查看电话已安静，再到 U1 西侧门口观察。');
    after(2.0, () => {
      addNote('A27 · 无源重复', '放回听筒 2 秒后，同样的短句从短廊深处出现——电话一动不动。phone_verified。');
      showNote({ title: 'A27 · 声音换地方了', body: TXT.hangup });
    });
  } else {
    showNote({ title: 'A28 · 电话已安静', body: TXT.phoneQuiet });
  }
});
addInt(0.3, 2.1, 4.3, '朝短廊深处观察', () => S.phase === 'N4c', () => {
  S.phoneVerified = true;
  addNote('A28 · 设备停止与异处重复', '两项事实同时成立：电话停了，声音却还在别处。C5 已建立。');
  showNote({ title: 'A28 · U1 门口', body: TXT.corridor, onClose: () => startN5() });
});

// ---------- N2/N3/N4 剧情推进 ----------
function setFloor(n) { S.floor = Math.max(S.floor, n); S.pollution = Math.max(S.pollution, n); renderHUD(); }
function setPublicLights(on) {
  for (const id in level.lampRefs) level.lampRefs[id].intensity = on ? 9 : 0.8;
}
function startN2() {
  setPhase('N2');
  setClock('22:00', '夜');
  setFloor(30);
  saveC('C2');
  setPublicLights(false);
  phoneLight.intensity = 2.4;                // 手机照明立即可用
  setObjective('公共灯灭了；窗外现代灯还亮。查看 F5 窗边旧纸。');
}
function startN3() {
  setPhase('N3door');
  setClock('23:00', '夜');
  setFloor(40);
  saveC('C3');
  S.knockRound = 1;
  setObjective('正门又响了。先看 F1 门边旧抽屉（R2），再查门缝。');
  after(1.2, () => knockSound());
}
function startN4() {
  setPhase('N4a');
  setClock('00:10', '深夜');
  setFloor(50);
  saveC('C4', -2.7, 5.0);
  setObjective('上二楼（U1）。声音的事，等它自己发生。');
}
function ringOnce() {
  if (!S.ringing) return;
  ringSound();
  after(4, ringOnce);
}
function ringSound() {
  if (!actx) return;
  const t = actx.currentTime;
  [[0, 880], [0.45, 880]].forEach(([off, f]) => {
    const g = actx.createGain();
    g.gain.setValueAtTime(0.08, t + off);
    g.gain.setValueAtTime(0.08, t + off + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.38);
    const o = actx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(g).connect(actx.destination);
    o.start(t + off); o.stop(t + off + 0.4);
  });
}

// ---------- 可锁门（自动生成交互点） ----------
for (const id in level.doorLocks) {
  const dl = level.doorLocks[id];
  if (dl.gate === 'never_open') continue;                    // D07 围挡：只挡不交互
  const label = dl.gate === 'O5_side_bolt' ? 'O5→O1 门闩'
    : dl.gate === 'inside_bolt' ? '厨房后门插闩' : '上锁的门';
  addInt(dl.center[0], dl.center[1], (dl.z ?? 0) + 1.2, label, () => !S.doors[id], () => {
    if (id === 'D02') {                                      // O5→O1 门闩
      unlockDoor(id);
      if (S.phase === 'N6' && !S.routeReturned) {
        S.routeReturned = true;
        pollute(-8);
        addNote('A39 · 外圈走通', '从 O4 正常通道到 O5，拔开 O5→O1 门闩。前院位置与楼上所见相符。route_returned=true（-8）。');
        showNote({ title: 'A39 · 拔门闩', body: TXT.bolt, onClose: () => {
          setObjective('在 O1 核对院门外（A40）。');
        }});
      } else {
        showNote({ title: '门闩', body: '你拔开门闩，门开了。' });
      }
      return;
    }
    if (id === 'D08') {                                      // 厨房后门内侧插闩
      unlockDoor(id);
      showNote({ title: '后门', body: '你拉开内侧插闩。厨房后门通向 O2 后院。' });
      return;
    }
    if (S.i2) {                                              // 服务钥匙
      unlockDoor(id);
      showNote({ title: '开锁', body: '服务钥匙转动——门开了。' });
    } else {
      showNote({ title: '上锁', body: TXT.doorLocked });
    }
  });
}
function unlockDoor(id) {
  const dl = level.doorLocks[id];
  if (!dl || S.doors[id]) return;
  const idx = level.colliders.indexOf(dl.col);
  if (idx >= 0) level.colliders.splice(idx, 1);
  S.doors[id] = true;
}

// ---------- N5：重复短廊 ----------
addInt(1.0, 3.1, 4.8, '通路示意与 R7', () => S.phase === 'N5' && !S.r7read2, () => {
  S.r7read2 = true;
  addNote('R7 · 沿栏杆与地板缝回楼梯', '早期住客的具体路线：电话厅南门 → 楼梯上口木栏杆 + 地板缝 → S。');
  showNote({ title: 'A30 · U6 门边', body: TXT.r7, onClose: () => {
    setObjective('在 U1 门槛观察位核对两个锚点：中段门牌 · 栏杆与地板缝。');
  }});
});
addInt(2.2, 3.2, 4.6, '中段门牌', () => S.phase === 'N5', () => {
  S.anchorPlate = true;
  showNote({ title: 'A31 · 锚点一', body: TXT.plate, onClose: () => anchorHint() });
});
addInt(0.6, 2.2, 4.6, '栏杆与地板缝', () => S.phase === 'N5', () => {
  S.anchorRail = true;
  showNote({ title: 'A31 · 锚点二', body: TXT.rail, onClose: () => anchorHint() });
});
function anchorHint() {
  if (S.anchorPlate && S.anchorRail) setObjective('两处锚点已核对——退回 U6 电话厅比较。');
  else setObjective('在 U1 观察位核对两个锚点（还差一处）。');
}

// ---------- N6：外圈 ----------
addInt(14.2, 7.9, 1.35, '林远的录音机与外圈图', () => S.phase === 'N6pre' && !S.i3, () => {
  S.i3 = true;
  addNote('D7 · 林远录音与外圈图', '经过后院，沿侧巷到有树的院子，从洗衣间回前院。别只看箭头。');
  setFloor(65);
  saveC('C6', 14.0, 7.0);
  setPhase('N6');
  showNote({ title: 'A35 · F10 值班室', body: TXT.d7, onClose: () => {
    setObjective('到 F4 书房读林远的整理页 D6。');
  }});
});
addInt(10.2, 7.3, 1.2, '整理页 D6', () => S.phase === 'N6' && !S.d6read, () => {
  S.d6read = true;
  addNote('D6 · 林远整理页', '先别把箭头当路。看树和水沟是不是还在两边……先把屋里的位置守住，外面的路接上了，才算能走。');
  showNote({ title: 'A36 · 书房 D6', body: TXT.d6, onClose: () => {
    setObjective('经后院（O2）→ 侧巷（O3）→ 树院（O4）：核对树、沟与箭头。');
  }});
});
addInt(10.6, 11.0, 1.5, '排水沟', () => S.phase === 'N6', () => {
  S.ditchSeen = true;
  addNote('A37 · 排水沟', '沟沿连续，由侧巷（O3）流向树院（O4）。正常关系。');
  showNote({ title: 'A37 · 侧巷', body: TXT.ditch });
});
addInt(16, 14.8, 1.3, '树与沟沿', () => S.phase === 'N6', () => {
  S.treeSeen = true;
  addNote('A38 · 树与沟沿', '树在近墙侧，沟沿在相对侧连接侧巷。墙上箭头指 O5；东墙假门箭头朝 O6，与树沟不符。');
  showNote({ title: 'A38 · 树院', body: TXT.tree });
});
addInt(19.5, 14.5, 1.3, '假门（朝 O6 的门面）', () => S.phase === 'N6', () => {
  showNote({ title: 'A38 · 假门', body: TXT.fakeDoor, choices: [
    { label: '离开——树和沟都不在这边', fn: () => {
        setObjective('沿正常出口 O4→O5（拔 O5→O1 门闩），完成外圈。');
      } },
    { label: '跨进假门', fn: () => {
        pollute(8);
        showNote({ title: '错位', body: TXT.fakeCross, choices: [
          { label: '退回 O4', fn: () => {} },
          { label: '继续深入（照箭头走）', fn: () => die('X4') },
        ]});
      } },
  ]});
});
addInt(1.8, -5.6, 1.2, '院门外（核对）', () => S.phase === 'N6' && S.routeReturned, () => {
  S.o1GateChecked = true;
  addNote('A40 · 院门外（夜间核对）', '门外沟沿凭空中断，路灯底座重复。并非安全出口——先回屋守住位置。');
  showNote({ title: 'A40 · 院门外', body: TXT.o1gateN6, onClose: () => {
    setObjective('回客厅（F2），按林远的方法等待（A41）。');
  }});
});

// ---------- N7：遮光回放 ----------
addInt(8.0, 2.6, 1.3, '沙发', () => S.phase === 'N6' || S.phase === 'N7', () => {
  if (S.phase === 'N6') {
    if (!S.routeReturned || !S.o1GateChecked) {
      showNote({ title: '沙发', body: '还不是坐下来的时候。外圈的核对（树、沟、箭头、院门）还没做完。' });
      return;
    }
    startN7();
    return;
  }
  // N7：等待（A48）
  if (S.curtainSealed && S.lightSafe && S.finalChecked) {
    showNote({ title: 'A48 · 留在这里，等到天亮', body: TXT.dawn, onClose: () => startN8() });
  } else {
    showNote({ title: 'A48 · 前提未齐', body: '窗帘、灯、玄关门——三项都要在「当前状态」下核对过：\n\n· 窗帘拉合并扣好搭扣\n· 台灯亮而不漏光\n· 玄关门已关且已核对门框\n\n（不是读三个曾经成功过的旧标志。）' });
  }
});
function startN7() {
  setPhase('N7');
  setFloor(68);
  setClock('04:30', '凌晨');
  saveC('C7', 8.0, 2.6);
  wMode(true);
  after(1.0, () => {
    addNote('A42 · 进入 N7', '按林远的方法留在 F2。1 秒暗转后，F1/F2/F3 成为连续的战时回放。');
    showNote({ title: 'A42 · 留在这里', body: TXT.sofaWait, onClose: () => {
      setObjective('F3 窗帘：先拉合，再检查漏缝、扣好搭扣（A43/A44）。');
    }});
  });
}
addInt(6.0, 7.6, 1.5, '窗帘', () => S.phase === 'N7', () => {
  if (!S.curtainPulled) {
    S.curtainPulled = true;
    showNote({ title: 'A43 · 拉合窗帘', body: TXT.curtain, onClose: () => {
      setObjective('检查下摆漏缝，压好右侧搭扣（A44）。');
    }});
  } else if (!S.curtainSealed) {
    S.curtainSealed = true;
    addNote('A44 · 窗帘扣好', '下摆两个漏缝压好，右侧搭扣扣住。窗线不再透光。curtain_sealed=true。');
    showNote({ title: 'A44 · 扣好搭扣', body: TXT.curtainSealed, onClose: () => {
      setObjective('回 F2 拨亮面朝室内的台灯（A45）。');
    }});
  } else {
    showNote({ title: '窗帘', body: '窗帘拉合，搭扣扣好。窗线不透光。' });
  }
});
addInt(7.08, 3.62, 1.15, '台灯', () => S.phase === 'N7' && !S.lightSafe, () => {
  if (!S.curtainSealed) {
    pollute(8);
    showNote({ title: 'A45 · 漏光警告', body: TXT.lampWarn, choices: [
      { label: '关灯，先去合帘', fn: () => {} },
      { label: '再调亮一档，看清外面', fn: () => die('X2') },
    ]});
  } else {
    S.lightSafe = true;
    pollute(-8);
    addNote('A45 · 光被窗线挡住', '台灯只照亮室内。窗线外一片暗。light_safe=true（-8）。');
    showNote({ title: 'A45 · 台灯', body: TXT.lampSafe, onClose: () => {
      setObjective('等一等——玄关外有声音。去 F1 核对门框（A47）。');
      after(1.5, () => {
        showNote({ title: 'A46 · 声音副本', body: TXT.a46 });
      });
    }});
  }
});
addInt(1.8, 0.5, 1.15, '门框与门外地面（核对）', () => S.phase === 'N7' && S.lightSafe && !S.finalChecked, () => {
  S.finalChecked = true;
  addNote('A47 · 最终边界核对', '门内 W，门外拼着现代门廊。不追声开门。final_boundary_checked=true。');
  showNote({ title: 'A47 · 不追声', body: TXT.finalCheck, onClose: () => {
    setObjective('回 F2 沙发，选择「留在这里，等到天亮」（A48）。');
  }});
});

// ---------- N8：清晨 ----------
addInt(1.8, 0.5, 1.15, '正门（清晨核对）', () => S.phase === 'N8', () => morningCheck());
function startN8() {
  setPhase('N8');
  setClock('05:50', '清晨');
  wMode(false);
  setFloor(68);
  S.dawnReached = true;
  after(1.5, () => {
    showNote({ title: 'N8 · 你确实可以离开', body: TXT.dawn, onClose: () => {
      setObjective('确认门内外连续（F1 正门两项观察），然后到 O1 院门。');
    }});
  });
}
function morningCheck() {
  const now = { ground: S.morningGround, ditch: S.morningDitch };
  const next = !now.ground ? 'morningGround' : !now.ditch ? 'morningDitch' : null;
  if (!next) {
    showNote({ title: 'A49 · 已核对', body: '门内外地面、沟沿与路灯——两项连接都已核对。院子这侧是真实的清晨。' });
    return;
  }
  if (next === 'morningGround') {
    S.morningGround = true;
    showNote({ title: 'A49 · 门内外地面', body: '你蹲下来：门内外地面连续，砖缝相接。（观察一 / 二）', onClose: () => {
      if (!S.morningDitch) setObjective('再核对排水沟与路灯（观察二）。');
    }});
  } else {
    S.morningDitch = true;
    saveC('C8', 1.8, -1.5);
    addNote('A49 · 清晨两项连接', '地面连续；排水沟接到真实路灯底座，路灯只有一盏，有街景声源。');
    showNote({ title: 'A49 · 沟沿与路灯', body: TXT.morning, onClose: () => {
      setObjective('到 O1 院门：选择「离开这里」（A50）。');
    }});
  }
}

// ---------- 尾声与结局 ----------
function startEpilogue() {
  S.e1Done = true;
  setPhase('EPI');
  setClock('06:10', '次日清晨');
  player.x = -2.2; player.y = -2.2; player.z = 3.6;
  ui.fade.style.opacity = 0;
  setObjective('尾声：拿上行李，从正门离开这个普通的民宿。');
  showNote({ title: 'A51 · 醒来', body: TXT.epiWake });
}
addInt(0.55, -1.58, 4.25, '行李', () => S.phase === 'EPI', () => {
  showNote({ title: 'A52 · 行李', body: '旅行包上肩。镜子的重量不在包里——它留在了它该在的地方。\n\n（所有异常停用，出口正常通行。）' });
});
function showCredits() {
  S.finished = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const hist = S.historyReady
    ? '<br><br>我找到了另一条路，但这次离开了。'
    : '';
  ui.endText.innerHTML =
    `E1 · 离开<br><br>故事钟 ${S.clock} · 污染 ${S.pollution} · 笔记 ${S.notes.length} 条${hist}<br><br>` +
    `第一夜 N0–N8 表线完整通关。${S.historyReady ? '历史入口已找到（H 链完成）。' : '里线可在清晨补完：回到清晨后自由调查。'}`;
  ui.end.style.display = 'flex';
}
function showHistoryEnd() {
  S.historyEntered = true;
  S.finished = true;
  if (document.pointerLockElement) document.exitPointerLock();
  ui.endText.innerHTML =
    `第一夜结束 · 历史入口已找到<br><br>` +
    `故事钟 ${S.clock} · 污染 ${S.pollution} · 笔记 ${S.notes.length} 条<br><br>` +
    `旧灯与电话声沉入黑暗。第二夜尚未制作——入口资格已保存，清晨随时可以回来，也可以从院门离开（E1）。`;
  ui.end.style.display = 'flex';
}

// ---------- 里线 H2：二号房 U3 ----------
addInt(13.18, 6.68, 4.55, '桌面原稿', () => S.doors.D22 && !S.e1Done, () => {
  addNote('D2 · 二号房桌面', '电话响的时候杯子也在动。后来声音换到走廊，杯子没再动。我却还是跟了过去。');
  showNote({ title: 'H2 · 桌面 D2/R7', body: TXT.d2 });
});
addInt(12.3, 3.95, 4.6, '门边重叠路线图', () => S.doors.D22 && !S.e1Done, () => {
  showNote({ title: 'H2 · 路线图', body: '三层重叠的返回路线，起点都是同一扇窗。最后一稿里，栏杆/地板缝被一扇复制门框截断——作者却仍把它画成连续。\n\n（她画的时候，已经分不清哪条路还在了。）' });
});
addInt(13.48, 5.82, 4.2, 'D3 · 折页背面', () => S.doors.D22 && !S.e1Done, () => {
  addNote('D3 · 镜子在楼梯下', '「镜子放在楼梯下，抽屉比外面看起来浅。先放下它，再看脚下。」——镜子位置：换鞋凳下层抽屉，第二挡。');
  showNote({ title: 'H2 · D3', body: TXT.d3, onClose: () => {
    if (!S.mirrorOwned) setObjective('去 S 楼梯下：换鞋凳的下层抽屉（H3）。');
  }});
});

// ---------- 里线 H3：抽屉暗格 ----------
const mirrorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.02),
  new THREE.MeshLambertMaterial({ color: 0x9aa4ac, emissive: 0x22282c }));
mirrorMesh.position.set(-2.45, 0.55, -3.6);
scene.add(mirrorMesh);
addInt(-2.45, 3.6, 0.85, '换鞋凳下层抽屉', () => !S.e1Done, () => {
  const st = S.s3step;
  if (st === 0) {
    S.s3step = 1;
    showNote({ title: 'H3 · 拉开下层抽屉', body: TXT.h3a });
  } else if (st === 1) {
    S.s3step = 2;
    showNote({ title: 'H3 · 检查深度', body: '内外深度差摆在这里。里面还有一格。（下一步：右侧木挡）' });
  } else if (st === 2) {
    S.s3step = 3;
    showNote({ title: 'H3 · 按下木挡', body: TXT.h3b });
  } else if (st === 3) {
    S.s3step = 4;
    S.mirrorOwned = true;
    mirrorMesh.visible = false;
    addNote('D4 · 林远末页', '「她把镜子留在这里。我用过，仍放回原位。……我本来可以走。」背面三处位置：书房旧柜 · 梳妆台 · 楼梯墙。');
    saveC('I4入手', -2.2, 3.6);
    showNote({ title: 'H3 · 拿到 I4 旧手镜', body: TXT.h3c + '\n\n' + TXT.d4, onClose: () => {
      setObjective('D4 第一处：F4 书房的旧柜位（V1）。镜面旧景最早 N4 后显现。');
    }});
  } else {
    showNote({ title: 'D4 回看', body: TXT.d4 });
  }
});

// ---------- 镜面观察（画中画静帧） ----------
function showMirror(title, oldHtml, nowHtml, choices) {
  showNote({ title, body: '', choices, html:
    `<div class="mgrid">
      <div class="mcol old"><b>镜中旧景</b>${oldHtml}</div>
      <div class="mcol now"><b>现实</b>${nowHtml}</div>
    </div>` });
}
const N4PLUS = () => ['N4a','N4b','N4c','N5','N6pre','N6','N7','N8'].includes(S.phase);

// V1 · 书房
addInt(12.3, 6.1, 1.5, '旧柜位磨痕', () => S.mirrorOwned && !S.e1Done && N4PLUS(), () => {
  if (!S.mirrorPast) {
    showMirror('V1 · 书房', TXT.v1old, TXT.v1now, [
      { label: '对照旧柜的位置（两处实体痕迹）', fn: () => {
          S.mirrorPast = true;
          addNote('V1 · 镜中的柜子', '镜中旧书柜与现实柜脚压痕/墙印对应。镜中的柜子已拆掉。mirror_past_verified=true。');
          saveC('V1完成', 12.0, 6.1);
          showNote({ title: 'V1 · 完成', body: TXT.v1done });
        } },
      { label: '放下镜子', fn: () => {} },
    ]);
  } else {
    showNote({ title: 'V1', body: TXT.v1done });
  }
});
// V2 · 原主卧
addInt(7.02, 4.0, 4.65, '梳妆台托位', () => S.mirrorOwned && !S.e1Done && N4PLUS(), () => {
  if (!S.mirrorLimit) {
    showMirror('V2 · 原主卧', TXT.v2old, TXT.v2now, [
      { label: '核对实际墙面（不走进去）', fn: () => {
          S.mirrorLimit = true;
          addNote('V2 · 旧门存在过', '镜中窄门方向是完整外墙，地板缝与窗台不相接。过去的门不等于当前通路。mirror_limit_verified=true。');
          saveC('V2完成', 7.0, 4.6);
          showNote({ title: 'V2 · 完成', body: TXT.v2done + '\n\n' + TXT.d5, onClose: () => {
            setObjective('D4 第三处：S 楼梯下的补缝（V3）。');
          }});
        } },
      { label: '按镜中的窄门走', fn: () => {
          pollute(8);
          showNote({ title: '错位', body: TXT.v2cross, choices: [
            { label: '退回', fn: () => {} },
            { label: '继续穿过去', fn: () => die('X1') },
          ]});
        } },
    ]);
  } else {
    showNote({ title: 'V2', body: TXT.v2done });
  }
});
// V3 · 楼梯墙
addInt(-0.15, 3.6, 1.3, '换鞋凳对面的墙', () => S.mirrorOwned && !S.e1Done, () => {
  if (!S.wallSeen) {
    S.wallSeen = true;
    showNote({ title: 'V3 · 补缝', body: TXT.v3a, onClose: () => {
      setObjective('把镜子放入凳背凹位，对照补缝。');
    }});
    return;
  }
  const missing = [];
  if (!S.mirrorPast) missing.push('V1 书房比对');
  if (!S.mirrorLimit) missing.push('V2 梳妆台比对');
  if (missing.length) {
    showMirror('V3 · 对照补缝', TXT.v3old, TXT.v3need + missing.join('、') + '）。先完成那两处实际比对，再回来。', [
      { label: '收镜，去补比对', fn: () => {} }]);
    return;
  }
  if (!S.dawnReached) {
    showMirror('V3 · 对照补缝', TXT.v3old, '轮廓仍在两层墙之间重叠，脚下也没有接上。先完成今晚的生存路线——天亮之后，这扇门才会真正打开。', [
      { label: '收镜', fn: () => {} }]);
    return;
  }
  if (!S.historyReady) {
    showMirror('V3 · 对照补缝', TXT.v3old, '清晨。可以执行「依照旧门位置检查墙面」了。', [
      { label: '依照旧门位置检查墙面', fn: () => {
          S.wallCompared = true;
          S.thresholdAligned = true;
          S.historyReady = true;
          saveC('H6解锁', -1.0, 3.6);
          showNote({ title: 'V3 · 门槛核对', body: TXT.v3aligned, onClose: () => {
            setObjective('历史入口已找到。可以离开（O1 院门），或到 S 墙前进入——当前版本到此结束。');
          }});
        } },
      { label: '收镜', fn: () => {} }]);
    return;
  }
  showNote({ title: '历史门', body: '门位已辨认，资格在手。到凳背托位把镜子放好——它只帮第一次辨认。（门在旁边的墙前）' });
});
// 历史门（V3 解锁后）
addInt(-0.5, 3.6, 1.3, '历史门', () => S.historyReady && !S.historyEntered && !S.e1Done, () => {
  showNote({ title: '历史入口', body: TXT.histOpen, choices: [
    { label: '留在此夜——去院门离开（E1）', fn: () => {
        S.thresholdAligned = false;
        setObjective('到 O1 院门：选择「离开这里」。');
      } },
    { label: '进入——继续探查这栋房子的过去', fn: () => {
        ui.fade.style.opacity = 1;
        after(2.2, () => showHistoryEnd());
      } },
  ]});
});

// A50/EPI：院门（清晨与尾声）
addInt(1.8, -5.6, 1.2, '院门（清晨）', () => S.phase === 'N8' && !(S.morningGround && S.morningDitch), () => {
  showNote({ title: 'A50 · 先核对', body: '离开之前，先在 F1 正门完成清晨的两项观察（门内外地面 · 沟沿与路灯）。不会因为没看而失败——但值得核对。' });
});
addInt(1.8, -5.6, 1.2, '院门（离开）', () => S.phase === 'N8' && S.morningGround && S.morningDitch, () => {
  showNote({ title: 'A50 · 离开这里', body: TXT.leaveConfirm, choices: [
    { label: '离开（E1）', fn: () => {
        ui.fade.style.opacity = 1;
        after(2.0, () => startEpilogue());
      } },
    { label: '还不走——再看看，或补完里线', fn: () => {} },
  ]});
});
addInt(1.8, -5.6, 1.2, '院门', () => S.phase === 'EPI', () => showCredits());

// ---------- N5/N6/N7 推进 ----------
function startN5() {
  setPhase('N5');
  setClock('01:20', '深夜');
  setFloor(60);
  saveC('C5', -2.7, 5.0);
  setObjective('U6 门边有通路示意与 R7 摘录（A30）。短廊暂不要深入。');
}

// ---------- 存档 / 死亡 / 视觉状态 ----------
function snapshot() {
  const s = { ...S, notes: S.notes.map(n => ({ ...n })) };
  return { S: s, objective, player: { x: player.x, y: player.y, z: player.z } };
}
function saveC(tag, x, y) {
  if (x !== undefined) { player.x = x; player.y = y; }
  lastSave = snapshot();
  try { localStorage.setItem('rules_save_v1', JSON.stringify({ tag, ...lastSave })); } catch (e) {}
}
let lastSave = null;
function die(code) {
  const HINTS = {
    X1: '门内外没有接上，你仍向前走了。',
    X2: '光从没有遮住的窗缝漏了出去。',
    X3: '电话已经停了，你追的是另一处重复的声音。',
    X4: TXT.x4hint,
  };
  if (document.pointerLockElement) document.exitPointerLock();
  ui.fade.style.transition = 'opacity .8s';
  ui.fade.style.opacity = 1;
  after(1.0, () => {
    modalOpen = true;
    ui.fade.style.opacity = 0;
    $('death-hint').textContent = HINTS[code] + '　——回到最近稳定点。';
    $('death').style.display = 'flex';
    const restore = () => {
      $('death').style.display = 'none';
      modalOpen = false;
      ui.fade.style.transition = 'opacity 1.8s';
      restoreSnapshot(lastSave);
    };
    $('death').onclick = restore;
    after(4.5, () => { if ($('death').style.display === 'flex') restore(); });
  });
}
function restoreSnapshot(snap) {
  if (!snap) { location.reload(); return; }
  timers.length = 0;
  Object.assign(S, snap.S, { notes: snap.S.notes });
  objective = snap.objective || objective;
  player.x = snap.player.x; player.y = snap.player.y; player.z = snap.player.z;
  // P 收敛：读档不超过 F+8
  S.pollution = Math.max(S.floor, Math.min(S.pollution, S.floor + 8));
  applyVisualState();
  currentRoom = null;
  renderHUD();
  setObjective('（已回到稳定点）' + objective);
}
function applyVisualState() {
  const blackout = S.phase === 'N2' && !S.safePower;
  setPublicLights(!blackout);
  phoneLight.intensity = blackout ? 2.4 : 0;
  wMode(S.wMode);
  mirrorMesh.visible = !S.mirrorOwned;
  for (const id in level.doorLocks) if (S.doors[id]) unlockDoor(id);
  if (S.cupMoved) { cupGrp.position.x = 6.59; cupGrp.position.z = -6.06; cupGrp.rotation.y = 0.5; }
  if (S.lampOn) { lampBulbMat.emissive.setHex(0xffc866); lampBulbMat.emissiveIntensity = 1.2; lampGrp.userData.light.intensity = 4; }
}
function wMode(on) {
  S.wMode = on;
  const old = new THREE.MeshLambertMaterial({ color: 0x6b5636 });
  for (const rid of ['F1', 'F2', 'F3']) {
    const f = level.floorMeshes[rid];
    if (f) f.material = on ? old : (level.rooms[rid].floor === 1 ? M_floorIn() : M_floor0());
  }
  for (const rid of ['F1', 'F2', 'F3']) {
    const li = level.lampRefs[rid];
    if (li) li.intensity = on ? 3.5 : 9;
  }
  scene.fog.density = on ? 0.022 : 0.016;
}
function M_floorIn() { return new THREE.MeshLambertMaterial({ color: 0xa08b6a }); }
function M_floor0() { return new THREE.MeshLambertMaterial({ color: 0x8b7a5e }); }

// ---------- E 交互 ----------
function nearestInt() {
  if (modalOpen || !gameStarted) return null;
  const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)); // blender 前向
  let best = null, bestDot = 0.72;
  for (const it of interactables) {
    if (it.cond && !it.cond()) continue;
    const to = it.pos.clone().sub(new THREE.Vector3(player.x, player.z, -player.y));
    const d = to.length();
    if (d > it.r) continue;
    to.normalize();
    const dot = to.dot(fwd);
    if (dot > bestDot) { bestDot = dot; best = it; }
  }
  return best;
}
let pendingInt = null;
function onE() {
  if (modalOpen) { if (!ui.noteChoices.children.length) hideNote(); return; }
  if (ui.notes.style.display === 'block') { toggleNotes(); return; }
  if (pendingInt) pendingInt.act();
}

// ---------- 主循环 ----------
let last = clockNow();
function tick() {
  requestAnimationFrame(tick);
  const now = clockNow();
  const dt = Math.min(0.05, now - last);
  last = now;

  // 定时器
  for (let i = timers.length - 1; i >= 0; i--) {
    if (now >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
  }

  if (gameStarted && !modalOpen) {
    // 移动（blender 平面）
    let mx = 0, my = 0;
    if (keys.KeyW) my += 1;
    if (keys.KeyS) my -= 1;
    if (keys.KeyA) mx -= 1;
    if (keys.KeyD) mx += 1;
    if (mx || my) {
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      // blender 前向 f=(sin yaw, −cos yaw)，右向 r=(−cos yaw, −sin yaw)
      const fx = Math.sin(player.yaw), fy = -Math.cos(player.yaw);
      const rx = -Math.cos(player.yaw), ry = -Math.sin(player.yaw);
      // 子步进：每步位移 ≤ 6cm，远小于碰撞半径，杜绝高速/低帧率隧穿
      const stepLen = 0.06;
      const steps = Math.max(1, Math.ceil(SPEED * dt / stepLen));
      const stepT = SPEED * dt / steps;
      for (let i = 0; i < steps; i++) {
        const sx = player.x + (fx * my + rx * mx) * stepT;
        const sy = player.y + (fy * my + ry * mx) * stepT;
        const [nx, ny] = collide(sx, sy, player.x, player.y);
        const gz = level.groundHeightAt(nx, ny, player.z);
        if (gz - player.z < 0.45) { player.x = nx; player.y = ny; player.z = gz; }
        else break; // 前方高差挡路（楼梯口等），停在原地
      }
    } else {
      player.z = level.groundHeightAt(player.x, player.y, player.z);
    }
  }

  // 相机
  camera.position.set(player.x, player.z + EYE, -player.y);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw + Math.PI; // blender yaw(0=北/+y) → three(-z=北)
  camera.rotation.x = player.pitch;

  // 房间检测
  if (gameStarted) {
    const rid = level.roomAt(player.x, player.y, player.z);
    if (rid !== currentRoom) {
      const prev = currentRoom;
      currentRoom = rid;
      onRoomChange(prev, rid);
    }
    // 交互提示
    pendingInt = nearestInt();
    ui.prompt.innerHTML = pendingInt ? `<b>E</b>${pendingInt.label}` : '';
    renderHUDLight();

    // N5 危险区：短廊 G 段（未解决时深入 U1 东段）
    if (S.phase === 'N5' && !S.loopResolved && currentRoom === 'U1' && player.x > 2.5) {
      if (S.loopIdentified && S.arrivedViaU5) {
        S.loopResolved = true;
        S.arrivedViaU5 = false;
        setPhase('N6pre');
        setObjective('G 段退场。去 F10 值班室查看林远的录音与外圈图（I3，A35）。');
      } else if (!S.n5Warned) {
        S.n5Warned = true;
        pollute(8);
        showNote({ title: '错位短廊', body: TXT.n5warn });
      } else if (player.x > 6) {
        die('X4');
      }
    }
  }

  renderer.render(scene, camera);
}
let hudTick = 0;
function renderHUDLight() {
  if (++hudTick % 12 === 0) renderHUD();
}

// ---------- 房间事件 ----------
function onRoomChange(prev, rid) {
  if (!rid) return;
  // A01 完成
  if (rid === 'F1' && S.phase === 'A01walk') {
    S.enteredF1 = true;
    setPhase('A02');
    setObjective('到客厅（F2）查看入住册与维护页。');
  }
  // 杯子异常：离开 F3 再回来
  if (prev === 'F3' && S.cupSeen && !S.cupMoved && S.phase === 'A03') {
    S.cupMoved = true;
    cupGrp.position.x += 0.09;
    cupGrp.position.z += 0.06;
    cupGrp.rotation.y += 0.5;
  }
  // A03 → A04：看过热水说明并上楼；或直接上二楼（设计允许跳过逐间观察）
  if ((S.phase === 'A03' || S.phase === 'A02') &&
      ((S.hotInfo && (rid === 'S' || rid === 'U1')) || rid === 'U2')) {
    setPhase('A04');
    setObjective('到 U2 一号客房入住：放行李 · 开床头灯 · 看窗外。');
  }
  // A33 抵达：从 U5 进 U1（阳台绕行）
  if (rid === 'U1' && prev === 'U5') S.arrivedViaU5 = true;
  // N5：两锚点核对后退回 U6 比较（A32）
  if (rid === 'U6' && S.phase === 'N5' && S.anchorPlate && S.anchorRail && !S.loopIdentified) {
    S.loopIdentified = true;
    pollute(-8);
    addNote('A32 · loop_identified', '门牌复制了，栏杆和地板缝没有。退回 U6，从阳台绕行。（-8）');
    showNote({ title: 'A32 · 比较', body: TXT.loopFound, onClose: () => {
      setObjective('绕行：U6→U8→U5（I2 开阳台侧门）→U1（A33）。');
    }});
  }
  // N1d：回 F2 → 敲门
  if (rid === 'F2' && S.phase === 'N1d') {
    setPhase('N1knock');
    setClock('21:10', '夜');
    saveC('C1');
    setObjective('正门在响。');
    after(1.0, () => {
      setPhase('N1e');
      setObjective('F1 的正门在响——去查看门缝。');
      knockSound(); after(0.8, () => knockSound()); after(1.6, () => knockSound());
    });
  }
  // A19：复位后回 F2 确认 → N3
  if (rid === 'F2' && S.phase === 'N2back') {
    startN3();
  }
  // A25：N4 中抵达 U1 → 1 秒后电话铃响
  if (rid === 'U1' && S.phase === 'N4a') {
    setObjective('……铃声从 U6 电话厅方向传来。');
    after(1.0, () => {
      S.ringing = true;
      ringOnce();
      setObjective('电话铃在响——去 U6 电话厅。');
    });
  }
}

// ---------- 结束 ----------
function finishSlice() {
  S.finished = true;
  if (document.pointerLockElement) document.exitPointerLock();
  ui.endText.innerHTML =
    `故事钟 ${S.clock} · 污染 ${S.pollution} · 笔记 ${S.notes.length} 条<br><br>` +
    `本切片已实装：第一夜 N0–N4 表线（入住 / 首敲 / 停电复位 / 三轮敲门 / 电话声源）、<br>` +
    `25 房间灰盒由 geometry.json 程序化生成、碰撞 / 楼梯 / 交互 / 笔记 / 污染下限 / 低强度异常、H1 里线插口。<br><br>` +
    `N5–N8 与里线 H2–H6（V1–V3）尚未实装。`;
  ui.end.style.display = 'flex';
}

// ---------- 启动菜单 ----------
function beginGame() {
  if (gameStarted) return;
  gameStarted = true;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  ui.start.style.display = 'none';
  ui.hud.style.display = 'block';
  renderer.domElement.requestPointerLock();
  renderHUD();
}
{
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('rules_save_v1') || 'null'); } catch (e) {}
  const row = document.createElement('div');
  row.className = 'btnrow';
  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = e => { e.stopPropagation(); fn(); };
    return b;
  };
  if (saved && saved.S && saved.S.phase && saved.S.phase !== 'boot') {
    row.append(mk('继 续 游 戏', () => {
      beginGame();
      restoreSnapshot(saved);
    }), mk('重 新 开 始', () => {
      try { localStorage.removeItem('rules_save_v1'); } catch (e) {}
      beginGame();
      setPhase('boot');
      setObjective('A01 · 查看手机订单。');
      saveC('start');
    }));
  } else {
    row.append(mk('开 始 游 戏', () => {
      beginGame();
      setPhase('boot');
      setObjective('A01 · 查看手机订单。');
      saveC('start');
    }));
  }
  // 点击画面任意处也开始新游戏（保留原行为）
  ui.start.appendChild(row);
  ui.start.addEventListener('click', () => {
    if (gameStarted) return;
    beginGame();
    if (saved && saved.S && saved.S.phase !== 'boot') restoreSnapshot(saved);
    else { setPhase('boot'); setObjective('A01 · 查看手机订单。'); saveC('start'); }
  });
}
tick();
