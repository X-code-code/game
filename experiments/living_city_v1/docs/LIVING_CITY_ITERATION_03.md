# 活街区整体比例修订 03（2026-09-29）

状态：**本地可玩试产候选**。用户指出栗子摊主穿模、房屋和马路过大、街区整体粗糙；本轮沿用简化、可程序绘制的 2D 风格调整场景。美术方向尚待玩家复看，微信真机尚未验证。本轮只改 `experiments/living_city_v1` 独立工程及仓库根 README，未改根工程的运行资源。

## 本轮改动

- 可见主纵路宽度约从 615 缩到 416 世界单位，横街约从 262 缩到 190；可走区域仍覆盖路侧人行带，四片公共区域保持连通。没有整体缩放地图或角色，正常镜头下小鸡仍约 79 屏幕像素高。
- 原四栋宽大店屋的图层改画为八个较小的沿街立面，区分屋顶、门窗、商品陈列；南端邮舍、谷物铺改为主屋配窄附屋或装卸棚。新增茶摊补给角与裁缝送货凳，物件均有对应店铺用途和承托面。街景 `artSlots` 从 38 增到 40。
- 栗子车从东南食品店立面前移到街边 `(270,-430)`，摊主脚点改到左侧地面 `(150,-430)` 并朝向车，夹子及其前景遮挡移到 `(253,-407)`。车轮只在近侧前层绘制一次；静态前沿与小鸡脚线同深度时优先遮住角色。板栗摊的几何校验新增防止车和摊主压入店面的检查。
- 源图由 `art/production/simple_city_scene_v1/render_scene.py` 确定性绘制，40 张源 PNG、运行 Bundle PNG、Cocos `.meta`、蓝图及城市场景配置同步。重绘图层的裁剪数据已刷新，原 UUID 保留。

## 验证

| 检查 | 结果 |
| --- | --- |
| `node tools/validate_street_block.mjs` | 40 图层、4 个连通公共区、8 条 NPC 计划、4 件语义目标通过，新增栗子摊位置检查通过。 |
| `art/production/simple_city_scene_v1/validate_exports.py` | 40/40 源图尺寸、Alpha、SHA 与 Bundle 副本一致。 |
| `art/production/simple_city_scene_v1/validate_target_occlusion.py` | 四件物品的局部遮挡率为 15.3%、18.1%、19.8%、19.4%。 |
| TypeScript `tsc --noEmit` | 通过。 |
| Cocos Creator 3.8.8 Web Mobile | 本轮新构建完成；本地日志 `temp/city_redesign_build2_stdout.log` 含 `build Task (web-mobile) Finished`。 |
| `LIVING_CITY_REQUIRE_ART=1 node tools/living_city_greybox_smoke.mjs` | 444×960 浏览器中 40/40 场景层载入、8 NPC 活动、4 件寻物逐一完成并刷新恢复 `4/4`；拖动、缩放、重复点击及近旁误点不误加进度；运行错误、警告、失败资源请求均为 0。 |
| 栗子摊画面复核 | 摊主双脚在车左侧地面，朝向车；车轮和食品店立面与角色分开，原有穿模消失。 |

对照截图保存在未纳入版本管理的 `art/review/living_city_redesign_01/`，其中 `initial_444x960.png` 为新初始视图，`chestnut_tongs_focus_444x960.png` 为栗子摊局部。可在工程目录运行 `node tools/serve_web_mobile.mjs` 后打开 `http://127.0.0.1:8788/` 试玩当前构建。下一次玩家审看主要确认街屋密度、细节丰富度和寻物难度；这些视觉判断不能由机械验收代替。
