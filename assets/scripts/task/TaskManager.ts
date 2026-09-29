import type { TaskConfig } from '../config/CityTypes';
import type { TargetClicked } from '../gameplay/TargetInput';

export interface TaskState {
    config: TaskConfig;
    completed: boolean;
}

export interface TaskProgress {
    requiredCompleted: number;
    requiredTotal: number;
    optionalCompleted: number;
    optionalTotal: number;
    allRequiredComplete: boolean;
}

export interface TaskUpdate {
    completedTaskIds: string[];
    progress: TaskProgress;
}

/** Matches target reports to city tasks; entities never decide which tasks they satisfy. */
export class TaskManager {
    private readonly tasks: readonly TaskConfig[];
    private readonly completedTaskIds = new Set<string>();

    public constructor(tasks: readonly TaskConfig[]) {
        const ids = new Set<string>();
        for (const task of tasks) {
            if (ids.has(task.id)) throw new Error(`Duplicate task ID: ${task.id}`);
            ids.add(task.id);
        }
        this.tasks = tasks.map(task => ({ ...task }));
    }

    /** A single target can satisfy multiple tasks; completed tasks are never counted twice. */
    public handleTargetClicked(hit: TargetClicked): TaskUpdate {
        const newlyCompleted: string[] = [];
        for (const task of this.tasks) {
            if (this.completedTaskIds.has(task.id) || !this.matches(task, hit)) continue;
            this.completedTaskIds.add(task.id);
            newlyCompleted.push(task.id);
        }
        return { completedTaskIds: newlyCompleted, progress: this.getProgress() };
    }

    public isCompleted(taskId: string): boolean {
        return this.completedTaskIds.has(taskId);
    }

    /** Stable, config-ordered IDs for a per-city save snapshot. */
    public getCompletedTaskIds(): string[] {
        return this.tasks.filter(task => this.completedTaskIds.has(task.id)).map(task => task.id);
    }

    /** Hydrate only tasks that still exist in this city; repeated or stale IDs have no effect. */
    public restoreCompletedTaskIds(ids: readonly string[]): void {
        this.completedTaskIds.clear();
        if (!Array.isArray(ids)) return;
        const validIds = new Set(this.tasks.map(task => task.id));
        for (const id of ids) {
            if (typeof id === 'string' && validIds.has(id)) this.completedTaskIds.add(id);
        }
    }

    public getTaskStates(): TaskState[] {
        return this.tasks.map(task => ({ config: { ...task }, completed: this.isCompleted(task.id) }));
    }

    /** Optional tasks remain available after the main goals are complete. */
    public getProgress(): TaskProgress {
        let requiredTotal = 0;
        let requiredCompleted = 0;
        let optionalTotal = 0;
        let optionalCompleted = 0;
        for (const task of this.tasks) {
            if (task.required) {
                requiredTotal++;
                if (this.isCompleted(task.id)) requiredCompleted++;
            } else {
                optionalTotal++;
                if (this.isCompleted(task.id)) optionalCompleted++;
            }
        }
        return {
            requiredCompleted, requiredTotal, optionalCompleted, optionalTotal,
            allRequiredComplete: requiredCompleted === requiredTotal,
        };
    }

    private matches(task: TaskConfig, hit: TargetClicked): boolean {
        switch (task.type) {
            case 'hiddenObject': return hit.type === 'hiddenObject' && hit.id === task.targetId;
            case 'chickenId': return hit.type === 'chicken' && hit.id === task.targetId;
            case 'chickenTag': return hit.type === 'chicken' && hit.tags.indexOf(task.targetTag) >= 0;
        }
    }
}
