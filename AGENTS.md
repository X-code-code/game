# 项目协作约定

## 当前主线（2026-09-30）

用户已明确放弃原项目作为开发方向，改以原支线 `experiments/living_city_v1/` 为唯一主线。后续功能、美术、城市内容、构建与验收均以该 Cocos 工程为准；目录名 `experiments` 仅为历史命名，不表示它仍是可选试验分支。

仓库根目录原 Cocos 工程的 `assets/`、`settings/`、`build/`、`package.json` 等仅保留为历史资料，不再继续开发，也不要求把主线成果合并回原工程。仓库级说明与协作规范仍在根目录维护。当前没有迁移目录或删除旧文件，主线项目 UUID 与已有未提交成果必须保留。

进入主线工作前读取 `experiments/living_city_v1/AGENTS.md`。主线有效画面规范为 `experiments/living_city_v1/docs/SIMPLE_2D_STYLE.md`，三关蓝图位于该工程的 `design/`，当前资产清单为该工程的 `art/asset_manifest.json`。旧水彩、代码绘制规范、旧阶段报告和旧候选只作历史参考；保留生成源图、实际提示词、处理记录和游戏内验收，不得恢复旧生产方式。

## 美术资源记录约定

用户于 2026-10-01 明确切换为“AI 生图 + 游戏代码加载图片”。先读根目录 `IMPORTANT.md`：所有游戏美术必须由内置图像生成制作，禁止 Python/Pillow ImageDraw、SVG、Canvas、Cocos Graphics 等代码绘图生成或重画建筑、角色、场景物件。最终 PNG 存入主线 `assets/generated/`；先替换建筑，再替换角色。旧规范中“生图仅作构思参考”及“可编辑代码绘制源”的限制已废止，保留的是生成源图、提示词、机械处理记录和游戏内验收。

用户于 2026-09-30 否定 `refined_city_v2` 画风，并指定 `C:/Users/24627/Desktop/bg-png` 四张实际截图作为参考。2026-10-01 最新要求覆盖旧代码绘制流程：按主线 `SIMPLE_2D_STYLE.md` 的 v4 手绘卡通 PNG 规范与 `ai_image_v4` 清单执行，柔和低饱和色、干净细线稿、轻微手绘质感、统一正面略俯视。`clean_cartoon_v3` 保留历史记录。参考选择和功能验证均不等于运行素材视觉批准。

项目总规范见 `docs/PROJECT_SPEC.md`。`docs/ART_WEB_HANDOFF_PROTOCOL.md` 保存原来的 Web 美术交接标准；用户随后明确改为**由 Codex 自行生成初版美术资源，并接入项目做验证**。本轮应使用内置图像生成、保留源图和提示词、进行机械后处理与游戏内验收，不等待 ChatGPT Web。Web 交接协议仍可用于日后用户选择交给 Web 的批次，不能反过来阻止本轮已授权的直接生成。

每次提出美术资源需求，先核对 `docs/ART_BIBLE.md`、`docs/ASSET_SPEC.md`、当前城市配置、`art/asset_manifest.json` 以及已有获批参考图。若执行 Web 交接，按 `art_requests/<batch_id>/` 生成规定的 3–4 个文件，提示词须自包含。若 Codex 直接生成，仍须按资产 ID 保存生成提示词、源图、处理记录和验收结果。始终区分源图生成规格与后处理得到的游戏最终规格。未批准的设计不得记为已批准素材，也不得用未生成的文件充当参考图。
