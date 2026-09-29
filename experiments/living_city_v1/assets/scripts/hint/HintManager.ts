import type { TaskState } from '../task/TaskManager';
import type { TaskConfig } from '../config/CityTypes';

export interface HintPosition { x: number; y: number }
export interface HintTarget {
    id: string;
    kind: 'hiddenObject' | 'chicken' | 'interactiveObject';
    tags: readonly string[];
    radius: number;
    prerequisiteId?: string;
    isAvailable(): boolean;
    /** Read the live position in map-local units, never the spawn position. */
    getPosition(): HintPosition | null;
}
export interface ActiveHint {
    taskId: string;
    label: string;
    targetId: string;
    kind: HintTarget['kind'];
    position: HintPosition;
    radius: number;
    remaining: number;
}
export type HintResult = { status: 'shown'; hint: ActiveHint } |
    { status: 'complete' | 'unavailable' | 'unsupported' | 'cancelled' | 'busy' | 'disposed' };

/** Future platform integration supplies this gate; the hint system never calls wx APIs. */
export interface RewardedHintGate { requestReward(): Promise<boolean> }

/** Task selection and live tracking, independent of Cocos, UI and advertising SDKs. */
export class HintManager {
    private readonly readTasks: () => readonly TaskState[];
    private readonly resolveTargets: (task: TaskConfig) => readonly HintTarget[];
    private readonly rewardGate?: RewardedHintGate;
    private target: HintTarget | null = null;
    private activeHint: ActiveHint | null = null;
    private disposed = false;
    private rewardPending = false;

    public constructor(readTasks: () => readonly TaskState[],
        resolveTargets: (task: TaskConfig) => readonly HintTarget[], rewardGate?: RewardedHintGate) {
        this.readTasks = readTasks;
        this.resolveTargets = resolveTargets;
        this.rewardGate = rewardGate;
    }

    public get active(): ActiveHint | null {
        return this.activeHint ? { ...this.activeHint, position: { ...this.activeHint.position } } : null;
    }

    public requestHint(): HintResult {
        this.clear();
        if (this.disposed) return { status: 'disposed' };
        const tasks = this.readTasks().filter(task => !task.completed);
        if (!tasks.length) return { status: 'complete' };
        const ordered = [...tasks.filter(task => task.config.required), ...tasks.filter(task => !task.config.required)];
        for (const task of ordered) {
            for (const target of this.resolveTargets(task.config)) {
                const position = this.positionOf(target);
                if (!position) continue;
                this.target = target;
                this.activeHint = { taskId: task.config.id, label: task.config.label, targetId: target.id,
                    kind: target.kind, radius: target.radius, position, remaining: 4 };
                return { status: 'shown', hint: this.active! };
            }
        }
        return { status: 'unavailable' };
    }

    public update(deltaTime: number): void {
        if (!this.activeHint || !this.target || this.disposed) return;
        const task = this.readTasks().find(task => task.config.id === this.activeHint!.taskId);
        const position = this.positionOf(this.target);
        const dt = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
        if (!task || task.completed || !position || this.activeHint.remaining <= dt) {
            this.clear();
            return;
        }
        this.activeHint.position = position;
        this.activeHint.remaining -= dt;
    }

    public async requestRewardedHint(): Promise<HintResult> {
        if (this.disposed) return { status: 'disposed' };
        if (!this.rewardGate) return { status: 'unsupported' };
        if (this.rewardPending) return { status: 'busy' };
        this.rewardPending = true;
        try {
            const earned = await this.rewardGate.requestReward();
            if (this.disposed) return { status: 'disposed' };
            return earned ? this.requestHint() : { status: 'cancelled' };
        } catch {
            return { status: this.disposed ? 'disposed' : 'unavailable' };
        } finally {
            this.rewardPending = false;
        }
    }

    public clear(): void { this.target = null; this.activeHint = null; }
    public dispose(): void { this.disposed = true; this.clear(); }

    private positionOf(target: HintTarget): HintPosition | null {
        if (!target.isAvailable()) return null;
        const p = target.getPosition();
        return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
    }
}
