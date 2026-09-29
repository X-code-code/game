# CityConfig 数据格式

首个版本使用 `schemaVersion: 1`。阶段 7 已将这份契约用于运行时 JSON 加载与校验；城市编辑器将来直接导出同一份 JSON。增加城市时，更新数据目录与城市 Bundle，不修改核心逻辑。

## 坐标与资源约定

- `x`、`y` 和 `movementRange` 是背景矩形内的归一化坐标，范围 `[0, 1]`。原点为背景左下角，`y` 向上。载入时按 `mapSize` 转成 Cocos 世界坐标。
- `mapSize` 是城市设计尺寸，单位为世界单位；它应与背景在游戏中的显示尺寸一致。`speed` 是世界单位/秒，不受设备屏幕尺寸影响。
- `asset`、`skin`、`background`、`souvenir` 等值是资源 ID，由城市目录解析为所在 Asset Bundle 的资源路径。配置不保存编辑器 UUID 或绝对路径。
- `clickArea` 是相对节点锚点的局部命中区域，尺寸单位为世界单位；旋转和缩放随节点生效。
- 同一城市内，所有实体 `id` 唯一；任务 `id` 唯一。引用必须能在城市配置中找到。`nextCityId` 必须存在于城市目录，末站可为 `null`。
- 配置加载时验证版本、ID、资源引用、坐标、范围、任务目标及互动状态引用；拒绝无效配置并给出城市和字段路径。

## TypeScript 契约草案

```ts
type AssetId = string;
type EntityId = string;
type CityId = string;

interface Vec2 { x: number; y: number }
interface Size { width: number; height: number }
interface XRange { minX: number; maxX: number }
interface CityViewConfig { minZoom: number; maxZoom: number; initialZoom?: number }

type ClickArea =
  | { shape: 'rect'; width: number; height: number; offset?: Vec2 }
  | { shape: 'circle'; radius: number; offset?: Vec2 };

// 只允许引用已声明互动对象的状态，不执行脚本或任意表达式。
interface VisibleCondition {
  objectId: EntityId;
  state: string;
}

interface HiddenObjectConfig {
  id: EntityId;
  asset: AssetId;
  x: number;
  y: number;
  scale: number;
  rotation: number; // 角度
  clickArea: ClickArea;
  tags: string[];
  targetable: boolean;
  visibleCondition?: VisibleCondition;
}

type ChickenBehaviorType = 'idle' | 'walk' | 'peck' | 'sleep';
interface IdleBehaviorConfig { bobHeight?: number; blinkInterval?: number }
interface WalkBehaviorConfig { bobHeight?: number; pauseSeconds?: number }
interface PeckBehaviorConfig { pecksPerCycle?: 2 | 3; pauseSeconds?: number }
interface SleepBehaviorConfig { breathScale?: number; showZzz?: boolean }
type ChickenBehaviorConfig =
  | IdleBehaviorConfig | WalkBehaviorConfig
  | PeckBehaviorConfig | SleepBehaviorConfig;

interface ChickenBaseConfig {
  id: EntityId;
  skin: AssetId;
  x: number;
  y: number;
  scale: number;
  facing: 'left' | 'right';
  carryItem?: AssetId;
  accessories: AssetId[];
  tags: string[];
  targetable: boolean;
  visibleCondition?: VisibleCondition;
  clickArea: ClickArea;
}

// 联合类型保证 walk 必须有速度与移动范围，行为参数与行为类型匹配。
type ChickenConfig = ChickenBaseConfig & (
  | { behaviorType: 'idle'; behaviorConfig: IdleBehaviorConfig;
      speed?: never; movementRange?: never }
  | { behaviorType: 'walk'; behaviorConfig: WalkBehaviorConfig;
      speed: number; movementRange: XRange }
  | { behaviorType: 'peck'; behaviorConfig: PeckBehaviorConfig;
      speed?: never; movementRange?: never }
  | { behaviorType: 'sleep'; behaviorConfig: SleepBehaviorConfig;
      speed?: never; movementRange?: never }
);

interface TaskBaseConfig {
  id: string;
  label: string;
  required: boolean; // false 表示可选隐藏目标
}
type TaskConfig = TaskBaseConfig & (
  | { type: 'hiddenObject'; targetId: EntityId }
  | { type: 'chickenId'; targetId: EntityId }
  | { type: 'chickenTag'; targetTag: string }
);

type InteractiveAction =
  | { type: 'setState'; objectId: EntityId; state: string };

interface InteractiveObjectConfig {
  id: EntityId;
  asset: AssetId;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  clickArea: ClickArea;
  initialState: string;
  conditions?: VisibleCondition[];
  actions: InteractiveAction[];
  tags: string[];
  targetable: boolean;
}

interface CityOptionalContent {
  description?: string;
  collectibleIds?: EntityId[];
}

interface CityConfig {
  schemaVersion: 1;
  cityId: CityId;
  cityName: string;
  background: AssetId;
  mapSize: Size;
  view: CityViewConfig; // 相对于适配视口的初始 fit 比例
  hiddenObjects: HiddenObjectConfig[];
  chickens: ChickenConfig[];
  interactiveObjects: InteractiveObjectConfig[];
  tasks: TaskConfig[];
  nextCityId: CityId | null;
  travelType?: 'train' | 'bus' | 'plane' | 'boat' | 'other';
  souvenir?: AssetId;
  optionalContent?: CityOptionalContent;
}
```

## 规则

`view.minZoom`/`maxZoom` 相对于完整地图适配视口的比例，需满足 `1 <= minZoom <= maxZoom`，以保持地图覆盖视口。可选的 `initialZoom` 需位于两者之间；省略时从 `minZoom` 开始。

阶段 5 已实现 `ChickenConfig.behaviorType` 的四种基础行为：`idle` 轻微浮动与眨眼，`walk` 在归一化 `movementRange` 内以世界单位/秒的 `speed` 横向行走并在边界翻向，`peck` 每轮下探 2 或 3 次，`sleep` 闭眼呼吸并可显示 `Zzz`。`pauseSeconds` 对 Walk 表示每次到边界的停顿，对 Peck 表示一轮结束后的停顿。阶段 7 已从城市 JSON 加载这些行为字段并校验范围。

点击实体只产生 `targetClicked` 报告。TaskManager 按 `TaskConfig` 匹配任务并做幂等完成；同一任务只计数一次，同一次点击可以完成多个匹配任务。`hiddenObject` 与 `chickenId` 按实体类型和 ID 匹配，`chickenTag` 只匹配所点击鸡的配置标签。主要目标（`required: true`）与可选目标分别统计；主要目标全部完成时 `allRequiredComplete` 为真。阶段 8 已接入“城市探索完成”和下一站流程，选择继续探索后可选目标仍可寻找；可选目标不会阻挡前往下一城。互动对象的 `setState` 可驱动 `visibleCondition`，当前只保留契约，互动执行留到阶段 17。

城市目录在 `assets/resources/configs/city_catalog.json` 中独立维护 `cityId -> bundleName` 和起始城市 ID；每座城市的 `city.json` 位于自己的 Asset Bundle 中。运行时先读目录，再按 `bundleName` 加载对应 Bundle 的 `city` JSON，检查其 `cityId` 与目录一致；不得以文件名推断城市 ID。`nextCityId` 指向下一城，`null` 表示末站，此时完成界面只提供继续探索。当前测试行程为 `demo_city`（`city_demo`，5 项主要任务）→ `harbor_test`（`city_harbor_test`，1 项主要任务及 1 项可选任务）→ `null`。第二座是阶段 8 的流程测试城，正式内容仍需后续制作。未来加入新行为或任务类型时，扩展联合类型及对应处理器，并提升 `schemaVersion`（如发生不兼容变更）。

目前示例城市的 `demo_*` 资源 ID 对应代码绘制的占位图形。运行时校验器检查资源 ID 非空；正式素材导入和 Bundle 资源路径解析仍需在美术接入时完成，不能把占位 ID 视为已经找到图片资源。
