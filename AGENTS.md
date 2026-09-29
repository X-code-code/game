# 项目协作约定

项目总规范见 `docs/PROJECT_SPEC.md`。`docs/ART_WEB_HANDOFF_PROTOCOL.md` 保存原来的 Web 美术交接标准；用户随后明确改为**由 Codex 自行生成初版美术资源，并接入项目做验证**。本轮应使用内置图像生成、保留源图和提示词、进行机械后处理与游戏内验收，不等待 ChatGPT Web。Web 交接协议仍可用于日后用户选择交给 Web 的批次，不能反过来阻止本轮已授权的直接生成。

每次提出美术资源需求，先核对 `docs/ART_BIBLE.md`、`docs/ASSET_SPEC.md`、当前城市配置、`art/asset_manifest.json` 以及已有获批参考图。若执行 Web 交接，按 `art_requests/<batch_id>/` 生成规定的 3–4 个文件，提示词须自包含。若 Codex 直接生成，仍须按资产 ID 保存生成提示词、源图、处理记录和验收结果。始终区分源图生成规格与后处理得到的游戏最终规格。未批准的设计不得记为已批准素材，也不得用未生成的文件充当参考图。
