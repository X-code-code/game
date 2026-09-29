import { EventMouse, EventTouch, Input, input } from 'cc';

export interface TargetClicked {
    type: 'hiddenObject' | 'chicken';
    id: string;
    tags: readonly string[];
}

/** Scene entities expose their own hit shape and report a tap without owning tasks. */
export interface TapTarget {
    hitTest(uiX: number, uiY: number): boolean;
    activate(uiX: number, uiY: number): TargetClicked | null;
}

interface Press {
    x: number;
    y: number;
    eligible: boolean;
    target: TapTarget | null;
}

const TAP_DISTANCE = 12;

/** One scene-level input router. A drag or pinch never activates a target. */
export class TargetInput {
    private readonly touches = new Map<number, Press>();
    private mousePress: Press | null = null;

    public constructor(
        private readonly targets: readonly TapTarget[],
        private readonly onTargetClicked: (hit: TargetClicked) => void,
        private readonly isBlocked?: (uiX: number, uiY: number) => boolean,
    ) {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    public dispose(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        this.cancelGestures();
    }

    public cancelGestures(): void {
        this.touches.clear();
        this.mousePress = null;
    }

    private onTouchStart(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id === null) return;
        const point = event.getUILocation();
        this.touches.set(id, { x: point.x, y: point.y, eligible: this.touches.size === 0,
            target: this.targetAt(point.x, point.y) });
        if (this.touches.size > 1) {
            this.touches.forEach(press => { press.eligible = false; });
        }
        this.mousePress = null;
    }

    private onTouchMove(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id === null) return;
        const press = this.touches.get(id);
        if (press) this.checkMovement(press, event.getUILocation());
    }

    private onTouchEnd(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id === null) return;
        const press = this.touches.get(id);
        this.touches.delete(id);
        if (!press || this.touches.size > 0) return;
        const point = event.getUILocation();
        if (this.checkMovement(press, point)) this.activateAt(press, point.x, point.y);
    }

    private onTouchCancel(event: EventTouch): void {
        if (event.simulate) return;
        const id = event.getID();
        if (id !== null) this.touches.delete(id);
    }

    private onMouseDown(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_LEFT || this.touches.size > 0) return;
        const point = event.getUILocation();
        this.mousePress = { x: point.x, y: point.y, eligible: true,
            target: this.targetAt(point.x, point.y) };
    }

    private onMouseMove(event: EventMouse): void {
        if (this.mousePress) this.checkMovement(this.mousePress, event.getUILocation());
    }

    private onMouseUp(event: EventMouse): void {
        const press = this.mousePress;
        this.mousePress = null;
        if (!press || event.getButton() !== EventMouse.BUTTON_LEFT || this.touches.size > 0) return;
        const point = event.getUILocation();
        if (this.checkMovement(press, point)) this.activateAt(press, point.x, point.y);
    }

    private checkMovement(press: Press, point: { x: number; y: number }): boolean {
        if (Math.hypot(point.x - press.x, point.y - press.y) > TAP_DISTANCE) press.eligible = false;
        return press.eligible;
    }

    private targetAt(uiX: number, uiY: number): TapTarget | null {
        if (this.isBlocked?.(uiX, uiY)) return null;
        for (let index = this.targets.length - 1; index >= 0; index--) {
            const target = this.targets[index];
            if (target.hitTest(uiX, uiY)) return target;
        }
        return null;
    }

    private activateAt(press: Press, uiX: number, uiY: number): void {
        const target = press.target;
        if (!target || this.targetAt(uiX, uiY) !== target) return;
        const hit = target.activate(uiX, uiY);
        if (hit) this.onTargetClicked(hit);
    }
}
