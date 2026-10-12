# 鸡仔城市探索：三关寻物旅程

**自 2026-09-30 起，本工程是项目唯一开发主线。** 后续功能、城市内容、美术、构建与验收都从当前版本继续。`experiments/living_city_v1` 保留历史目录名和项目 UUID；仓库根目录原 Cocos 工程已停止开发，仅保留为历史资料，主线成果无需合并回旧工程。

这是 Cocos Creator 3.8.8 源工程。当前可玩旅程为 **茶摊街区 → 花园集市 → 河畔码头**。每关有 12 件不同物品；第一关有 4 处翻找机关和 16 名居民，后两关各有 3 处机关和 8 名居民，共 36 件物品、10 处翻找。点击底部寻物手账卡片或提示按钮可查看线索，点居民可获得场景线索；找到物品会飞入卡片。通关后可继续逛当前地图，或前往下一关。每关的收集与翻找状态单独自动保存，重新打开后恢复当前关卡。

建筑、植物、摊位、家具、道具、鸡动作和 UI 均使用内置图像生成制作的 PNG。代码只加载、摆放、播放帧和处理交互；不使用代码绘图制作游戏美术。素材已做实际 Web Mobile 验证，玩家视觉批准和微信真机验收仍待完成。

## 打开与验证

1. 在 Cocos Creator 3.8.8 中打开此目录，从 `bootstrap` 场景启动，构建 `Web Mobile`；生成结果在本目录的 `build/web-mobile/`，该目录不纳入 Git。
2. 在本目录运行 `node tools/serve_web_mobile.mjs`，用浏览器打开 `http://127.0.0.1:8788/` 试玩本机构建。
3. `node tools/validate_generated_art.mjs` 核对生成来源、原图与导出 SHA、透明像素、全部 SpriteFrame 尺寸、UUID 和角色注册。
4. `node tools/three_chapter_smoke.mjs` 启动隐藏 Edge，用实际输入逐关完成 36 次拾取、10 次翻找和两次切关，检查刷新恢复、两种手机画幅、最大缩放、动画和资源请求。脚本只清理自己的工作区临时浏览器目录。旧批次浏览器脚本保留历史记录，不作为当前验收。
5. 逻辑回归：`node --test tools/city_config_validator.test.mjs tools/city_viewport.test.mjs tools/save_manager.test.mjs tools/hidden_object.test.mjs tools/hint_manager.test.mjs tools/task_manager.test.mjs tools/city_content_loader.test.mjs`。

微信本机预览：执行 `tools/build_wechat_preview.ps1`，微信开发者工具导入本工程 `build/wechatgame/`，再启动 `node tools/serve_wechat_resources.mjs` 提供远程图片。程序包约 3.02 MiB，三城图片等远程资源合计约 80.31 MiB。具体构建、验收和真机配置见 [WECHAT_PREVIEW.md](docs/WECHAT_PREVIEW.md)。

最终 PNG 位于 `assets/generated/`，城市 Bundle 内是相同字节的运行副本；原始生图、真实提示词和逐 ID 处理记录在 `art/production/ai_image_v*/`，实际批次见 `art/asset_manifest.json`。历史代码绘制文件保留，不参与当前三关显示。清理测试缓存和排除历史打包资源不删除生成源图、提示词或资源 UUID。

当前规范见 [SIMPLE_2D_STYLE.md](docs/SIMPLE_2D_STYLE.md) 和 [AI_ART_PIPELINE.md](docs/AI_ART_PIPELINE.md)，最新手账内容与证据见 [迭代 20](docs/LIVING_CITY_ITERATION_20.md)。较早迭代记录保留历史状态。
