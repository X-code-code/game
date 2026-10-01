export interface ViewportState {
    scale: number;
    x: number;
    y: number;
}

/** Map size and pan offsets use Canvas design units; zoom limits are relative to cover-fit. */
export class CityViewport {
    private readonly mapWidth: number;
    private readonly mapHeight: number;
    private readonly minZoom: number;
    private readonly maxZoom: number;
    private viewportWidth: number;
    private viewportHeight: number;
    private fitScale: number;
    private state: ViewportState;
    private bottomInset = 0;

    public constructor(
        mapWidth: number,
        mapHeight: number,
        viewportWidth: number,
        viewportHeight: number,
        minZoom = 1,
        maxZoom = 3,
    ) {
        if (
            !Number.isFinite(mapWidth) || mapWidth <= 0 ||
            !Number.isFinite(mapHeight) || mapHeight <= 0 ||
            !Number.isFinite(minZoom) || minZoom < 1 ||
            !Number.isFinite(maxZoom) || maxZoom < minZoom
        ) {
            throw new Error('Invalid city viewport configuration');
        }

        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
        this.viewportWidth = 1;
        this.viewportHeight = 1;
        this.fitScale = 1;
        this.state = { scale: 1, x: 0, y: 0 };
        this.resize(viewportWidth, viewportHeight);
    }

    public get value(): Readonly<ViewportState> {
        return { ...this.state };
    }

    public resize(width: number, height: number): void {
        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
            return;
        }

        const previousScale = this.state.scale;
        const zoomRatio = this.fitScale > 0 ? previousScale / this.fitScale : this.minZoom;
        const worldX = previousScale > 0 ? this.state.x / previousScale : 0;
        const worldY = previousScale > 0 ? this.state.y / previousScale : 0;

        this.viewportWidth = width;
        this.viewportHeight = height;
        this.fitScale = Math.max(width / this.mapWidth, height / this.mapHeight);
        this.state.scale = this.clampScale(this.fitScale * Math.max(this.minZoom, zoomRatio));
        this.state.x = worldX * this.state.scale;
        this.state.y = worldY * this.state.scale;
        this.clampOffset();
    }

    public panBy(dx: number, dy: number): void {
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        this.state.x += dx;
        this.state.y += dy;
        this.clampOffset();
    }

    /** Permit the lower map edge to reach the top of a covering bottom tray. */
    public setBottomInset(inset: number): void {
        if (!Number.isFinite(inset) || inset < 0) return;
        this.bottomInset = Math.min(inset, this.viewportHeight);
        this.clampOffset();
    }

    /** Center a live map point without changing zoom or exposing the map's outer edges. */
    public focusAt(mapX: number, mapY: number): void {
        if (!Number.isFinite(mapX) || !Number.isFinite(mapY)) return;
        this.state.x = -mapX * this.state.scale;
        this.state.y = -mapY * this.state.scale;
        this.clampOffset();
    }

    public zoomAt(factor: number, pivotX: number, pivotY: number): void {
        this.zoomBetween(factor, pivotX, pivotY, pivotX, pivotY);
    }

    /** Keeps the map point under (fromX, fromY) under (toX, toY) after a pinch. */
    public zoomBetween(factor: number, fromX: number, fromY: number, toX: number, toY: number): void {
        if (
            !Number.isFinite(factor) || factor <= 0 ||
            !Number.isFinite(fromX) || !Number.isFinite(fromY) ||
            !Number.isFinite(toX) || !Number.isFinite(toY)
        ) return;

        const previousScale = this.state.scale;
        const nextScale = this.clampScale(previousScale * factor);
        const appliedRatio = nextScale / previousScale;
        this.state.x = toX - (fromX - this.state.x) * appliedRatio;
        this.state.y = toY - (fromY - this.state.y) * appliedRatio;
        this.state.scale = nextScale;
        this.clampOffset();
    }

    private clampScale(scale: number): number {
        return Math.min(this.fitScale * this.maxZoom, Math.max(this.fitScale * this.minZoom, scale));
    }

    private clampOffset(): void {
        const horizontalTravel = Math.max(0, (this.mapWidth * this.state.scale - this.viewportWidth) / 2);
        const verticalTravel = Math.max(0, (this.mapHeight * this.state.scale - this.viewportHeight) / 2);
        this.state.x = horizontalTravel === 0 ? 0 : Math.min(horizontalTravel, Math.max(-horizontalTravel, this.state.x));
        const bottomReserve = Math.min(this.bottomInset, this.viewportHeight);
        this.state.y = verticalTravel === 0 && bottomReserve === 0 ? 0 :
            Math.min(verticalTravel + bottomReserve, Math.max(-verticalTravel, this.state.y));
    }
}
