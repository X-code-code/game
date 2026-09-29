import type { TaskConfig } from '../config/CityTypes';
import type { HintTarget } from './HintManager';

/** Each city owns its runtime entities. Stage 17 can register interactive prerequisites here. */
export class HintTargetRegistry {
    private readonly targets = new Map<string, HintTarget>();

    public register(target: HintTarget): void {
        if (this.targets.has(target.id)) throw new Error(`Duplicate hint target: ${target.id}`);
        this.targets.set(target.id, target);
    }

    public resolve(task: TaskConfig): HintTarget[] {
        const matches = Array.from(this.targets.values()).filter(target => {
            if (task.type === 'hiddenObject') return target.kind === 'hiddenObject' && target.id === task.targetId;
            if (task.type === 'chickenId') return target.kind === 'chicken' && target.id === task.targetId;
            return target.kind === 'chicken' && target.tags.indexOf(task.targetTag) >= 0;
        });
        const result: HintTarget[] = [];
        for (const target of matches) {
            if (target.isAvailable()) result.push(target);
            else if (target.prerequisiteId) {
                const prerequisite = this.targets.get(target.prerequisiteId);
                if (prerequisite?.kind === 'interactiveObject' && prerequisite.isAvailable()) result.push(prerequisite);
            }
        }
        return result;
    }

    public clear(): void { this.targets.clear(); }
}
