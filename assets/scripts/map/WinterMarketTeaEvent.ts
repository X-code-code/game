import { Color, Graphics, Node, UITransform } from 'cc';
import type { Size } from '../config/CityTypes';
import { ChickenCharacter } from '../character/ChickenCharacter';
import { SceneDepthLayer } from './SceneDepthLayer';

type Facing = 'left' | 'right';
type Point = { x: number; y: number };
type WalkPhase = { kind: 'walk'; from: Point; to: Point; seconds: number; facing: Facing };
type WaitPhase = { kind: 'wait' | 'pour' | 'rest'; at: Point; seconds: number; facing: Facing };
type Phase = WalkPhase | WaitPhase;

// A berry bush and barrel occupy the counter's right edge. The nearest
// unobstructed foot point is in the cobbled lane to their right.
const UPPER_STREET: Point = { x: 0.58, y: 0.67 };
const STREET_BEND: Point = { x: 0.55, y: 0.60 };
const STALL_LANE: Point = { x: 0.505, y: 0.54 };
const PHASES: readonly Phase[] = [
    { kind: 'walk', from: UPPER_STREET, to: STREET_BEND, seconds: 2.2, facing: 'left' },
    { kind: 'walk', from: STREET_BEND, to: STALL_LANE, seconds: 1.5, facing: 'left' },
    { kind: 'wait', at: STALL_LANE, seconds: 0.55, facing: 'left' },
    { kind: 'pour', at: STALL_LANE, seconds: 0.9, facing: 'left' },
    { kind: 'wait', at: STALL_LANE, seconds: 1.5, facing: 'left' },
    { kind: 'walk', from: STALL_LANE, to: STREET_BEND, seconds: 1.8, facing: 'right' },
    { kind: 'walk', from: STREET_BEND, to: UPPER_STREET, seconds: 2.2, facing: 'right' },
    { kind: 'rest', at: UPPER_STREET, seconds: 12, facing: 'right' },
];

/** A single small street routine, owned by the winter trial scene. */
export class WinterMarketTeaEvent {
    private phaseIndex = 0;
    private phaseSeconds = 0;
    private steamSeconds = 0;
    private steamRedraw = 0;
    private readonly steamNode: Node;
    private readonly steam: Graphics;

    public constructor(private readonly mapSize: Size, depth: SceneDepthLayer,
        private readonly messenger: ChickenCharacter, private readonly vendor: ChickenCharacter) {
        const steamNode = new Node('TeaSteamerLiveSteam');
        steamNode.setPosition(-237, 106, 0);
        steamNode.addComponent(UITransform).setContentSize(64, 55);
        this.steam = steamNode.addComponent(Graphics);
        // The steam sits behind the separately extracted bamboo steamer, at its real spout.
        depth.addActor(steamNode, () => 16);
        this.steamNode = steamNode;
        this.enterPhase();
        this.placeMessenger(0);
        this.drawSteam();
    }

    public update(deltaTime: number): void {
        if (!Number.isFinite(deltaTime) || deltaTime <= 0 || !this.messenger.node.isValid) return;
        let remaining = Math.min(deltaTime, 0.1);
        while (remaining > 0) {
            const phase = PHASES[this.phaseIndex];
            const step = Math.min(remaining, phase.seconds - this.phaseSeconds);
            this.phaseSeconds += step;
            remaining -= step;
            if (this.phaseSeconds >= phase.seconds - 0.00001) {
                this.phaseSeconds = 0;
                this.phaseIndex = (this.phaseIndex + 1) % PHASES.length;
                this.enterPhase();
            }
        }
        this.placeMessenger(this.phaseSeconds / PHASES[this.phaseIndex].seconds);
        this.steamSeconds += Math.min(deltaTime, 0.1);
        this.steamRedraw += Math.min(deltaTime, 0.1);
        if (this.steamRedraw >= 1 / 15) {
            this.steamRedraw = 0;
            this.drawSteam();
        }
    }

    public dispose(): void {
        if (this.messenger.isValid && this.messenger.node.isValid) this.messenger.clearDirectedMotion();
        if (this.steamNode.isValid) this.steamNode.destroy();
    }

    private enterPhase(): void {
        const phase = PHASES[this.phaseIndex];
        this.messenger.setBehavior(phase.kind === 'walk'
            ? { behaviorType: 'walk', behaviorConfig: { bobHeight: 1, pauseSeconds: 0 },
                speed: 75, movementRange: { minX: 0.505, maxX: 0.58 } }
            : { behaviorType: 'idle', behaviorConfig: { bobHeight: 0.5, blinkInterval: 3.7 } });
        if (phase.kind === 'pour') {
            this.vendor.setBehavior({ behaviorType: 'peck',
                behaviorConfig: { pecksPerCycle: 2, pauseSeconds: 0.45 } });
        } else {
            this.vendor.setBehavior({ behaviorType: 'idle',
                behaviorConfig: { bobHeight: 1, blinkInterval: 3 } });
        }
    }

    private placeMessenger(progress: number): void {
        const phase = PHASES[this.phaseIndex];
        const point = phase.kind === 'walk'
            ? { x: phase.from.x + (phase.to.x - phase.from.x) * progress,
                y: phase.from.y + (phase.to.y - phase.from.y) * progress }
            : phase.at;
        const x = point.x * this.mapSize.width - this.mapSize.width / 2;
        const y = point.y * this.mapSize.height - this.mapSize.height / 2;
        this.messenger.setDirectedMotion(x, y, phase.facing, phase.kind === 'walk');
    }

    private drawSteam(): void {
        if (!this.steamNode.isValid) return;
        const graphics = this.steam;
        graphics.clear();
        // Existing art contains the steamer and pale static vapor. These faint,
        // short rising strokes add movement only where hot steam already exists.
        for (let index = 0; index < 2; index++) {
            const progress = (this.steamSeconds / 3.1 + index * 0.53) % 1;
            const opacity = Math.round(58 * Math.sin(Math.PI * progress));
            if (opacity < 4) continue;
            const x = -8 + index * 15 + Math.sin(this.steamSeconds * 0.8 + index) * 3;
            const y = -8 + progress * 23;
            graphics.lineWidth = 3.2;
            graphics.strokeColor = new Color(245, 235, 216, opacity);
            graphics.moveTo(x, y);
            graphics.bezierCurveTo(x - 5, y + 6, x + 7, y + 11, x + 1, y + 19);
            graphics.stroke();
        }
    }
}
