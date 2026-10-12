# 鸡仔城市探索

Cocos Creator 3.8.8 / TypeScript 微信小游戏项目。**自 2026-09-30 起，原支线 `experiments/living_city_v1/` 是唯一开发主线**。当前按用户最新要求使用“AI 生图 + 游戏代码加载 PNG”，实现茶摊街区、花园集市、河畔码头三关寻物旅程。

| 目录 | 用途 |
| --- | --- |
| [`experiments/living_city_v1`](experiments/living_city_v1/README.md) | **主线 Cocos 工程**：三关共 36 件物品、10 处翻找；第一关 16 名居民，后两关各 8 名。含寻物手账、通关切换与独立存档；微信本机预览已构建，真机尚未验收。 |
| 仓库根目录的旧 Cocos 工程 | 已停止开发，仅保留原玩法、源码和历史验收资料。 |

在 Cocos Creator 3.8.8 中打开 **`experiments/living_city_v1/`**，从 `bootstrap` 场景启动；构建、预览和测试命令均在该目录执行。目录名保留历史命名，项目 UUID 和现有资源路径沿用当前版本，主线成果无需合并回旧工程。详细运行步骤见[主线 README](experiments/living_city_v1/README.md)。

Cocos 的 `assets/`、资源 `.meta`、`settings/`、`package.json` 与 TypeScript 源码均已纳入版本管理；`build/`、`library/`、`temp/` 和本机微信开发者工具项目配置由各自环境生成。

生成原图、实际提示词和逐 ID 处理记录位于主线 `art/production/ai_image_v*`，实际批次以主线资产清单为准；最终 PNG 位于主线 `assets/generated/`，运行副本位于 `assets/bundles/`。两份旧 `art/asset_manifest.json` 中的历史参考可能未随仓库分发。当前素材状态为 `runtime_verified_visual_unapproved`，功能验证不等于玩家视觉批准。

项目目标与协作规则见 [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md)、[`AGENTS.md`](AGENTS.md)、[`IMPORTANT.md`](IMPORTANT.md) 和[主线协作约定](experiments/living_city_v1/AGENTS.md)；画面规范见 [`SIMPLE_2D_STYLE.md`](experiments/living_city_v1/docs/SIMPLE_2D_STYLE.md)，最新手账迭代见 [`LIVING_CITY_ITERATION_20.md`](experiments/living_city_v1/docs/LIVING_CITY_ITERATION_20.md)，微信构建与导入见 [WECHAT_PREVIEW.md](experiments/living_city_v1/docs/WECHAT_PREVIEW.md)。早期交接与迭代保留历史状态。
