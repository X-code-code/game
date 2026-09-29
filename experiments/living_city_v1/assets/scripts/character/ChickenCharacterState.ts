import type { ChickenConfig, ClickArea, Size } from '../config/CityTypes';

export interface ChickenHit {
    id: string;
    tags: readonly string[];
}

/** Converts lower-left normalized coordinates to the centered city map. */
export function chickenMapPosition(config: ChickenConfig, mapSize: Size): { x: number; y: number } {
    return {
        x: config.x * mapSize.width - mapSize.width / 2,
        y: config.y * mapSize.height - mapSize.height / 2,
    };
}

/** Transient visibility and tap reporting, independent of behavior and tasks. */
export class ChickenCharacterState {
    public readonly config: ChickenConfig;
    private visible: boolean;

    public constructor(config: ChickenConfig) {
        this.config = config;
        this.visible = !config.visibleCondition;
    }

    public get isVisible(): boolean { return this.visible; }

    public setVisible(visible: boolean): void { this.visible = visible; }

    public hitTest(localX: number, localY: number): boolean {
        if (!this.visible || !this.config.targetable) return false;
        const area: ClickArea = this.config.clickArea;
        const x = localX - (area.offset?.x ?? 0);
        const y = localY - (area.offset?.y ?? 0);
        if (area.shape === 'circle') return x * x + y * y <= area.radius * area.radius;
        return Math.abs(x) <= area.width / 2 && Math.abs(y) <= area.height / 2;
    }

    /** Each valid tap reports the chicken. Task matching and deduplication are external. */
    public click(localX: number, localY: number): ChickenHit | null {
        if (!this.hitTest(localX, localY)) return null;
        return { id: this.config.id, tags: [...this.config.tags] };
    }
}
