# 第一夜场景资料

对应2026-10-21确认保留的第一夜方案：25个功能节点、四间客房、唯一主楼梯、一层生活环、二层阳台绕行和院巷返回环。此包是设计与建模参考，不是已完成模型或关卡。

## 阅读与权威顺序

1. [第一夜完整流程](../first-night.md)：动作、阶段、门禁、失败与恢复。
2. [geometry.json](geometry.json)：唯一几何源，节点、门窗、楼梯与边界。
3. [placements.json](placements.json)：唯一家具、相机与操作空地源。
4. [流程与布局合同](layout-reference/flow-layout-contract.md)和[路线数据](layout-reference/flow-routes.json)：动作与实际路线映射。
5. [可视总览](index.html)、[场景文字](scenes/)、[米制图](plans/)与[空间视图](layout-reference/views/)：当前源数据的图文表达。
6. [交互规格](interaction-specs.md)、[交互数据](interactions.json)、[视觉规范](visual-bible.md)和[建模交接](blender-handoff.md)。

透视概念图只表达材料、氛围与陈设，不覆盖坐标和门窗。9个节点有独立透视图，另有1张外观图；其他节点保留文字与米制图，不能用缺图推断模型完成。

## 配套工具

- [几何检查](../../tools/verify_geometry.ps1)：只读验证门窗、楼梯和结构关系。
- [重建米制图与场景页](../../tools/build_scene_reference.py)：更新plans、scenes、index和场景清单。
- [重建空间视图](../../tools/render_layout_views.py)：读取同一份JSON，更新layout-reference/views。
- [项目完整性检查](../../tools/verify_project.py)：检查引用、节点、路线、图片和清单。

Python绘图需要Pillow；空间视图另需NumPy。两者使用Windows微软雅黑字体。按需安装到自己的环境，设计库不捆绑运行时。

## 制作与核验边界

先验证外壳、门洞、楼梯、三组回环和关键观察位，再装配电话、灯帘、手镜与普通陈设。动态件与静态壳分离。几何检查不代表结构工程、门扇扫掠、碰撞、视线、节奏或玩家体验通过；重构引擎未选定。

[布局说明](layout-decisions.md)与[摆放说明](placement-notes.md)保留空间决定和待验证点。配套米制图和场景页已按当前JSON重建，历史静态审查不是本次实机证据。

形制与素材研究见[研究资料](../../research/scene-reference-websites/FINDINGS.md)。
