import type { ChickenBehaviorSpec, ChickenBehaviorType } from '../config/CityTypes';

export interface ChickenPose {
    behaviorType: ChickenBehaviorType;
    x: number;
    facing: 'left' | 'right';
    visualY: number;
    visualScaleY: number;
    headY: number;
    headAngle: number;
    eyesClosed: boolean;
    showZzz: boolean;
    moving: boolean;
    peckIndex: number | null;
}

const TAU = Math.PI * 2;
const PECK_SECONDS = 0.32;

/** Small deterministic FSM for one chicken. Coordinates are map world units. */
export class ChickenBehaviorController {
    private spec: ChickenBehaviorSpec;
    private elapsed = 0;
    private x: number;
    private facing: 'left' | 'right';
    private readonly mapWidth: number;
    private walkMin = 0;
    private walkMax = 0;
    private walkSpeed = 0;
    private walkPause = 0;
    private walkTravel = 0;
    private walkPhase = 0;
    private walkMoving = false;

    public constructor(spec: ChickenBehaviorSpec, mapWidth: number, initialX: number, initialFacing: 'left' | 'right') {
        this.spec = spec;
        this.mapWidth = mapWidth;
        this.x = initialX;
        this.facing = initialFacing;
        this.setBehavior(spec);
    }

    public get behaviorType(): ChickenBehaviorType { return this.spec.behaviorType; }
    public get currentX(): number { return this.x; }

    /** Switches behavior while keeping the current map position and facing. */
    public setBehavior(spec: ChickenBehaviorSpec): ChickenPose {
        this.spec = spec;
        this.elapsed = 0;
        this.walkPhase = 0;
        this.walkMoving = false;
        if (spec.behaviorType === 'walk') {
            this.walkMin = spec.movementRange.minX * this.mapWidth - this.mapWidth / 2;
            this.walkMax = spec.movementRange.maxX * this.mapWidth - this.mapWidth / 2;
            if (this.walkMax < this.walkMin) {
                const min = this.walkMax;
                this.walkMax = this.walkMin;
                this.walkMin = min;
            }
            this.walkSpeed = Math.max(0, spec.speed);
            this.walkPause = Math.max(0, spec.behaviorConfig.pauseSeconds ?? 0);
            this.x = Math.max(this.walkMin, Math.min(this.walkMax, this.x));
            this.walkTravel = this.walkSpeed > 0 ? (this.walkMax - this.walkMin) / this.walkSpeed : 0;
            if (this.walkTravel > 0) {
                this.walkPhase = this.facing === 'right'
                    ? (this.x - this.walkMin) / this.walkSpeed
                    : this.walkTravel + this.walkPause + (this.walkMax - this.x) / this.walkSpeed;
                this.syncWalk();
            }
        }
        return this.pose();
    }

    public tick(deltaSeconds: number): ChickenPose {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.pose();
        this.elapsed += deltaSeconds;
        if (this.spec.behaviorType === 'walk' && this.walkTravel > 0) {
            const cycle = 2 * (this.walkTravel + this.walkPause);
            this.walkPhase = (this.walkPhase + deltaSeconds) % cycle;
            this.syncWalk();
        }
        return this.pose();
    }

    public pose(): ChickenPose {
        const base: ChickenPose = {
            behaviorType: this.spec.behaviorType,
            x: this.x,
            facing: this.facing,
            visualY: 0,
            visualScaleY: 1,
            headY: 0,
            headAngle: 0,
            eyesClosed: false,
            showZzz: false,
            moving: false,
            peckIndex: null,
        };
        switch (this.spec.behaviorType) {
        case 'idle': {
            const bob = Math.max(0, this.spec.behaviorConfig.bobHeight ?? 2.5);
            const blinkInterval = Math.max(0.5, this.spec.behaviorConfig.blinkInterval ?? 4);
            base.visualY = Math.sin(this.elapsed * TAU * 0.8) * bob;
            base.headAngle = Math.sin(this.elapsed * TAU * 0.35) * 2;
            base.eyesClosed = this.elapsed > 0 && (this.elapsed + 0.25) % blinkInterval < 0.12;
            break;
        }
        case 'walk': {
            base.moving = this.walkMoving;
            if (this.walkMoving) {
                const bob = Math.max(0, this.spec.behaviorConfig.bobHeight ?? 3.5);
                base.visualY = Math.abs(Math.sin(this.elapsed * TAU * 2.2)) * bob;
            }
            break;
        }
        case 'peck': {
            const count = this.spec.behaviorConfig.pecksPerCycle ?? 2;
            const pause = Math.max(0, this.spec.behaviorConfig.pauseSeconds ?? 1.1);
            const phase = this.elapsed % (count * PECK_SECONDS + pause);
            if (phase < count * PECK_SECONDS) {
                base.peckIndex = Math.floor(phase / PECK_SECONDS);
                const progress = (phase % PECK_SECONDS) / PECK_SECONDS;
                const dip = Math.sin(progress * Math.PI);
                base.headY = -24 * dip;
                base.headAngle = -13 * dip;
                base.visualY = -2 * dip;
            }
            break;
        }
        case 'sleep': {
            const breath = Math.max(0, Math.min(0.15, this.spec.behaviorConfig.breathScale ?? 0.035));
            base.visualScaleY = 1 + Math.sin(this.elapsed * TAU * 0.55) * breath;
            base.eyesClosed = true;
            base.showZzz = this.spec.behaviorConfig.showZzz ?? false;
            break;
        }
        }
        return base;
    }

    private syncWalk(): void {
        const travel = this.walkTravel;
        const pause = this.walkPause;
        const phase = this.walkPhase;
        if (phase < travel) {
            this.x = this.walkMin + phase * this.walkSpeed;
            this.facing = 'right';
            this.walkMoving = true;
        } else if (phase < travel + pause) {
            this.x = this.walkMax;
            this.facing = 'left';
            this.walkMoving = false;
        } else if (phase < 2 * travel + pause) {
            this.x = this.walkMax - (phase - travel - pause) * this.walkSpeed;
            this.facing = 'left';
            this.walkMoving = true;
        } else {
            this.x = this.walkMin;
            this.facing = 'right';
            this.walkMoving = false;
        }
    }
}
