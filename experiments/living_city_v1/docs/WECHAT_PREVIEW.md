# 微信本机预览（2026-10-10）

使用 Cocos Creator 3.8.8，构建当前主线 v17。微信开发者工具应导入本工程的 `build/wechatgame/`，本机实际路径为 `E:/workspace/chriken/experiments/living_city_v1/build/wechatgame`；该目录含 `game.json` 和 `project.config.json`。

## 构建与资源服务

在主线工程目录运行：

```powershell
& ./tools/build_wechat_preview.ps1
node ./tools/serve_wechat_resources.mjs
```

构建脚本准备当前资产白名单、平台 Bundle 配置及版本标识，调用 Creator，然后校验包内目录、catalog、bootstrap、资源路径、UUID 和每张 PNG 的 SHA。Creator 成功退出码在本机为 36。资源服务监听 `http://127.0.0.1:8790/`，只提供构建的 `/remote/` 文件，模拟器试玩期间须保持运行。

本轮实测程序包 3,163,221 B（3.02 MiB），远程资源 84,210,855 B（80.31 MiB）。第一关远程资源约 44.17 MiB，后两关约 19.07/17.08 MiB，进入城市后下载对应资源。`remote/` 不随程序包上传；675 张有效 PNG 与源文件逐张核对一致，画质没有降低。

三城的自定义 `wechat_city_remote` 配置仅在微信平台启用远程 `merge_all_json`；Web/native 保持本地 `merge_dep`。启用 MD5 版本缓存后，配置和图片地址随内容变化，避免旧远程文件继续被复用；JSON 合并使远程文件从 2,069 个减少到 681 个。

## 清理范围

只输出当前三关；第一关严格按 65 个场景槽、12 个目标、4 个机关、16 名居民及现有 UI 过滤未用文件。重复的旧美术 Bundle、三座历史测试城及退出任务的资源不进入新包。共排除 1,202 个历史/重复源文件，约 128.15 MiB；源文件本身保留。插件额外生成的空测试分包经过内容检查后从输出移除。

另清理了四个已结束、没有运行进程的 `temp/edge-refined-*` 浏览器 profile，释放约 372.21 MiB 本地测试缓存。此数字不计入微信包体减量。生成源图、提示词、验收证据、正式 PNG 和 UUID 均保留。

## 验收与运行提示

`node tools/verify_wechat_resources.mjs` 核对所有 681 个远程文件的 HTTP 状态/长度，三个版本配置及三张最大 PNG 的 GET/SHA；退出 Bundle 和错误裸路径应为 404。结果存入本机 `art/review/wechat_v17/http_report.json`。

已用授权的微信开发者工具官方 CLI 验证第一关完整显示，65 个图层、12 个目标、4 个机关、16 名居民和手账 PNG 均已加载；超过 12 秒采样中，全部居民实际切换了对应 PNG 动画帧。只读验收脚本为 `tools/wechat_runtime_smoke.mjs`，报告与截图保存在独立的 `art/review/wechat_v17/runtime_*` 目录。

日志中的 HarmonyOS 支持提示属于基础库通知。Cocos 适配器创建已存在的 `gamecaches` 目录会发出警告后继续加载；不能据此清除玩家存档。一次全模式模拟器出现帧调度极慢，关闭本工程窗口并以轻量模式重新打开后加载、动画恢复；尚未定位其具体工具内部原因，没有修改游戏引擎。

当前服务器是本机 HTTP，项目关闭了本机预览域名校验。手机预览和正式上传需要部署可访问的 HTTPS 资源地址、配置下载域名并恢复域名校验。本轮没有上传微信，也没有真机验收。

## 提交前检查（2026-10-12）

132 项逻辑测试、TypeScript 类型检查、生成资产来源/Alpha/UUID/SHA 校验、第一关布局检查、当前资产白名单检查，以及本轮 21 个 JavaScript 文件和两个 PowerShell 文件的语法检查通过。重新校验现有微信构建的 675 张 PNG，均与当前源文件一致；没有重新编译或运行模拟器。

微信模拟器完整三关的拾取、翻找、旅行和重载验收尚未完成。官方工具连接及重载曾阻塞，用户已接管后续试玩；Web 的三关通过记录不能替代微信验收。

`tools/wechat_input_smoke.mjs` 仅在显式传入 `--run-input` 后执行交互，会备份并临时修改本游戏的单个存档键，最后尝试恢复；工具连接失败时可能无法完成恢复，因此原始备份必须保留。`--cold-restart` 会关闭并重新打开本工程窗口。该输入脚本及新的密集动画采样辅助模块尚未完成端到端验收；日常试玩不需要运行它们。
