# 规则之间

第一人称环境推理恐怖游戏。当前目录是精简后的设计基线，供后续重构使用。

2026-10-21确认保留：两位前探索者、表里双线、三处手镜对照、唯一主楼梯和洋楼院巷回环。旧引擎工程、网页原型、废弃设计和Agent框架已移出项目，项目内不含可运行游戏。

## 从这里开始

| 资料 | 用途 |
| --- | --- |
| [完整设计](design/game-design.md) | 核心方向、人物、规律、范围与验收 |
| [第一夜完整流程](design/first-night.md) | A01–A52、N0–N8、H1–H6、道具、危险和存档 |
| [第二夜保留方向](design/second-night-direction.md) | 后续章节意图，尚待具体设计 |
| [场景资料](design/scene/README.md) | 几何、家具、门窗、路线和建模交接 |
| [场景可视总览](design/scene/index.html) | 本地查看米制图、已有概念图和逐场景资料 |
| [研究索引](research/INDEX.md) | 战时生活背景、建筑与素材参考 |
| [清理说明](CLEANUP.md) | 清理范围、备份与核验边界 |

## 目录

~~~
design/
  game-design.md
  first-night.md
  second-night-direction.md
  scene/
research/
tools/
AGENTS.md
README.md
CLEANUP.md
~~~

第一夜是已确认保留的设计；第二夜只有方向与入口。时长、氛围、可读性、碰撞与体验仍需灰盒和玩家试玩。重构引擎、技术架构与新工程尚未建立。

## 核验

PowerShell运行 .\tools\verify_geometry.ps1；Python运行 python -B tools/verify_project.py。绘图工具只在需要更新资料时运行，用法见场景入口。
