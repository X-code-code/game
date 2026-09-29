import { EventMouse, EventTouch, Input, input, Node, UITransform, Vec3 } from 'cc';
import { CityViewport } from './CityViewport';

interface PointerPosition { x: number; y: number }

/** Owns map navigation only. The owning scene must call dispose() before leaving. */
export class CityViewController {
    private readonly viewportTransform: UITransform;
    private readonly mapTransform: UITransform;
    private readonly touches = new Map<number, PointerPosition>();
    private readonly viewport: CityViewport;
    private mouseDragging = false;
    private lastMouse: PointerPosition | null = null;

    public constructor(private readonly viewNode: Node, private readonly mapNode: Node, minZoom = 1, maxZoom = 3,
        initialZoom = minZoom, private readonly isBlocked?: (uiX: number, uiY: number) => boolean) {
        const viewTransform = viewNode.getComponent(UITransform);
        const mapTransform = mapNode.getComponent(UITransform);
        if (!viewTransform || !mapTransform) {
            throw new Error('CityViewController requires UITransform on view and map nodes');
        }
        this.viewportTransform = viewTransform;
        this.mapTransform = mapTransform;
        this.viewport = new CityViewport(
            mapTransform.width, mapTransform.height,
            viewTransform.width, viewTransform.height,
            minZoom, maxZoom,
        );
        this.viewport.zoomAt(initialZoom / minZoom, 0, 0);
        this.applyState();

        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    }

    public resizeIfNeeded(): void {
        const size = this.viewportTransform.contentSize;
        this.viewport.resize(size.width, size.height);
        this.applyState();
    }

    public focusAt(mapX: number, mapY: number): void {
        this.cancelGestures();
        this.viewport.focusAt(mapX, mapY);
        this.applyState();
    }

    public dispose(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
        this.cancelGestures();
    }

    public cancelGestures(): void {
        this.touches.clear();
        this.mouseDragging = false;
        this.lastMouse = null;
    }

    private localPosition(uiX: number, uiY: number): PointerPosition {
        const local = this.viewportTransform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
        return { x: local.x, y: local.y };
    }

    private touchPosition(event: EventTouch): PointerPosition {
        const location = event.getUILocation();
        return this.localPosition(location.x, location.y);
    }

    private mousePosition(event: EventMouse): PointerPosition {
        const location = event.getUILocation();
        return this.localPosition(location.x, location.y);
    }

    private onTouchStart(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id === null) return;
        const point = event.getUILocation();
        if (this.isBlocked?.(point.x, point.y)) return;
        this.mouseDragging = false;
        this.lastMouse = null;
        this.touches.set(id, this.touchPosition(event));
    }

    private onTouchMove(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id === null || !this.touches.has(id)) return;

        const before = this.gesturePoints();
        const previous = this.touches.get(id)!;
        const next = this.touchPosition(event);
        this.touches.set(id, next);
        const after = this.gesturePoints();

        if (before.length >= 2 && after.length >= 2) {
            const oldMid = this.midpoint(before[0], before[1]);
            const newMid = this.midpoint(after[0], after[1]);
            const oldDistance = this.distance(before[0], before[1]);
            const newDistance = this.distance(after[0], after[1]);
            const factor = oldDistance > 0.001 ? newDistance / oldDistance : 1;
            this.viewport.zoomBetween(factor, oldMid.x, oldMid.y, newMid.x, newMid.y);
        } else if (before.length === 1) {
            this.viewport.panBy(next.x - previous.x, next.y - previous.y);
        }
        this.applyState();
    }

    private onTouchEnd(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id !== null) this.touches.delete(id);
    }

    private onMouseDown(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_LEFT || this.touches.size > 0) return;
        const point = event.getUILocation();
        if (this.isBlocked?.(point.x, point.y)) return;
        this.mouseDragging = true;
        this.lastMouse = this.mousePosition(event);
    }

    private onMouseMove(event: EventMouse): void {
        if (!this.mouseDragging || !this.lastMouse || this.touches.size > 0) return;
        const next = this.mousePosition(event);
        this.viewport.panBy(next.x - this.lastMouse.x, next.y - this.lastMouse.y);
        this.lastMouse = next;
        this.applyState();
    }

    private onMouseUp(_event: EventMouse): void {
        this.mouseDragging = false;
        this.lastMouse = null;
    }

    private onMouseWheel(event: EventMouse): void {
        if (this.touches.size > 0) return;
        const point = event.getUILocation();
        if (this.isBlocked?.(point.x, point.y)) return;
        const pivot = this.mousePosition(event);
        const factor = Math.exp(event.getScrollY() * 0.0015);
        this.viewport.zoomAt(factor, pivot.x, pivot.y);
        this.applyState();
    }

    private gesturePoints(): PointerPosition[] {
        return Array.from(this.touches.values()).slice(0, 2);
    }

    private midpoint(a: PointerPosition, b: PointerPosition): PointerPosition {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    private distance(a: PointerPosition, b: PointerPosition): number {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    private applyState(): void {
        const state = this.viewport.value;
        this.mapNode.setScale(state.scale, state.scale, 1);
        this.mapNode.setPosition(state.x, state.y, 0);
    }
}
