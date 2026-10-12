---
status: handoff-ready
branch: main
date: 2026-10-12
baseline_commit: 68663b3c84242737713b819c2eb618953890604a
---

# 鸡仔城市探索：新会话交接

本文最初整理的是 2026-10-12 接手前状态。用户希望以 `experiments/living_city_v1` 为唯一主线继续协作。接手后的 v18 进展见下节；后续工作以用户最新指示为准。

## 0. v18 接手补充（2026-10-12）

用户已接受先收敛基础游玩，暂停策划 PPT 约 117 个角色的追加制作计划。本轮复用既有 AI PNG，优化首次操作说明、现有无遮挡首件物品的观察位置、免费“帮我找”、翻找后反馈及完成/恢复流程。找齐后可以再逛或去下一站；已完成城市恢复时只显示顶部旅程入口，不自动弹完成窗口。侦探界面形象仍属后续计划，没有接入新角色美术。

三城仍为 12/12/12 个目标、4/3/3 个机关、16/8/8 名居民。第一城仍为 65 场景槽、11 建筑、`relaxed_twelve_v16`。本轮没有新生图、目标、家具或角色替换；蓝图、居民路线、资源 UUID、有效旧存档和解锁保留。

141 项逻辑测试、类型检查、最后 Web Mobile 与微信构建通过。本轮完整 Web 循环实际完成 36 次收集、10 次翻找及旧部分进度/解锁恢复；末次完成入口和文案微调后另测三城各一次最终拾取、三画幅共九样本。两批证据分开登记，详见 `docs/LIVING_CITY_ITERATION_21.md` 和 `docs/BASIC_PLAYABLE_SCOPE_2026-10-12.md`。

本机 Web 服务仍为 8788，微信图片服务为 8790。微信包已更新并验证 675 张 PNG 的路径/UUID/SHA，没有操作开发者工具或恢复自动微信验收。后续微信仍由用户试玩；真机、HTTPS 正式资源部署、上传和最终视觉批准尚未完成。

用户已要求将本轮成果推送 GitHub，本文随本轮源码和说明一并纳入提交。下文 `baseline_commit=68663b3` 及较早验证数值是接手前历史基线；当前 HEAD 以 `git log -1` 为准，不将旧基线描述当作 v18 当前状态。

## 1. 工程与接手入口

| 项目 | 当前值 |
| --- | --- |
| Git 仓库根目录 | `E:/workspace/chriken` |
| 唯一主线工程 | `E:/workspace/chriken/experiments/living_city_v1` |
| GitHub | https://github.com/X-code-code/game |
| 分支 | `main` |
| 当前已推送提交 | `68663b3c84242737713b819c2eb618953890604a` |
| 引擎 / 语言 | Cocos Creator 3.8.8 / TypeScript |
| 主线项目 UUID | `b8963bba-0ba0-478d-a0f9-cc48232a2531` |
| 启动场景 | 主线 `assets/scenes/bootstrap.scene` |

仓库根目录的原 Cocos 工程仅作历史资料，不继续开发。不要打开根工程代替主线，不要将成果合并回旧工程，也不要擅自迁移主线目录或重建资源 UUID。`experiments` 只是历史目录名。

先读这些文件：

1. `E:/workspace/chriken/AGENTS.md`
2. `E:/workspace/chriken/IMPORTANT.md`
3. `E:/workspace/chriken/experiments/living_city_v1/AGENTS.md`
4. `E:/workspace/chriken/experiments/living_city_v1/README.md`
5. `E:/workspace/chriken/experiments/living_city_v1/docs/SIMPLE_2D_STYLE.md`
6. `E:/workspace/chriken/experiments/living_city_v1/docs/AI_ART_PIPELINE.md`
7. `E:/workspace/chriken/experiments/living_city_v1/docs/LIVING_CITY_ITERATION_20.md`
8. `E:/workspace/chriken/experiments/living_city_v1/docs/WECHAT_PREVIEW.md`

旧的 `E:/workspace/chriken/docs/AGENT_HANDOFF_2026-09-30.md` 已过时，仍留在本地，不能用它的数量、画风、代码绘图规范或未推送描述覆盖本文。`OVERHAUL_PLAN_20261001.md` 中早期扩充目标的计划也已经被用户后续的“只优化现有内容”要求覆盖。

## 2. 用户已确定的边界

- **只优化现有内容，不新增寻物目标，不堆叠家具。** 不因历史文档写过 24/32 目标、6/8 机关而重新补回任务。
- 优先轻松探索、合理布景、点击体验和整屏画面。用户反复指出过建筑/道路/家具位置不合理、小物比背景更清晰而显得漂浮、小鸡动画和表情僵硬、提示生硬、物品栏简陋等问题。
- 当前美术全部采用 **内置 AI 生图 + 游戏代码加载 PNG**。禁止用 Python/Pillow ImageDraw、SVG path、Canvas、Cocos Graphics 或其他程序绘图生成、重画建筑、角色和道具。代码只加载、摆放、缩放、分层、播放动画和处理交互。
- 可机械裁切、重采样、统一透明画布、检查 Alpha 与注册；不能描线、补画或编造资产来源。保留生成原始字节、真实提示词、处理记录与运行证据。
- 风格：可爱治愈的 2D 手绘卡通、柔和低饱和色、干净细线稿、轻微手绘质感，统一正面略俯视。避免写实 3D 和几何拼接感。
- 原参考截图目录 `C:/Users/24627/Desktop/bg-png`；原参考视频 `C:/Users/24627/Desktop/2d3072e3abcf64fb5916032c76e95126.mp4`。这些是本机参考，不能假定新机器存在；参考方向不等于用户批准当前运行画面。
- 保留目标 ID、图片 UUID、有效旧存档及已解锁关卡。变动承托物时，目标、容器、前沿、点击点和碰撞底座须同步核对。
- 用户已说“可以了，剩下的我自己测”，自动微信验收已停止。交接本身不授权恢复自动点击、重载、清存档或重启开发者工具。

## 3. 当前三关的实际内容

以 live catalog、城市配置和蓝图为准：

| 城市 ID | 名称 | 地图 | 场景槽 | 建筑 | 居民 | 目标 | 翻找 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `living_city_street_block_01` | 茶摊街区 | 2304×2048 | 65 | 11 | 16 | 12 | 4 |
| `living_city_garden_market_02` | 花园集市 | 1536×2048 | 26 | 5 | 8 | 12 | 3 |
| `living_city_harbor_walk_03` | 河畔码头 | 1536×2048 | 25 | 5 | 8 | 12 | 3 |

共 36 件目标、10 个翻找机关。第一关 `targetRevision=relaxed_twelve_v16`，12 个目标 ID：

```text
reading_glasses, seed_packet, pocket_watch, golden_bun,
postcard, paper_boat, tiny_camera, sewing_scissors,
sealed_letter, garden_glove, picnic_cookie, enamel_mug
```

第一关仅保留花叶、蒸笼盖、包裹箱、野餐篮四个翻找机关。退出任务的 20 个目标和四个机关保留历史资源，但不重新加载进当前任务。旧 32/32 按现有目标恢复为 12/12，部分进度按有效收集 ID 交集恢复。

主线保存键：`chriken_living_city_v1_save_v1`。原工程键不同；不要清除整个 localStorage/微信存储来处理普通警告。

## 4. 最近完成的优化

- **v14**：目标栏适配手机，线索两行；选中卡片对应提示目标或未打开的容器，收集后清除选择。
- **v15**：只调整八个既有布景实例，使蓝店与庭院、餐桌与入口、洗手台、果蔬架、花架和挂旗关系更合理；目标及交互相关点同步移动。第一关仍为 65 场景槽，没有新增 PNG。
- **v16**：第一关从 32 个目标减为 12 个，机关从 8 个减为 4 个；保持 ID 和存档连续。
- **v17**：现有目标栏改为寻物手账，独立标题/进度、两行纸质卡片、暖黄选中、浅绿勾选、两行线索。两次实际生图得到两个透明 PNG，三个城市共六条 Bundle 注册。卡片与底板整体缩放，避免横屏九宫格圆角挤占内容。
- 角色动作和场景高清优化属于较早 v11/v12：第一关 16 名居民用真实 PNG 帧、错开的待机眨眼，走路 0.1 秒/帧、岗位动作 0.18 秒/帧。这里的动画帧间隔不等于游戏渲染帧率。

当前场景、目标、角色和 UI 混用多个真实生产批次；只有手账底板与卡片是 v17，其他通用 UI 仍为 v4。场景高清导出是 v13，布局是 v15，目标选择是 v16。实际映射在主线 `art/asset_manifest.json`，不能把所有美术记成同一最新批次。

## 5. 代码、资源和记录入口

以下路径相对于唯一主线工程：

| 路径 | 用途 |
| --- | --- |
| `assets/resources/configs/city_catalog.json` | 当前三城目录和初始城市 |
| `design/street_block_01.json` 等 | 三城蓝图：布景、站位、路线与事件 |
| `assets/bundles/city_living_city_*/city.json` | 运行城市、目标、机关与任务配置 |
| `assets/bundles/city_living_city_*/<chapter>.json` | Bundle 中实际加载的蓝图副本 |
| `assets/scripts/map/MapBrowserDemo.ts` | 手账、提示入口、选择、拾取反馈 |
| `assets/scripts/map/LivingCityGreybox.ts` | 图层、居民、布景、路线和场景事件；名字沿用历史，不代表可交付灰盒美术 |
| `assets/scripts/character/CelAnimationPlayer.ts` | PNG 帧播放、时钟与待机表情 |
| `assets/scripts/config/CityContentLoader.ts` | Bundle、城市和 PNG 依赖加载 |
| `assets/scripts/city/CityManager.ts` | 城市挂载、旅行、进度恢复 |
| `assets/scripts/save/SaveManager.ts` | 自动保存、旧进度协调 |
| `assets/scripts/hint/HintManager.ts` | 选中目标优先提示 |
| `assets/generated/` | 正式生成 PNG；Bundle 内是运行副本 |
| `art/production/ai_image_v*/` | 生图原稿、提示词、处理参数与 SHA |
| `art/production/scene_staging_v15/` | v15 布景修订记录 |
| `art/production/target_reduction_v16/` | v16 目标缩减记录 |
| `art/review/` | 本机验收证据，Git 忽略，不进入包 |

改动蓝图时核对 `design` 和 Bundle 副本；不要只改设计文件却让运行包加载旧版本。做美术前还需核对 `docs/ART_BIBLE.md`、`docs/ASSET_SPEC.md`、当前配置与资产清单。

## 6. 构建与本机试玩

以下命令在 `E:/workspace/chriken/experiments/living_city_v1` 执行。

### 微信小游戏

```powershell
& ./tools/build_wechat_preview.ps1
node ./tools/serve_wechat_resources.mjs
```

微信开发者工具选择小游戏，导入：

```text
E:/workspace/chriken/experiments/living_city_v1/build/wechatgame
```

AppID：`wx0b7a70c6f50f1ba7`，竖屏。不要导入仓库根目录或 Creator 源工程目录。

当前程序主包约 **3.02 MiB**；三个城市远程资源共 **80.31 MiB**，分别约 44.17 / 19.07 / 17.08 MiB。675 张有效 PNG 未降画质，逐张 SHA 与源文件一致。只打包现行三城，排除 1,202 个历史/重复源文件约 128.15 MiB，但源文件本身保留。

资源服务只监听 `http://127.0.0.1:8790/remote/`，模拟器试玩需要它运行。新会话须检查现有服务，不能假定旧工具会话仍存活，也不要重复启动占用端口。此前浏览器试玩用过 8789；微信资源端口是 8790，不能混淆。

当前为本机预览配置：域名校验关闭，`remote/` 不随程序包上传。手机/正式发布须另行部署可访问的 HTTPS 图片资源、配置下载域名并恢复校验；仅有 3.02 MiB 程序包不能离线显示全部美术。没有上传微信或验证真机。

构建工具要点：Creator 成功命令行构建在本机退出码为 36；脚本同时检查本次日志确实出现 `build Task (wechatgame) Finished`，然后校验输出。当前 Creator 要求 `configPath` 用相对路径。三个城市的 `wechat_city_remote` 仅在微信平台远程、合并 JSON；Web/native 仍为本地。MD5 版本缓存避免远程旧资源被复用。

### Web Mobile

Creator 3.8.8 打开主线，从 bootstrap 场景构建 Web Mobile。构建目录为主线 `build/web-mobile`。

```powershell
node ./tools/serve_web_mobile.mjs
```

默认地址 `http://127.0.0.1:8788/`；可用 `LIVING_CITY_PREVIEW_PORT` 指定其他端口。浏览器已有旧服务不代表构建是最新版本。

## 7. 真实验收结果与限制

| 验证范围 | 实际状态 |
| --- | --- |
| 2026-10-12 提交前逻辑测试 | 132 项通过 |
| TypeScript、21 个本轮 JS 文件、两个 PowerShell 文件语法 | 通过 |
| 生成来源、Alpha、UUID、SHA、第一关布局、资产白名单 | 通过 |
| 2026-10-09 v17 Web 完整三关 | 36 次收集、10 次翻找、旅行和存档恢复通过 |
| v17 手账 Web 画幅专项 | 360×780、444×960、960×540 点击、线索、选择、拾取与刷新通过 |
| 2026-10-10 微信资源 HTTP | 681 个文件、配置和 PNG GET/SHA 验证通过 |
| 微信模拟器实际显示和动画 | 第一关 65 图层、12 目标、4 机关、16 居民和手账加载；超过 12 秒采样，全部居民切换真实 PNG 帧 |
| 微信完整三关交互与重载 | **尚未完成**，CLI 连接/重载阻塞后用户接管 |
| 微信真机、正式上传 | **未执行** |
| 用户最终视觉批准 | **pending** |

本机证据目录：

- 主线 `art/review/ai_image_v17/tray_verified/tray_report.json`
- 主线 `art/review/ai_image_v17/three_chapters/runtime_report.json`
- 主线 `art/review/wechat_v17/runtime_2026-10-10T07-20-57-159Z_22472/runtime_report.json`
- 主线 `art/review/wechat_v17/build_report.json`、`http_report.json`

这些本机文件未上传 GitHub。跟踪文档保留验收结论与路径，不得伪造缺失的媒体或报告。2026-10-12 只复核既有微信包，没有重新构建或重新操作模拟器；输出中的本机私有配置会使程序包精确字节数略有变化。

后续有代码修改时，按影响范围验证。常用只读/逻辑检查命令：

```powershell
node --test tools/*.test.mjs
node tools/validate_street_block.mjs
node tools/validate_generated_art.mjs
node tools/wechat_active_assets.mjs
node 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript/bin/tsc' --noEmit -p tsconfig.json
```

逻辑测试用本机 Creator 的 TypeScript；类型检查依赖 Creator 生成的 `temp/tsconfig.cocos.json`。缺少时先打开正确的 Creator 工程，不能将缺失环境误记成业务测试失败。

## 8. 微信工具问题与存档注意事项

- 用户已授权过官方微信开发者工具 CLI。本机安装在 `Z:/微信开发者工具/微信web开发者工具`，复用前先检查实际版本和连接状态，不假定新会话授权仍然有效。
- HarmonyOS 支持文字是基础库通知。适配器创建已存在 `gamecaches` 目录的 mkdir 警告当时没有阻止加载；不能因此清空缓存和玩家存档。
- 一次全模式模拟器帧调度极慢；以轻量模式重新打开后曾恢复，具体工具内部原因尚未定位。后续 CLI/重载仍出现超时，不能宣称已根治，也不能用手动推进动画时钟冒充真实播放。
- `tools/wechat_runtime_smoke.mjs` 是只读状态/截图/动画观察工具。`tools/wechat_input_smoke.mjs` 必须显式 `--run-input` 才会开始输入；它会备份并临时修改本游戏单个存档键，尝试恢复，`--cold-restart` 还会重开工程窗口。
- 输入脚本和新的 `wechat_animation_sample.mjs` 尚未完成端到端验收。CLI 断连可能妨碍存档恢复；不能仅靠 finally 存在就承诺恢复成功。既有原始备份保存在微信验收 input_* 目录，必须保留。
- 两次历史输入尝试原始存档键都不存在；第一次原始键恢复已确认，第二次 CLI 失联导致最终精确恢复未确认。不要把未确认状态写成全部通过，也不要为交接擅自重跑测试。

## 9. Git 与清理状态

2026-10-12 已提交并推送到 GitHub `main`，当时用 `ls-remote` 确认远端与本地一致：

- `267827f`：v14–v17 布景、12 目标、手账、PNG 和生产记录、逻辑测试。
- `68663b3`：微信构建、资源过滤、包校验、本机服务、测试缓存清理与文档。

交接开始时仅有两个未跟踪文件，均未纳入这轮提交，需保留：

```text
E:/workspace/chriken/docs/AGENT_HANDOFF_2026-09-30.md
E:/workspace/chriken/experiments/living_city_v1/settings/v2/packages/cocos-service.json
```

本文最初创建时未纳入 `68663b3`；用户随后要求推送 v18，本文在该轮随源码一并提交。不能把此前推送成功表述成已包含此文档。不要批量 `git add -A` 将旧报告、自动配置或测试证据意外上传。

Git SSH 22 端口在当前网络被关闭，现有 SSH 密钥通过 **443 通道**可访问 GitHub。上轮使用以下单次参数成功推送，没有修改全局 SSH 配置：

```powershell
git -c core.sshCommand='ssh -o Hostname=ssh.github.com -p 443 -o BatchMode=yes -o ConnectTimeout=15' fetch origin main
```

后续用户要求推送时可将 `fetch origin main` 换成 `push origin main`；不要强推。GitHub CLI 当时没有登录，不需要为 SSH 推送重新配置账号。不要读取或展示私钥/令牌。

`build/`、`temp/`、`library/`、验收截图和缓存不纳入 Git。四个已经结束的测试浏览器 profile 曾释放约 372.21 MiB 本机磁盘；这不是微信包体减少量。`tools/cleanup_test_profiles.ps1` 只清理主线 temp 内确认为未运行且不含链接的 `edge-refined-*`；不要扩大到生产原稿、玩家数据或其他工程。

## 10. 新会话下一步

1. 阅读入口文件并确认工作目录、HEAD 和用户最新反馈，先接管现有状态。
2. 等用户提供试玩反馈或明确下一项工作。若要求继续优化，优先当前布景合理性、背景与目标质感融合、已有角色表现和点击体验，保持内容数量。
3. 若用户要求真机或发布，再处理 HTTPS 资源部署和微信域名配置；这是尚未完成的独立工作。
4. 对任何新变更保留来源和必要的验证，区分历史证据、本轮实测、用户视觉批准和真机状态。

本交接不授权自动扩关、增加目标、自动恢复微信全量验收、清存档、部署、创建 PR 或再次推送。
