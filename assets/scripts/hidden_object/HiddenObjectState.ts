import type { ClickArea, HiddenObjectConfig, Size } from '../config/CityTypes';

export interface HiddenObjectHit {
    id: string;
    tags: readonly string[];
}

/** Converts lower-left normalized city coordinates to a centered map node. */
export function hiddenObjectMapPosition(config: HiddenObjectConfig, mapSize: Size): { x: number; y: number } {
    return {
        x: config.x * mapSize.width - mapSize.width / 2,
        y: config.y * mapSize.height - mapSize.height / 2,
    };
}

/** Coordinates are already in the object's local space, after its scale and rotation. */
export function containsClickArea(area: ClickArea, x: number, y: number): boolean {
    const localX = x - (area.offset?.x ?? 0);
    const localY = y - (area.offset?.y ?? 0);
    if (area.shape === 'circle') {
        return localX * localX + localY * localY <= area.radius * area.radius;
    }
    return Math.abs(localX) <= area.width / 2 && Math.abs(localY) <= area.height / 2;
}

/** One object's transient discovery state. Task completion belongs to TaskManager. */
export class HiddenObjectState {
    public readonly config: HiddenObjectConfig;
    private visible: boolean;
    private found = false;

    public constructor(config: HiddenObjectConfig) {
        this.config = config;
        this.visible = !config.visibleCondition;
    }

    public get isVisible(): boolean { return this.visible; }
    public get isFound(): boolean { return this.found; }

    public setVisible(visible: boolean): void {
        this.visible = visible;
    }

    /** Restore a previously discovered prop without replaying a click or task event. */
    public restoreFound(): boolean {
        if (this.found) return false;
        this.visible = true;
        this.found = true;
        return true;
    }

    public hitTest(localX: number, localY: number): boolean {
        return this.visible && !this.found && this.config.targetable &&
            containsClickArea(this.config.clickArea, localX, localY);
    }

    /** Returns a report only for the first valid discovery. */
    public discover(localX: number, localY: number): HiddenObjectHit | null {
        if (!this.hitTest(localX, localY)) return null;
        this.found = true;
        return { id: this.config.id, tags: [...this.config.tags] };
    }
}
