# 简化 2D 活街区：独立可玩小样（2026-09-29）

## 本轮实际制作

用户明确改选“更简化、可程序绘制的 2D 风格”。本轮只修改 `experiments/living_city_v1`；根工程的现有 Cocos `assets/`、微信构建包和进度存档均未替换。旧水彩候选保留历史记录，在独立小样中没有加载。

| 内容 | 可编辑源 | 运行资源 |
| --- | --- | --- |
| 近俯视茶摊街区 | `art/production/simple_city_scene_v1/render_scene.py`、`design/street_block_01.json` | 35 张蓝图对齐的地面、店面、货物、四处目标前景遮挡与顶层 PNG |
| 信使鸡 | `art/production/simple_chicken_v1/render_courier.py`、29 张逐帧 SVG | 29 张透明逐帧 PNG、8 组动作 manifest |
| 其他七只鸡 | `assets/scripts/character/AmbientChickenPainter.ts` | 程序绘制的店员、路人、栗子摊主、看灯鸡、茶客、买花者和巷口小鸡；按路线转侧面、朝北背面或朝南正面，带步态、工作、饮茶或招呼循环 |
| 环境小动作 | `assets/scripts/map/LivingCityGreybox.ts` | 茶炉与热食车蒸汽、水盆涟漪逐帧重绘；无单张场景整体平移 |
| 四件寻物 | `art/production/simple_hidden_objects_v1/render_targets.py` | 陶哨、顶针、横幅结、栗子夹独立透明 PNG；视觉尺寸与点击半径分开 |
| 界面 | `assets/scripts/map/MapBrowserDemo.ts`、`assets/scripts/ui/HintPanel.ts` | 可读的四项任务和 `0/4` 进度，独立的提示按钮 |

所有图层保留原始 ID、绘制任务、生成/最终规格及 SHA 记录，见 `art/asset_manifest.json` 引用的详细清单。七只配角与三处环境小动作由可编辑 TypeScript 直接绘制，逐 ID 任务和动作分别记录在 `art/production/simple_ambient_cast_v1/RECORD.md` 和 `art/production/simple_ambient_fx_v1/RECORD.md`。图像规格均由导出脚本确定，未使用整张 AI 画面或在游戏中放入旧水彩贴图。以上均为**试产资产，未获玩家美术批准**。

## 构建和运行验收

- Cocos Creator 3.8.8 Web Mobile 构建完成；日志 `temp/simple2d_build_ambient_fx_stdout.log` 含 `build Task (web-mobile) Finished`。本机 Creator CLI 返回 36，构建产物实际存在并通过浏览器加载。
- `tools/validate_street_block.mjs`：35 个美术槽、四块连通公共区、八只 NPC、四件语义寻物通过；`validate_exports.py`：35/35 PNG 尺寸、Alpha、Bundle 副本 SHA 通过；`validate_target_occlusion.py` 实测四件目标有 15.3%–19.8% 不透明像素被前景覆盖；TypeScript `tsc --noEmit` 通过。
- `tools/living_city_greybox_smoke.mjs` 在 **444×960 构建产物**中确认：35 层、四件道具和信使逐帧资源全部载入；信使到茶摊、交接、离开；四项逐一点击至 `4/4`；每件目标旁一次偏移点击、重复点击、从目标拖动、缩放不误加进度；提示按钮可点击且不改变计数；运行错误、警告、失败资源请求均为 0。截图在 `art/review/simple_2d_trial_001/runtime_ambient_fx_final/`。
- `tools/capture_simple_2d_motion.mjs` 的最后一次 12.19 秒无操作回放显示八组 clip 均被访问、23 个不同画帧实际出现、视觉节点与脚点无偏移、茶摊事件完成；五只鸡改变位置，三只定点工作或招呼；蒸汽与水纹在固定局部逐帧变化。见 `art/review/simple_2d_trial_001/motion/living_city_12s_444x960.webp` 及 `motion_capture.json`。
- 本轮只做了本机 Web Mobile 浏览器验收；**这套独立工程尚未在微信真机运行**。

## 视觉判断

相较之前的灰盒和整图贴图，本小样有独立地面/前景、真实逐帧信使、七只代码绘制且有朝向与各自活动的配角，以及与摊位同色、真实局部遮挡的寻物。香草架、热食车、货车、饮水点补上首屏功能区；下方任务栏已能看清。

它还没有达到目标游戏参考的繁忙程度：主街必须给路线留空间，但两侧互动区仍偏稀，店面结构重复；常态画幅里鸡与茶杯交接偏小；配角动作虽有三个朝向，表情与动作细节仍不如信使逐帧。自动点击验收只证明交互，**没有完成不告知坐标的真人寻物难度验收**。下一轮应先做更紧凑的街区布局、有因果的生活活动和实测寻物，再考虑增加目标数量。不能仅增加地面纹理或复制相同鸡的数量来充当密度。若用户认为角色造型本身仍不合适，应先修改同一份可编辑源并做手机尺寸对照，再量产角色。

## 复现与本机试玩

在本独立工程目录运行 `node tools/serve_web_mobile.mjs`，打开 `http://127.0.0.1:8788/`。服务直接读取最近一次 `build/web-mobile` 产物，重新构建后刷新即可。当前 Codex 会话已启动此本机预览服务。

当前资产状态保持 `trial_unapproved`；没有把小样覆盖到根工程或记为正式素材。
