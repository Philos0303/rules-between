# 《规则之间》第一夜洋楼场景包：视觉统一规范

> 用途：为总场景图、25 个节点参考图和 Blender 生产模型提供同一套视觉语言。
> 范围：上海旧私人洋楼翻修的四客房民宿；第一夜的现代 M、战时回放 W 与夹缝 G。
> 本文件是生产参考，不替代剧情、玩法、空间拓扑或正式美术正典。
> 形制参考：[上海市政府城市导览：新华路历史住宅](https://english.shanghai.gov.cn/en-CityTour/20260303/b8a10d5e27664c69bb294479704a91b9.html)。取其 1930 年前后住宅的坡屋顶、拉毛灰泥、砖石门窗尺度作为材料方向；本建筑为虚构合成，不复刻任何实景、地址或对称立面。

## 1. 总体视觉判断

- 建筑是一栋建于战争时期之前的上海小洋楼，后经多轮局部翻修成为自助民宿。
- 它应显得有人持续维护、预算有限、年代叠压，绝不呈现为精品酒店、洋人庄园或废弃鬼屋。
- 平面与外立面都保留不对称：主楼体偏左，厨房后勤翼向后伸，楼梯靠玄关一侧，原主卧与小阳台偏另一侧。
- 恐怖来自现实物件之间的关系被改写；画面始终让玩家能辨别门、窗、锚点和退路。
- 现代 M 是可信居所；W 是同地点较少物件替换的旧生活片段；G 只在门槛、短廊和局部墙面产生不连续。

## 2. 三层时间状态

| 状态 | 画面目标 | 允许改动 | 不做 |
|---|---|---|---|
| M 现代民宿 | 干净、安静、有住宿功能，仍有修缮痕迹 | 新灯具、民宿床品、电子锁、小电器、维修标签 | 样板间、奢华软装、无菌极简 |
| W 战时回放 | 生活被仓促遮光与等待打断，克制且可读 | 遮光布、木插销、旧电话、旧木椅、煤油灯、纸张、少量旧柜 | 战场、轰炸特效、尸体、军械陈列 |
| G 时间夹缝 | 熟悉空间接错，令玩家停下核对 | 一段墙纸错接、门框材质错层、同一门在错误位置出现 | 漂浮家具、怪物、整屋扭曲、随机迷宫 |

## 3. 外部总场景

- 临街围墙与前院构成第一眼的“可离开”形象；铁门、门牌、路灯、台阶必须清晰。
- 主立面为灰白矿物涂料和深色木窗，二层不等宽窗组与一处小阳台打破对称。
- 屋顶采用低饱和红褐平瓦的折屋顶，局部有低矮烟囱和后加的雨水管；瓦面完整但色差明显。
- 后院比前院窄，服务翼、晾衣杆、洗衣后门、矮墙与侧巷形成可复用的外圈地标。
- 侧巷应是可见天光的狭长步行空间，不做无尽黑巷；公共院以树、水沟、长凳作双锚点。
- 夜景基调是潮湿蓝灰天光配暖窗光，地面只在石板缝和门廊处有局部湿反射。

## 4. 建筑材料与色板

| 部位 | 基础色 | 制作参考 | M 修缮状态 | W / G 变化 |
|---|---|---|---|---|
| 外墙矿物涂料 | `#C8C0B2` | roughness 0.68–0.82 | 补丁略浅 `#D8D0C3`，可见切边 | W 更灰 `#AAA396`，局部被遮光投影压暗 |
| 旧砖与墙基 | `#7B6557` | roughness 0.78–0.90 | 只在掉皮、排水口、后院露出 | G 在门洞补缝处与现代墙面错接 |
| 红褐陶瓦 | `#75483D` | roughness 0.54–0.70 | 零星新瓦 `#8A5A4D`，不整片翻新 | 不改变屋顶轮廓 |
| 深色木窗/门框 | `#49372A` | roughness 0.42–0.60 | 接缝修补、局部清漆发亮 | W 更哑 `#3B2C23`，保留木插销位置 |
| 室内墙面 | `#D6CFC1` | roughness 0.72–0.86 | 墙角补漆、旧挂画方印 | W 为粉灰 `#B9AD9C`，不做满墙旧化 |
| 旧木地板 | `#76563D` | roughness 0.40–0.58 | 高行走区略亮、家具压痕清晰 | W 更深 `#5B402E`，仍保持可读纹理 |
| 湿区小砖 | `#A6A39A` | roughness 0.56–0.76 | 新旧砖混用，缝色 `#777873` | W 仅改变局部潮痕与照明 |
| 天花/石膏线 | `#D9D2C7` | roughness 0.76–0.90 | 可见后补线槽和维修盖板 | G 只在短廊出现错位接缝 |
| 黑铁五金 | `#2F3434` | metallic 0.65–0.85，roughness 0.28–0.46 | 黄铜编号牌和新螺丝可共存 | W 使用同位置的旧插销或扣件 |

## 5. 修缮与风化规则

- 新修补必须有边界：不同批次漆面、稍新的木条、外露螺丝、封住的旧孔位，比整面脏旧更可信。
- 使用四通道污染/风化 mask：边缘磨损、潮气水痕、手触油亮、旧钉孔/补缝；不使用随机脏污贴图覆盖全部表面。
- 现代 M 的风化只集中在踢脚线、后门、厨房、窗台和屋檐排水路径；床品、毛巾和住客接触面必须干净。
- W 的改变以遮光布压痕、木插销磨损、旧家具遮挡印、电话线与纸张为主，不额外堆积灰尘。
- G 的 mask 只能沿真实施工缝、封门砖、墙纸边缘和门框接合处出现，像时间层错位，不能像霉菌或肉质表面。

## 6. 门窗、木作与五金

- M 的房门为翻新的实木夹板门，哑光暖灰或深木色，配客房数字牌与现代磁锁；锁体是可替换动态物件。
- W 所需门洞保留原始深木门框、铁插销与厚布遮光；现代电子锁、插座、空调、二维码牌不可出现在 W 必要镜景内。
- 窗户统一为深木窄框、分格玻璃、内层薄纱与可拉合的实体遮光帘；窗帘、搭扣和插销必须独立建模。
- 楼梯扶手是本楼的核心重复木作：转角柱稍厚、扶手经常被触摸而有低粗糙度亮带。
- 书房旧柜、原主卧梳妆台、楼梯下抽屉使用同一深木工艺，但只让一件成为当前画面的视觉中心。

## 7. 共享家具族

| 家具族 | 共享成员 | 场景用法 | 变体规则 |
|---|---|---|---|
| A 客房族 | 单人床、床头柜、衣柜、行李凳、窗帘 | U2/U3/U4/U5 | 四间房靠摆位、织物和一件旧物区分，不重做四套家具 |
| B 会客餐叙族 | 双人沙发、木椅、圆/方小桌、餐桌、矮柜 | F2/F3/U1/F10 | M 用干净罩布与少量杯具；W 只替换一张旧椅或电话桌 |
| C 书写收纳族 | 书桌、旧柜、抽屉、壁架、纸盒 | F4/U3/F10/S | 旧柜和抽屉是线索载体；抽屉挡板、镜托独立建模 |
| D 后勤湿区族 | 橱柜、水槽、洗衣机、工具柜、折叠台 | F5/F6/F7/F8/F9/O5 | 低饱和、功能优先；只有可交互设备独立，不制作复杂管线谜题 |

## 8. 房间的镜头与层级

| 级别 | 适用 | 细节要求 | 生产原则 |
|---|---|---|---|
| Hero | F1、F2、F4、F5、S、U1、U3、U5、O2、O4、O5 | 主地标、线索物、两层材质信息、可近看五金 | 每场最多一个 hero 交互物，单物件可至 2K 贴图/8k tris |
| Secondary | F3、F8、F9、F10、U2、U7、O1、O3、O6 | 明确轮廓、合理摆放、少量修缮痕迹 | 复用材质和家具，单普通物 ≤1.5k tris |
| Background | F6、F7、U4、远处屋顶、围墙外街景 | 提供方向、深度和年代感 | 平面/低模/贴图卡足够，不放关键交互 |

## 9. 局部光照

- M：室内 2700–3200K 暖白，室外 6500–7500K 蓝灰；避免整屋泛黄，暖光只落在灯具实际覆盖范围。
- W：遮光后形成更低照度的中性棕灰，旧电灯只给局部暖点，与已设计的灯具开关操作保持一致；不可把所有战时镜景染成黄褐滤镜。
- G：降低局部环境亮度并让光源方向与现实轻微不合，但关键门缝、地面锚点、门框仍有读数。
- 任何危险或规则线索必须依靠物体状态、位置和文字/声音补充，色温只帮助情绪。

## 9.1 参考图构图规则

- 总场景采用略高于人眼的三分之四视角，必须同时读出主楼、后勤翼、前后院与侧巷的真实连接。
- 室内图按玩家站位出图，门洞、窗向和楼梯落点要和拓扑一致，不以电影构图挪动结构。
- Hero 节点提供一张进入视角与一张交互近景；Secondary/Background 节点只需一张能供建模的定向图。
- M/W 对照图保持同一相机、同一焦距、同一门窗位置，差别只落在批准替换的陈设与材质上。
- G 图固定展示错接边界与可退回区域，不用超广角把空间变形来制造恐怖。
- 人物不出现在任何环境参考图中；历史人物只由已经确认的物件痕迹传达。

## 10. 动态资产边界

- 门扇、门锁、插销、窗帘、搭扣、镜子、电话铃锤、录音机指示、抽屉、开关、关键纸张和历史门均为独立 目标引擎 资产。
- 不把上述物件、碰撞、热点、阻挡器或状态逻辑烘焙进房间 GLB；静态壳只含结构与非玩法陈设。
- W/G 切换使用局部替换组、材质变体和定点镜景，避免复制整栋楼的第二套模型。
- 每个房间壳控制在项目规定的预算内；场景图可更精细，但 Blender 生产按 Hero/Secondary/Background 兑现。

## 11. 25 节点参考图统一英文提示词

**Base style prompt**

```text
production-ready architectural concept art for a first-person psychological horror game, Shanghai asymmetrical two-storey early 20th-century villa renovated into a modest four-room self-check-in guesthouse, believable residential scale, restrained East Asian urban material history, lived-in but maintained, grey-white mineral plaster, dark aged timber windows and trim, muted red-brown ceramic tile roof, limited budget renovations with visible repair seams, cool blue-grey night exterior and localized warm practical interior light, quiet observational composition, physically plausible materials, readable doors windows stairs and landmarks, high-detail Blender environment reference, no characters, no text, no logo
```

**State suffixes**

```text
M: present-day guesthouse, clean bedding, subtle modern maintenance labels, restrained electrical fixtures, no showroom styling
W: wartime memory replay of the same location, only selected older furniture, blackout cloth, timber bolt, old telephone, paper traces, sparse practical light, civilian domestic tension
G: same room with a localized temporal misalignment at a real repair seam or doorway, mismatched wallpaper or frame layer, clear safe retreat, no impossible geometry beyond the focal threshold
```

**Negative prompt**

```text
European palace, symmetrical luxury hotel, Victorian gothic mansion, abandoned ruin, collapsed building, battlefield, soldiers, weapons, corpses, blood, gore, monsters, ghosts, people, faces, silhouette creature, tentacles, floating furniture, surreal infinite corridor, cyberpunk, steampunk, excessive clutter, whole-image sepia or yellow filter, whole-image red wash, heavy fog, black void, fisheye lens, unreadable darkness, UI, captions, watermark, logo
```

## 12. 交付前自查

- 每张 M 图都能被理解为仍在营业的民宿，四间客房与公共/后勤区的功能一眼可分。
- 每张 W 图只保留该节点叙事所需的旧物；现代电子锁、手机、二维码牌、现代开关、洗衣机、空调和民宿床品不进入 W 必要区域。
- 每张 G 图只在指定门槛或施工缝发生错接，并能看见退路与至少一个稳定地标。
- 每个镜头突出一个主要交互组合；同一场景允许多个独立道具。动态物件均独立，未烘焙到房间壳。
- 每张参考图使用 Base prompt + 一个状态 suffix + 房间名/镜头需求；不因追求恐怖而违反材料、灯光和禁用项。
- 外立面图保留红褐平瓦、粗糙灰泥、砖石细部与不等宽开窗的组合，但不复制引用建筑的立面比例或装饰。
