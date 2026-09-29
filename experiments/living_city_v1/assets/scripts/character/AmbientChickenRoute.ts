/** Lightweight, deterministic street-life motion in map world coordinates. */
export type AmbientNpcActivity = 'idle' | 'browse' | 'look' | 'chat' | 'gesture';

export interface AmbientNpcStop {
    x: number;
    y: number;
    /** Seconds spent here before walking to the next stop. */
    waitSeconds: number;
    activity: AmbientNpcActivity;
    facing?: 'left' | 'right';
}

export interface AmbientNpcRouteSpec {
    id: string;
    stops: readonly AmbientNpcStop[];
    /** Map world units per second. */
    speed: number;
    /** Overrides the stable ID-derived starting offset when staging a scene. */
    startOffsetSeconds?: number;
}

export interface AmbientNpcPose {
    x: number;
    y: number;
    facing: 'left' | 'right';
    moving: boolean;
    activity: AmbientNpcActivity;
    /** Time spent in the current walk or activity segment. */
    segmentSeconds: number;
    /** 0..1 progress through the current walk or activity segment. */
    segmentProgress: number;
    /** Continuous, ID-offset animation clock for gait and small gestures. */
    animationSeconds: number;
}

const EPSILON = 1e-6;

function stableHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/**
 * A ping-pong route lets background chickens visit stalls without teleporting
 * from the last waypoint to the first. It does not create touch targets.
 */
export class AmbientChickenRoute {
    private readonly spec: AmbientNpcRouteSpec;
    private readonly stops: AmbientNpcStop[];
    private readonly animationOffset: number;
    private elapsed = 0;
    private currentIndex = 0;
    private nextIndex = 0;
    private direction = 1;
    private visitCount = 0;
    private moving = false;
    private segmentSeconds = 0;
    private segmentDuration = 0;
    private x: number;
    private y: number;
    private facing: 'left' | 'right';

    public constructor(spec: AmbientNpcRouteSpec) {
        if (!spec.id?.trim() || !Array.isArray(spec.stops) || spec.stops.length === 0
            || !Number.isFinite(spec.speed) || spec.speed <= 0) {
            throw new Error('Invalid ambient chicken route');
        }
        for (const stop of spec.stops) {
            if (!Number.isFinite(stop.x) || !Number.isFinite(stop.y)
                || !Number.isFinite(stop.waitSeconds) || stop.waitSeconds < 0
                || ['idle', 'browse', 'look', 'chat', 'gesture'].indexOf(stop.activity) < 0
                || (stop.facing !== undefined && stop.facing !== 'left' && stop.facing !== 'right')) {
                throw new Error(`Invalid ambient chicken stop for ${spec.id}`);
            }
        }
        if (spec.startOffsetSeconds !== undefined
            && (!Number.isFinite(spec.startOffsetSeconds) || spec.startOffsetSeconds < 0)) {
            throw new Error(`Invalid start offset for ${spec.id}`);
        }
        this.spec = spec;
        this.stops = spec.stops.map(stop => ({ ...stop }));
        const hash = stableHash(spec.id);
        this.animationOffset = (hash % 628) / 100;
        this.x = this.stops[0].x;
        this.y = this.stops[0].y;
        this.facing = this.stops[0].facing ?? 'right';
        this.segmentDuration = this.waitDuration(0);
        this.tick(spec.startOffsetSeconds ?? (hash % 1100) / 100);
    }

    public get pose(): AmbientNpcPose {
        return {
            x: this.x,
            y: this.y,
            facing: this.facing,
            moving: this.moving,
            activity: this.moving ? 'idle' : this.stops[this.currentIndex].activity,
            segmentSeconds: this.segmentSeconds,
            segmentProgress: Math.min(1, this.segmentSeconds / this.segmentDuration),
            animationSeconds: this.elapsed + this.animationOffset,
        };
    }

    public tick(deltaSeconds: number): AmbientNpcPose {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.pose;
        // Returning from a suspended browser tab should not fast-forward a whole crowd.
        let remaining = Math.min(deltaSeconds, 30);
        let transitions = 0;
        while (remaining > EPSILON && transitions < 128) {
            const step = Math.min(remaining, Math.max(0, this.segmentDuration - this.segmentSeconds));
            this.segmentSeconds += step;
            this.elapsed += step;
            remaining -= step;
            if (this.moving) this.interpolateWalk();
            if (this.segmentSeconds + EPSILON < this.segmentDuration) break;
            if (this.moving) this.arrive();
            else this.depart();
            transitions++;
        }
        return this.pose;
    }

    private depart(): void {
        if (this.stops.length === 1) {
            this.segmentSeconds = 0;
            this.visitCount++;
            this.segmentDuration = this.waitDuration(this.currentIndex);
            return;
        }
        let next = this.currentIndex + this.direction;
        if (next < 0 || next >= this.stops.length) {
            this.direction *= -1;
            next = this.currentIndex + this.direction;
        }
        this.nextIndex = next;
        const target = this.stops[next];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        this.segmentDuration = Math.max(EPSILON, Math.hypot(dx, dy) / this.spec.speed);
        this.segmentSeconds = 0;
        this.moving = true;
        if (Math.abs(dx) > EPSILON) this.facing = dx < 0 ? 'left' : 'right';
    }

    private interpolateWalk(): void {
        const from = this.stops[this.currentIndex];
        const to = this.stops[this.nextIndex];
        const progress = Math.min(1, this.segmentSeconds / this.segmentDuration);
        this.x = from.x + (to.x - from.x) * progress;
        this.y = from.y + (to.y - from.y) * progress;
    }

    private arrive(): void {
        this.currentIndex = this.nextIndex;
        this.x = this.stops[this.currentIndex].x;
        this.y = this.stops[this.currentIndex].y;
        this.moving = false;
        this.visitCount++;
        this.segmentSeconds = 0;
        this.segmentDuration = this.waitDuration(this.currentIndex);
        this.facing = this.stops[this.currentIndex].facing ?? this.facing;
    }

    private waitDuration(index: number): number {
        const jitter = (stableHash(`${this.spec.id}:${index}:${this.visitCount}`) % 1000) / 1000;
        return Math.max(0.2, this.stops[index].waitSeconds * (0.86 + jitter * 0.28));
    }
}
