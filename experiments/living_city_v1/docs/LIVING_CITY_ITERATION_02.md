# 活街区试产迭代 02（2026-09-29）

本轮只改动 `experiments/living_city_v1` 独立工程，保留仓库根目录原游戏的运行资源、玩法和微信真机验收基线。素材仍为试产状态，尚未获得玩家美术批准；本轮尚未做微信真机验证。

## 场景与玩法

- 蓝图从 35 层扩为 38 层：南侧邮舍、南侧谷物铺、东侧陶器附屋各占独立 `building_back` 图层。两栋南侧建筑需向下拖动地图才能看全。主街、八只小鸡的路线、四件寻物的位置均未移动。
- 新建筑在 `design/street_block_01.json` 定位，在 `art/production/simple_city_scene_v1/render_scene.py` 以可编辑 2D 图形确定性绘制；源 PNG、Bundle PNG、Cocos `.meta`、场景清单和 SHA 验收记录均已同步。场景风格仍遵守 `docs/SIMPLE_2D_STYLE.md`。
- 底部原四行文字任务改为四张物品贴纸，图案直接复用各目标的 96×96 透明源图；每张贴纸有名称、完成印章和轻点后显示的街区线索。贴纸触摸与地图手势分开处理，拖动贴纸不会触发线索或寻找进度。
- 茶摊店员、买花者、看灯者和栗子摊主可点出各自的物件线索。它们是街区角色互动，不记为寻物成功。寻物本身仍使用原来的独立图层、局部前景遮挡和点击半径。
- 本独立工程现以 `chriken_living_city_v1_save_v1` 键自动保存逐项进度，重新进入可恢复贴纸印章与 `4/4`。旧工程使用不同的存档键。针对 Cocos Web Mobile 构建后的异常，ID 去重采用数组循环，避免对 `Set` 做展开后把 ID 序列化为对象。

## 验证

| 检查 | 结果 |
| --- | --- |
| `node tools/validate_street_block.mjs` | 38 图层、4 个连通公共区、8 条 NPC 计划、4 件语义目标通过。 |
| `art/production/simple_city_scene_v1/validate_exports.py` | 38/38 尺寸、Alpha、Bundle SHA 一致。 |
| `art/production/simple_city_scene_v1/validate_target_occlusion.py` | 四件物品遮挡率分别为 15.3%、18.1%、19.8%、19.4%，与新增建筑前一致。 |
| TypeScript `tsc --noEmit` 与 `node tools/save_manager.test.mjs` | 检查通过；存档测试 6/6。 |
| Cocos Creator 3.8.8 Web Mobile | CLI 退出码 36，日志包含 `build Task (web-mobile) Finished`。 |
| `LIVING_CITY_REQUIRE_ART=1 node tools/living_city_greybox_smoke.mjs` | 444×960 浏览器中 38 层与全部人物资源载入；NPC 线索、贴纸线索、四项逐一盖章与 `4/4`、刷新后恢复 `4/4` 均通过。拖动、缩放、重复点击及目标旁误点不误加进度；运行错误、警告和失败资源请求均为 0。 |

最后一轮本机截图保存在未纳入版本管理的 `art/review/living_city_iteration_02_final_verified/`，包括初始画面、NPC 对话、目标局部及刷新后的贴纸。可在本工程运行 `node tools/serve_web_mobile.mjs`，用浏览器打开 `http://127.0.0.1:8788/` 试玩当前构建。
