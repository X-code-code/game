# 鸡仔城市探索

Cocos Creator 3.8.8 微信小游戏项目。仓库包含两个独立的 Cocos 源工程：

| 目录 | 用途 |
| --- | --- |
| 仓库根目录 | 已经过微信真机功能验收的原有探索玩法与城市基线。 |
| [`experiments/living_city_v1`](experiments/living_city_v1/README.md) | 当前正在试产的简化 2D 活街区：35 层街景、8 只小鸡、4 件寻物。它尚未合并到根工程，也未做微信真机验收。 |

在 Cocos Creator 中分别打开所需目录。Cocos 的 `assets/`、资源 `.meta`、`settings/`、`package.json` 与 TypeScript 源码均已纳入版本管理；`build/`、`library/`、`temp/` 和本机微信开发者工具项目配置由各自环境生成。

当前 2D 小样的可编辑美术源与逐 ID 记录位于 [`art/production`](experiments/living_city_v1/art/production)，运行资源位于该工程的 `assets/bundles/`。用户提供的参考图、目标视频抽帧、旧候选图、测试录屏和构建缓存未上传；两份 `art/asset_manifest.json` 中的旧图条目仅保留历史索引，部分路径因此不会在克隆后的仓库中存在。当前小样素材状态仍为 `trial_unapproved`。

项目目标与协作规则见 [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) 和 [`AGENTS.md`](AGENTS.md)；本轮小样的实现与验收见 [`SIMPLE_2D_PLAYABLE_SLICE_REPORT.md`](experiments/living_city_v1/docs/SIMPLE_2D_PLAYABLE_SLICE_REPORT.md)。
