# 迭代 05：街区美术细化与十二件寻物

日期：2026-09-30。工程：`experiments/living_city_v1`，当前唯一开发主线。用户要求更精致美术、更多可玩元素和更多需要找的物品。

**历史批次说明：** 用户随后否定本轮美术，指定 `bg-png` 作为新方向。十二件寻物玩法保留，当前运行美术和验证以[迭代 06](LIVING_CITY_ITERATION_06.md)为准；下面描述和命令仅对应 v2。

## 可玩变化

街景从 40 层扩为 44 层，保留当前暖色近俯视 2D 风格。街屋增加分行瓦片、窗框、木纹、门阶和攀花；茶摊、花架与热食车重绘陈设，补充釉陶、布幌、杯盏、植物和材质细节。NPC 仍为原有 8 只，保留生活路线、茶摊交接与 3 处环境动态；本轮没有新增角色动画数量。

寻物由 4 件增加为 12 件，每件都有独立图片、承托位置、点击区、贴纸和文字线索。

| 物品 | 寻找区域 | 条件 |
| --- | --- | --- |
| 陶哨 | 茶摊杯盏旁 | 直接寻找 |
| 顶针 | 裁缝针线盘 | 直接寻找 |
| 绳结 | 街口横幅 | 直接寻找 |
| 栗子夹 | 栗子车纸包旁 | 直接寻找 |
| 怀表 | 茶客小桌 | 直接寻找 |
| 剪刀 | 裁缝布料工作架 | 直接寻找 |
| 蓝羽毛 | 长凳 | 直接寻找 |
| 信封 | 南边邮舍包裹箱 | 点击打开包裹箱，再寻找信封 |
| 蜜勺 | 茶摊补给角 | 直接寻找 |
| 种子袋 | 路边花架 | 点击拨开花叶，再寻找种子袋 |
| 红苹果 | 路边果蔬筐 | 直接寻找 |
| 小包子 | 热食车蒸笼 | 点击掀开盖布，再寻找包子 |

三处翻找均使用独立的关闭/打开图片。翻找动作只揭示物品，不增加寻物计数；打开状态立即存档。提示系统对尚未揭示的物品先指向对应翻找点。底栏改为两排、每排六张贴纸，点击贴纸可读线索。沿用约 0.60 秒飞入、0.28 秒落位反馈，最后一件完成弹窗等待动画结束。

补充地图底栏预留边界，使南端包裹箱可拖到贴纸栏上方；预留只在竖屏街区底栏可见时生效。移除试玩中的性能调试浮层，放大贴纸名称，并为底栏周边保留暖色底面。

## 美术来源和规格

本轮使用内置图像生成制作方向参考，实际输出为 **1086×1448 RGB**。真实提示词、未改动源图及 SHA-256 保存在 [`art/production/refined_city_v2`](../art/production/refined_city_v2/PROMPT.md)。生成参考不进入运行场景，也不标为获批美术。

运行图片由 `render_refined.py` 的可编辑绘制源确定性导出，依赖保留的 v1 场景和物品绘制源。共 **62 张**：44 场景层、12 寻物图、6 互动状态图。场景与互动按蓝图画布导出，寻物源画布为 96×96，游戏内按每件 `visualSize` 显示。源图生成规格与游戏最终规格分别记录；源 PNG、导出 PNG、逐 ID 说明、Alpha、尺寸、哈希与 Cocos 元数据均有清单。

旧 `simple_city_scene_v1` 和 `simple_hidden_objects_v1` 的源文件保留，其运行批次已被新批次替代。旧批次哈希报告不能用于验证当前 Bundle；当前权威资源清单为 `art/asset_manifest.json` 和 `refined_city_v2/production_manifest.json`。状态保持 `trial_unapproved`，等待玩家视觉审阅。

## 验收

| 检查 | 结果与证据 |
| --- | --- |
| 蓝图、支撑、路线与遮挡配置 | `node tools/validate_street_block.mjs` 通过：44 场景槽、4 个连通公共区域、8 个 NPC 计划、12 件寻物 |
| 导出机械检查 | `verify_refined.py` 通过 62 张图的源/运行一致性、尺寸、Alpha、哈希与元数据；打开图片对信封/种子袋/包子的遮挡占比分别约 19%/6.3%/2.5% |
| TypeScript | Creator 自带 TypeScript 的 `--noEmit` 检查通过 |
| 逻辑回归 | 寻物、提示、配置、存档及视口 35 项通过；包括旧四物品进度保留、翻找不计数及底边目标可达性 |
| Cocos Web Mobile | 构建通过；独立临时 Edge 实际点击验收：44 层加载、12 件收集、3 处揭示、即时存档、重复点击去重、刷新恢复、最后落位等待完成弹窗 |
| 手机画幅与生活活动 | 444×960 / 360×780 检查底栏；10 秒无操作确认至少 3 个居民位移，茶摊交接在完整试玩中完成 |
| 浏览器运行 | 0 运行错误、0 运行警告、0 资源加载失败；不作为微信真机帧率证明 |

机械及运行摘要保存在 `art/production/refined_city_v2/qa_report.json`。本机运行详单和截图在 `art/review/refined_city_v2/`；该审核目录不随 Git 分发。静态拼图位于制作批次的 `review/`，只作布局检查，不替代 Cocos 游戏截图。

微信真机、真机内存/帧率、完整玩家寻物难度和素材视觉批准仍未完成。本轮不增加第二城市，不宣称整个产品规格已结项。未执行 Git 提交、推送或 PR。

## 重现

在本工程目录执行：

```powershell
node tools/author_refined_street.mjs
node tools/sync_street_block.mjs
node tools/validate_street_block.mjs
python art/production/refined_city_v2/render_refined.py
python art/production/refined_city_v2/verify_refined.py
node --experimental-strip-types --test tools/save_manager.test.mjs tools/city_config_validator.test.mjs tools/hidden_object.test.mjs tools/hint_manager.test.mjs tools/city_viewport.test.mjs
```

Python 需 Pillow。随后在 Cocos Creator 3.8.8 构建 Web Mobile，再运行 `node tools/refined_city_smoke.mjs` 和 `node tools/finalize_refined_review.mjs`。浏览器脚本只使用自己的临时配置目录，结束后清理该目录。最后运行 `node tools/serve_web_mobile.mjs`，通过 `http://127.0.0.1:8788/` 试玩。
