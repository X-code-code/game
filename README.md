# 鸡仔城市探索

Cocos Creator 3.8.8 / TypeScript 微信小游戏项目。**自 2026-09-30 起，原支线 `experiments/living_city_v1/` 是唯一开发主线**。当前按用户最新要求使用“AI 生图 + 游戏代码加载 PNG”，实现茶摊街区、花园集市、河畔码头三关寻物旅程。

| 目录 | 用途 |
| --- | --- |
| [`experiments/living_city_v1`](experiments/living_city_v1/README.md) | **主线 Cocos 工程**：三关共 36 件不同物品、9 处翻找，每关 8 只活动小鸡，含飞入贴纸栏、通关切换与独立存档；Web Mobile 验证通过，微信真机尚未验收。 |
| 仓库根目录的旧 Cocos 工程 | 已停止开发，仅保留原玩法、源码和历史验收资料。 |

在 Cocos Creator 3.8.8 中打开 **`experiments/living_city_v1/`**，从 `bootstrap` 场景启动；构建、预览和测试命令均在该目录执行。目录名保留历史命名，项目 UUID 和现有资源路径沿用当前版本，主线成果无需合并回旧工程。详细运行步骤见[主线 README](experiments/living_city_v1/README.md)。

Cocos 的 `assets/`、资源 `.meta`、`settings/`、`package.json` 与 TypeScript 源码均已纳入版本管理；`build/`、`library/`、`temp/` 和本机微信开发者工具项目配置由各自环境生成。

生成原图、实际提示词和逐 ID 处理记录位于 [`art/production/ai_image_v4`](experiments/living_city_v1/art/production/ai_image_v4)，最终 PNG 位于主线 `assets/generated/`，运行副本位于 `assets/bundles/`。两份旧 `art/asset_manifest.json` 中的历史参考可能未随仓库分发。当前素材状态为 `runtime_verified_visual_unapproved`，功能验证不等于玩家视觉批准。

项目目标与协作规则见 [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md)、[`AGENTS.md`](AGENTS.md)、[`IMPORTANT.md`](IMPORTANT.md) 和[主线协作约定](experiments/living_city_v1/AGENTS.md)；画面规范见 [`SIMPLE_2D_STYLE.md`](experiments/living_city_v1/docs/SIMPLE_2D_STYLE.md)，三关与验收见 [`LIVING_CITY_ITERATION_07.md`](experiments/living_city_v1/docs/LIVING_CITY_ITERATION_07.md)。早期交接与迭代保留历史状态。
