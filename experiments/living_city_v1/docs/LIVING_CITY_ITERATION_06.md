# 迭代 06：按 bg-png 调整卡通画风

需求日期：2026-09-30；收尾日期：2026-10-01。用户否定上一轮美术的“人机、AI 感”，指定 `C:/Users/24627/Desktop/bg-png` 作为新参考。主线仍为 `experiments/living_city_v1`，游戏玩法和存档沿用当前十二件寻物版本。

## 实际变化

采用清楚的棕灰描边与明快平涂，把灰米色整体滤色改为灰路面、黄绿院落、珊瑚红/青蓝/淡紫店铺。道路移除随机细划痕，以较少的大块铺砖和过街线组织空间。建筑重画檐口厚度、侧墙、凹入橱窗、门阶和用途招牌；茶摊、花架与树冠重画为可读的大轮廓。去掉上一版细木纹和随机碎花点，保留道具的用途和承托关系。

12 件物品与 6 张互动状态图重新按公共色板绘制。信使 29 张动作帧从原有可编辑几何重新导出，保留各方向、逐帧承重、递杯动作和 `(128,215)` 脚点；其余 7 位程序绘制居民使用同一色板。底栏、收集贴纸和提示按钮同步调整。没有增加新的角色或动作数量。

12 件寻物、打开箱子/拨开花叶/掀盖布、线索、飞入贴纸栏、落位后弹出完成界面及刷新恢复均保留。物品位置、点击区、角色路线和关卡几何没有改动。

## 来源和状态

四张实际参考已逐张查看，副本保留在 `art/reference/bg_png_20260930`；尺寸及 SHA-256 见 [`reference_record.json`](../art/production/clean_cartoon_v3/reference_record.json)。用户选定的是宽泛绘画语言，不能把参考图或本轮游戏素材记为已经获批。

内置 image_gen 生成的方向研究图实际为 **1081×1455 RGB**，源图、精确提示词和哈希保存在 [`clean_cartoon_v3`](../art/production/clean_cartoon_v3/PROMPT.md)。研究图只作参考。游戏没有使用参考截图或生成图的像素，角色和店铺保持原创。

运行资源从 [`render_clean.py`](../art/production/clean_cartoon_v3/render_clean.py) 的可编辑几何导出。逐 ID 清单为 [`production_manifest.json`](../art/production/clean_cartoon_v3/production_manifest.json)，共 **91 张**：44 场景层、12 物品、6 互动状态图、29 信使动作帧；另有 7 个 TypeScript 绘制居民。PNG、角色 SVG 源、导出过程、Alpha、尺寸、哈希和 Cocos 元数据均保留。已有资产 ID 与 UUID 沿用，未删除旧批次。

上一轮 `refined_city_v2` 美术登记为用户否定，功能验收仍是历史事实。当前风格为 `chicken_clean_cartoon_v3`，素材状态 `trial_unapproved`；视觉接近性仍须由玩家评价。

## 验收范围

| 检查 | 结果 |
| --- | --- |
| 机械导出 | 91 张源/运行 PNG 匹配，尺寸、Alpha、哈希、Cocos 裁切数据与 UUID 检查通过；29 张角色 SVG 哈希和脚点范围检查通过 |
| 揭示可见性 | 打开图片对信封/种子袋/包子的覆盖约 19.8%/7.2%/5.8%，独立物品可露出 |
| 类型和蓝图 | Creator TypeScript `--noEmit` 通过；44 场景槽、4 连通区域、8 NPC 计划、12 目标配置通过 |
| 游戏构建 | Cocos Creator 3.8.8 Web Mobile 构建完成 |
| 手机画面 | 444×960 / 360×780 两种画幅，12 张贴纸保持可见；游戏最大 2.25 倍镜头检查及恢复通过 |
| 生活活动 | 10 秒无操作观察居民位移；完整试玩中信使茶摊交接完成 |
| 点击和存档 | 12 件完整收集，3 处翻找不提前计数、状态存档、前置提示解析、重复点击去重、拖动不拾取、完成弹窗等待落位、刷新恢复全部通过 |
| 浏览器运行 | 0 运行错误、0 运行警告、0 资源加载失败 |

当前证据与摘要见 [`qa_report.json`](../art/production/clean_cartoon_v3/qa_report.json)。本机 Cocos 截图和运行详单位于 `art/review/clean_cartoon_v3`；该审核目录不随 Git 分发。制作批次 `review/` 中的静态拼图只作空间检查，不是游戏截图。

这轮是既有街区上的画风调整。参考图更丰富的建筑变化、道具密度和小事件没有全部复现，不能据此宣称达到商业级美术完成度。微信真机、真机帧率及玩家视觉批准仍未完成。未提交、推送或创建 PR。

## 重现与试玩

在主线目录中运行：

```powershell
python art/production/clean_cartoon_v3/render_clean.py
python art/production/clean_cartoon_v3/verify_clean.py
node tools/validate_street_block.mjs
```

Python 需要 Pillow。随后用 Cocos Creator 3.8.8 构建 Web Mobile，运行 `node tools/clean_cartoon_smoke.mjs`、`node tools/finalize_clean_review.mjs` 完成当前批次验收。当前不要重新运行 v1/v2 的绘制器，否则会替换回历史画风。

运行 `node tools/serve_web_mobile.mjs`，通过 `http://127.0.0.1:8788/` 试玩最新构建；已打开的页面刷新即可。
