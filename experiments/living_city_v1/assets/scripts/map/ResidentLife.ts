/** Pure resident timing. It only selects existing PNG clips and never draws art. */
export type ResidentClip = 'walk_n' | 'walk_nw' | 'walk_ne' | 'turn_nw_w' |
    'idle_w' | 'receive_w' | 'turn_w_ne' | 'idle_ne';

export interface ResidentIdlePose {
    requestedAction: string;
    visualAction: string;
    clip: ResidentClip;
    /** False means the requested action needs new generated animation frames. */
    supported: boolean;
}

const REST_ACTIONS = ['short_pause', 'look_at_passersby', 'watch_market', 'wait', 'idle'];
// The legacy receive_w slot stores a different, actually generated activity for
// each actor. These names follow that actor's saved generation prompt.
const GENERATED_ACTIVITIES: Record<string, Record<string, string>> = {
    messenger_customer: { inspect_letter: 'inspect_letter' },
    tea_vendor: { offer_tea: 'offer_tea' },
    crossing_shopper: { look_in_basket: 'look_in_basket', check_basket: 'look_in_basket' },
    chestnut_seller: { tend_cart: 'stir_chestnuts', stir_chestnuts: 'stir_chestnuts' },
    lantern_watcher: { wave_at_passersby: 'wave', wave: 'wave' },
    tea_regular: { sip_tea: 'sip_tea' },
    flower_buyer: { look_at_flowers: 'smell_flower', smell_flower: 'smell_flower' },
    lane_child: { look_up: 'look_up_and_wave', wave: 'look_up_and_wave' },
    // v7 residents have their own generated side-view job cels in receive_w.
    flower_shopkeeper: { smell_flower: 'smell_flower' },
    book_shopkeeper: { read_book: 'read_book' },
    sweet_shopkeeper: { offer_sweet: 'offer_sweet' },
    noodle_shopkeeper: { stir_bowl: 'stir_bowl' },
    garden_neighbor: { water_flower: 'water_flower' },
    laundry_neighbor: { hang_cloth: 'hang_cloth' },
    strolling_reader: { read_book: 'read_book' },
    visiting_child: { wave: 'wave' },
};

export function resolveResidentIdleAction(actorId: string, action: string): ResidentIdlePose {
    const activity = GENERATED_ACTIVITIES[actorId]?.[action];
    if (activity) return { requestedAction: action, visualAction: activity,
        clip: 'receive_w', supported: true };
    const supported = REST_ACTIONS.indexOf(action) >= 0;
    return { requestedAction: action, visualAction: 'idle', clip: 'idle_w', supported };
}

function stableHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

/** Per-actor rest/activity timing advances only while the actor is stationary. */
export class ResidentIdleRoutine {
    private readonly actorId: string;
    private seconds: number;
    private readonly beatSeconds: number;
    private readonly actions: readonly string[];

    public constructor(actorId: string, actions: readonly string[] = []) {
        this.actorId = actorId;
        this.actions = actions.length > 0 ? actions : ['short_pause'];
        const hash = stableHash(actorId);
        this.beatSeconds = 2.4 + (hash % 110) / 100;
        this.seconds = ((hash >>> 8) % 1000) / 1000 * this.beatSeconds * this.actions.length;
    }

    public get pose(): ResidentIdlePose {
        const actionIndex = Math.floor(this.seconds / this.beatSeconds) % this.actions.length;
        const action = this.actions[actionIndex];
        const pose = resolveResidentIdleAction(this.actorId, action);
        // Activity frames play once, then return to the actor's resting pose.
        // Re-entering receive_w on the next visit restarts its one-shot cels.
        if (this.seconds % this.beatSeconds >= 1.15) return {
            requestedAction: action, visualAction: 'idle', clip: 'idle_w', supported: pose.supported,
        };
        return pose;
    }

    public tick(deltaSeconds: number, moving: boolean): ResidentIdlePose {
        if (!moving && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
            this.seconds += Math.min(deltaSeconds, 0.25);
        }
        return this.pose;
    }
}

export type ResidentRouteMode = 'forward' | 'ping_pong';

/** Returns an adjacent authored waypoint for ping-pong routes, without teleporting. */
export function nextResidentWaypoint(arrived: number, routeLength: number, loop: boolean,
    mode: ResidentRouteMode, direction: number): { nextIndex: number; direction: number } {
    if (routeLength < 2) return { nextIndex: routeLength, direction: 1 };
    if (mode === 'ping_pong') {
        const nextDirection = arrived >= routeLength - 1 ? -1 : arrived <= 0 ? 1 : direction;
        return { nextIndex: arrived + nextDirection, direction: nextDirection };
    }
    const next = arrived + 1;
    return { nextIndex: next >= routeLength && loop ? 0 : next, direction: 1 };
}

export interface ResidentActorBeat {
    npcId: string;
    atSeconds: number;
    durationSeconds: number;
    clip: ResidentClip;
    /** Mirrors a generated frame around its registered footpoint. */
    facing?: number;
}

export interface ResidentEventProp {
    asset: string;
    at: { x: number; y: number };
    size: { width: number; height: number };
    visibleFromSeconds: number;
    visibleUntilSeconds: number;
}

export interface ResidentSceneEvent {
    id: string;
    trigger: { npcId: string; waypointIndex: number; direction?: 'forward' | 'both' };
    /** Present only for authored interactions that require a player's resident tap. */
    tapTriggerNpcId?: string;
    /** Optional keepsake awarded after the activity finishes, outside required tasks. */
    discoveryId?: string;
    participants?: string[];
    resumeRouteAfterSeconds: number;
    repeat?: boolean;
    cooldownSeconds?: number;
    actorBeats?: ResidentActorBeat[];
    prop?: ResidentEventProp;
}

type ActiveEvent = { spec: ResidentSceneEvent; seconds: number };
export type ResidentEventCompletion = { eventId: string; triggerNpcId: string; discoveryId?: string };

export interface SceneDiscoveryPoint {
    id: string;
    supportArtSlotId: string;
    at: { x: number; y: number };
    clickRadiusWorld: number;
    message: string;
}

export interface ResidentRequest {
    id: string;
    npcId: string;
    requiredTargetId: string;
    waitingMessage: string;
    completionMessage: string;
}

export interface ResidentDiscoveryHooks {
    hasFoundTarget(id: string): boolean;
    hasDiscovery(id: string): boolean;
    recordDiscovery(id: string): void;
}

export type ResidentConversation = string | readonly string[];

/** A tap advances that resident's own short chat; it does not request a hint. */
export function residentConversationLine(value: ResidentConversation | undefined, turn = 0): string | null {
    const lines = (typeof value === 'string' ? [value] : value ?? [])
        .filter(line => typeof line === 'string' && line.trim().length > 0);
    if (!lines.length) return null;
    const index = Number.isFinite(turn) ? Math.max(0, Math.floor(turn)) % lines.length : 0;
    return lines[index];
}

/** A request recognizes a collected sticker without consuming it or gating the city. */
export function resolveResidentRequest(request: ResidentRequest, targetFound: boolean,
    alreadyCompleted: boolean): { message: string; discoveryId: string | null } {
    if (alreadyCompleted || targetFound) return {
        message: request.completionMessage, discoveryId: alreadyCompleted ? null : request.id,
    };
    return { message: request.waitingMessage, discoveryId: null };
}

const TEA_BEATS: ResidentActorBeat[] = [
    { npcId: 'messenger_customer', atSeconds: 0, durationSeconds: 0.35, clip: 'turn_nw_w' },
    { npcId: 'messenger_customer', atSeconds: 0.35, durationSeconds: 0.45, clip: 'idle_w' },
    { npcId: 'messenger_customer', atSeconds: 0.8, durationSeconds: 1.1, clip: 'receive_w' },
    { npcId: 'tea_vendor', atSeconds: 0, durationSeconds: 0.35, clip: 'idle_w', facing: 1 },
    { npcId: 'tea_vendor', atSeconds: 0.35, durationSeconds: 1.55, clip: 'receive_w', facing: 1 },
];

/** Independent events reserve only their own actors and respect re-entry cooldowns. */
export class ResidentEventDirector {
    private readonly events: ResidentSceneEvent[];
    private readonly active: ActiveEvent[] = [];
    private readonly completed = new Set<string>();
    private readonly nextAllowedAt = new Map<string, number>();
    private elapsed = 0;

    public constructor(events: readonly ResidentSceneEvent[]) {
        this.events = events.map(event => {
            const actorBeats = event.actorBeats ?? (event.id === 'tea_exchange' &&
                event.trigger.npcId === 'messenger_customer' ? TEA_BEATS : []);
            return { ...event,
                participants: Array.from(new Set([event.trigger.npcId, ...(event.participants ?? []),
                    ...(event.tapTriggerNpcId ? [event.tapTriggerNpcId] : []),
                    ...actorBeats.map(beat => beat.npcId)])), actorBeats };
        });
    }

    public tryStart(npcId: string, waypointIndex: number, forward = true): boolean {
        const spec = this.events.find(event => !event.tapTriggerNpcId && event.trigger.npcId === npcId &&
            event.trigger.waypointIndex === waypointIndex &&
            (forward || event.trigger.direction === 'both') &&
            this.canStart(event));
        return this.start(spec);
    }

    /** A resident tap uses the same reservations and cooldown as a route event. */
    public tryStartByTap(npcId: string): boolean {
        return this.start(this.events.find(event => event.tapTriggerNpcId === npcId && this.canStart(event)));
    }

    private canStart(event: ResidentSceneEvent): boolean {
        return (event.repeat === true || !this.completed.has(event.id)) &&
            this.elapsed + 1e-6 >= (this.nextAllowedAt.get(event.id) ?? 0) &&
            !this.active.some(active => active.spec.id === event.id ||
                active.spec.participants!.some(actor => event.participants!.indexOf(actor) >= 0));
    }

    private start(spec: ResidentSceneEvent | undefined): boolean {
        if (!spec) return false;
        this.active.push({ spec, seconds: 0 });
        return true;
    }

    public isParticipant(npcId: string): boolean {
        return this.active.some(event => event.spec.participants!.indexOf(npcId) >= 0);
    }

    public actorBeat(npcId: string): ResidentActorBeat | null {
        for (const event of this.active) {
            const beat = event.spec.actorBeats!.find(beat => beat.npcId === npcId &&
                event.seconds >= beat.atSeconds &&
                event.seconds < beat.atSeconds + beat.durationSeconds);
            if (beat) return beat;
        }
        return null;
    }

    public eventSeconds(eventId: string): number | null {
        return this.active.find(event => event.spec.id === eventId)?.seconds ?? null;
    }

    public tick(deltaSeconds: number): ResidentEventCompletion[] {
        const finished: ResidentEventCompletion[] = [];
        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return finished;
        const step = Math.min(deltaSeconds, 0.25);
        this.elapsed += step;
        for (let index = this.active.length - 1; index >= 0; index--) {
            const event = this.active[index];
            event.seconds += step;
            if (event.seconds + 1e-6 < event.spec.resumeRouteAfterSeconds) continue;
            this.active.splice(index, 1);
            this.completed.add(event.spec.id);
            this.nextAllowedAt.set(event.spec.id, this.elapsed + Math.max(0, event.spec.cooldownSeconds ?? 8));
            const completion: ResidentEventCompletion = {
                eventId: event.spec.id, triggerNpcId: event.spec.trigger.npcId,
            };
            if (event.spec.discoveryId) completion.discoveryId = event.spec.discoveryId;
            finished.push(completion);
        }
        return finished;
    }
}
