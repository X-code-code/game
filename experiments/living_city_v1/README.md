# 简化 2D 活街区试产工程

这是独立的 Cocos Creator 3.8.8 源工程。当前可玩小样包含 35 层近俯视街景、8 只会转向与活动的小鸡、3 处程序绘制环境动态、4 件带局部前景遮挡的寻物。它用于验证新的 2D 制作方法，尚未获玩家美术批准，也尚未在微信真机运行。原工程位于仓库根目录，两者各有自己的 `assets/`、`settings/` 和项目 UUID。

## 打开与验证

1. 在 Cocos Creator 3.8.8 中打开此目录，构建 `Web Mobile`；生成结果在本目录的 `build/web-mobile/`，该目录不纳入 Git。
2. 在本目录运行 `node tools/serve_web_mobile.mjs`，用浏览器打开 `http://127.0.0.1:8788/` 试玩本机构建。
3. 运行 `node tools/validate_street_block.mjs` 检查地图、NPC 路线与目标；运行 `node tools/living_city_greybox_smoke.mjs` 检查构建后的交互。自动浏览器脚本需要本机 Edge 和已启动的预览服务。

角色、场景和隐藏物的可编辑绘制代码、逐 ID 规格、导出记录与机械验收保留在 `art/production/`；游戏使用的 PNG 与 Cocos `.meta` 位于 `assets/bundles/city_living_city_street_block_01/`。参考图、旧候选和录屏审核文件未上传。`art/asset_manifest.json` 的历史条目可能指向这些未随仓库分发的本地参考，当前运行资产可独立构建。

详见 [`docs/SIMPLE_2D_STYLE.md`](docs/SIMPLE_2D_STYLE.md) 和 [`docs/SIMPLE_2D_PLAYABLE_SLICE_REPORT.md`](docs/SIMPLE_2D_PLAYABLE_SLICE_REPORT.md)。
