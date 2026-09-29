# 简化 2D 信使鸡试产记录

状态：`trial_unapproved_after_game_review`。这是用户选择的可程序绘制 2D 方向的第一只角色，供独立 `living_city_v1` 工程试运行。并非根项目正式素材。

## 设计与制作

- 资产 ID：`messenger_customer`；全部 29 个 PNG 的逐项 ID、绘制说明、源 SVG、SHA-256、Alpha 边界及状态见 `production_manifest.json`。
- 来源：原创手写 Python/Pillow 曲线与分层色块。`render_courier.py` 可重复导出，每帧的 SVG 位于 `svg_source/`，并无图像模型或背景切图。
- 风格：暖棕线、奶油羽毛、灰蓝短背心、赤陶挎包；平缓色块，近俯视方向视图。包和斜肩带延续角色同一侧结构。地影留给场景层。
- 动作：北、西北、东北各四个独立的步态帧；接触脚交替、抬升跨步、胸腹横移和起伏、头随承重轻移、翅膀反向摆动。到茶摊后有面向柜台、伸翼、杯子出现、持杯眨眼、收翼、向东北转身。静止待机有呼吸和眨眼。

## Generation Spec 与 Final Game Asset Spec

- **源图生成规格**：在 1024×1024 RGBA 内按 4 倍坐标绘制曲线。保留每帧 SVG 及参数脚本，供修改。这里的“生成”是确定性的程序绘制。
- **游戏最终规格**：一次 Lanczos 缩至 256×256 RGBA PNG，不裁切画布；统一脚点 `(128,215)`；按逐帧 Alpha 边界取名义可见高 `186 px`，放入 Cocos 后缩为世界高 120。全部帧共用相同坐标。游戏包内目录 `assets/bundles/city_living_city_street_block_01/cels/messenger_customer/`，清单 `manifest.json` 为 Cocos 装载接口。

## 机械验收

- 29/29 帧均是 256×256 RGBA，Alpha 含透明和不透明像素；实际可见内容上界 26–32 px，下界统一为 215 px；不带地影。
- 29 帧对应 29 个独立 SVG；游戏资源清单包括运行所需的八个 clip；每个动作帧长度符合 `docs/CEL_ANIMATION_MANIFEST.md` 的范围。导出脚本会逐帧验证这些条件并生成 SHA-256 记录。
- 缩放评审：`review/walk_and_event_56px.png`、`79px.png`、`127px.png`。79px 四方向总览：`review/contact_79px.png`；关键原尺寸姿势：`review/key_poses_source_scale.png`；三个方向的逐帧循环 GIF 也在 `review/`。

## 视觉判断与未完成验收

小尺寸截图中，鸡、背心和包可分辨，三种方向及两脚交替可辨。已在 Cocos 构建产物的 `444×960` 浏览器画幅录制 12 秒无操作回放：八组动作实际切换、23 个不同帧出现、脚点无节点偏移、茶摊事件完成、无控制台或网络失败；记录见 `art/review/simple_2d_trial_001/motion/`。常态镜头里的角色和杯子仍偏小，交接因果不够醒目，配角目前是程序 Graphics 动作而非同等级逐帧素材。角色仍是候选，需要玩家评价造型与动态；未标为获批。

运行导出：

```powershell
python art/production/simple_chicken_v1/render_courier.py
```
