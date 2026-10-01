export type AssetId = string;
export type EntityId = string;
export type CityId = string;

export interface Vec2 {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface XRange {
    minX: number;
    maxX: number;
}

export interface CityViewConfig {
    minZoom: number;
    maxZoom: number;
    initialZoom?: number;
}

export type ClickArea =
    | { shape: 'rect'; width: number; height: number; offset?: Vec2 }
    | { shape: 'circle'; radius: number; offset?: Vec2 };

export interface VisibleCondition {
    objectId: EntityId;
    state: string;
}

export interface HiddenObjectConfig {
    id: EntityId;
    asset: AssetId;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    clickArea: ClickArea;
    tags: string[];
    targetable: boolean;
    /** Authored appearance and clue; independent of the touch area. */
    visualSize?: Size;
    displayName?: string;
    clue?: string;
    /** Optional map-local world Y used for depth ordering; defaults to the target's Y. */
    depthY?: number;
    visibleCondition?: VisibleCondition;
}

export type ChickenBehaviorType = 'idle' | 'walk' | 'peck' | 'sleep';

export interface IdleBehaviorConfig {
    bobHeight?: number;
    blinkInterval?: number;
}

export interface WalkBehaviorConfig {
    bobHeight?: number;
    pauseSeconds?: number;
}

export interface PeckBehaviorConfig {
    pecksPerCycle?: 2 | 3;
    pauseSeconds?: number;
}

export interface SleepBehaviorConfig {
    breathScale?: number;
    showZzz?: boolean;
}

export type ChickenBehaviorConfig =
    | IdleBehaviorConfig
    | WalkBehaviorConfig
    | PeckBehaviorConfig
    | SleepBehaviorConfig;

export interface ChickenBaseConfig {
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
    /** Optional map-local foot Y used for depth ordering; defaults to the target's Y. */
    depthY?: number;
    visibleCondition?: VisibleCondition;
    clickArea: ClickArea;
    /** Size of the authored sprite canvas before this chicken's scale is applied. */
    visualSize?: Size;
    /** Ordered SpriteFrame asset IDs, including the resting frame, for this behavior. */
    animation?: {
        frames: AssetId[];
        frameDurationSeconds: number;
    };
}

export type ChickenBehaviorSpec =
    | { behaviorType: 'idle'; behaviorConfig: IdleBehaviorConfig; speed?: never; movementRange?: never }
    | { behaviorType: 'walk'; behaviorConfig: WalkBehaviorConfig; speed: number; movementRange: XRange }
    | { behaviorType: 'peck'; behaviorConfig: PeckBehaviorConfig; speed?: never; movementRange?: never }
    | { behaviorType: 'sleep'; behaviorConfig: SleepBehaviorConfig; speed?: never; movementRange?: never };

export type ChickenConfig = ChickenBaseConfig & ChickenBehaviorSpec;

export interface TaskBaseConfig {
    id: string;
    label: string;
    required: boolean;
}

export type TaskConfig = TaskBaseConfig & (
    | { type: 'hiddenObject'; targetId: EntityId }
    | { type: 'chickenId'; targetId: EntityId }
    | { type: 'chickenTag'; targetTag: string }
);

export type InteractiveAction = {
    type: 'setState';
    objectId: EntityId;
    state: string;
};

export interface InteractiveObjectConfig {
    id: EntityId;
    asset: AssetId;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    clickArea: ClickArea;
    initialState: string;
    openAsset?: AssetId;
    visualSize?: Size;
    depthY?: number;
    label?: string;
    conditions?: VisibleCondition[];
    actions: InteractiveAction[];
    tags: string[];
    targetable: boolean;
}

/** A transparent scenery cutout, positioned in map-local world units. */
export interface ForegroundSpriteConfig {
    id: EntityId;
    asset: AssetId;
    /** Sprite centre, relative to the centre of the map. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Map-local ground line used to sort against an NPC's feet. */
    footY: number;
    rotation?: number;
}

export interface CityOptionalContent {
    description?: string;
    collectibleIds?: EntityId[];
}

export interface CityConfig {
    schemaVersion: 1;
    cityId: CityId;
    cityName: string;
    background: AssetId;
    /** PNG scene placement blueprint within this city's bundle. */
    sceneBlueprint?: AssetId;
    chapterIndex?: number;
    chapterCount?: number;
    mapSize: Size;
    view: CityViewConfig;
    hiddenObjects: HiddenObjectConfig[];
    chickens: ChickenConfig[];
    interactiveObjects: InteractiveObjectConfig[];
    foregroundSprites?: ForegroundSpriteConfig[];
    tasks: TaskConfig[];
    nextCityId: CityId | null;
    travelType?: 'train' | 'bus' | 'plane' | 'boat' | 'other';
    souvenir?: AssetId;
    optionalContent?: CityOptionalContent;
}

export interface CityCatalogEntry {
    cityId: CityId;
    bundleName: string;
}

export interface CityCatalog {
    schemaVersion: 1;
    initialCityId: CityId | null;
    cities: CityCatalogEntry[];
}
