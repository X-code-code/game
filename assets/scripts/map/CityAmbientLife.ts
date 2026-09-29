import { _decorator, Color, Component, Graphics } from 'cc';
import type { Size } from '../config/CityTypes';

const { ccclass } = _decorator;

type WaterSpot = { x: number; y: number; width: number; phase: number };
type FallingPetal = { x: number; y: number; drift: number; fall: number; period: number; phase: number; size: number };

/** Small painted accents in map coordinates. It owns no input listeners or colliders. */
@ccclass('CityAmbientLife')
export class CityAmbientLife extends Component {
    private cityId = '';
    private mapWidth = 0;
    private mapHeight = 0;
    private elapsed = 0;
    private redrawDelay = 0;
    private graphics: Graphics | null = null;

    private readonly demoWater: WaterSpot[] = [
        { x: 0.608, y: 0.235, width: 15, phase: 0.1 },
        { x: 0.668, y: 0.255, width: 18, phase: 1.8 },
        { x: 0.725, y: 0.271, width: 13, phase: 3.0 },
    ];
    private readonly harborWater: WaterSpot[] = [
        { x: 0.08, y: 0.07, width: 32, phase: 0.2 },
        { x: 0.38, y: 0.04, width: 22, phase: 2.0 },
        { x: 0.05, y: 0.53, width: 24, phase: 3.4 },
        { x: 0.17, y: 0.66, width: 28, phase: 4.8 },
        { x: 0.23, y: 0.92, width: 34, phase: 1.5 },
    ];
    private readonly demoPetals: FallingPetal[] = [
        { x: 0.085, y: 0.07, drift: 92, fall: 119, period: 7.2, phase: 0.00, size: 6 },
        { x: 0.115, y: 0.26, drift: 73, fall: 85, period: 8.6, phase: 0.48, size: 5 },
        { x: 0.772, y: 0.37, drift: 96, fall: 103, period: 9.5, phase: 0.27, size: 6 },
        { x: 0.916, y: 0.48, drift: 84, fall: 94, period: 8.1, phase: 0.64, size: 6 },
    ];
    private readonly harborPetals: FallingPetal[] = [
        { x: 0.81, y: 0.32, drift: 88, fall: 100, period: 8.4, phase: 0.10, size: 7 },
        { x: 0.94, y: 0.59, drift: 120, fall: 110, period: 9.1, phase: 0.54, size: 8 },
    ];

    public configure(cityId: string, mapSize: Size): void {
        this.cityId = cityId;
        this.mapWidth = mapSize.width;
        this.mapHeight = mapSize.height;
        this.graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        this.drawFrame();
    }

    protected update(deltaTime: number): void {
        if (!this.graphics || this.mapWidth <= 0 || this.mapHeight <= 0) return;
        const step = Math.min(Math.max(deltaTime, 0), 0.1);
        this.elapsed += step;
        this.redrawDelay += step;
        // Decorative motion does not need the full game frame rate.
        if (this.redrawDelay < 1 / 15) return;
        this.redrawDelay = 0;
        this.drawFrame();
    }

    private drawFrame(): void {
        const graphics = this.graphics;
        if (!graphics) return;
        graphics.clear();
        const water = this.cityId === 'harbor_test' ? this.harborWater : this.demoWater;
        const petals = this.cityId === 'harbor_test' ? this.harborPetals : this.demoPetals;
        for (const spot of water) this.drawWaterGlint(graphics, spot);
        for (const petal of petals) this.drawPetal(graphics, petal);
    }

    private drawWaterGlint(graphics: Graphics, spot: WaterSpot): void {
        const wave = this.elapsed * 1.2 + spot.phase;
        const centerX = this.mapX(spot.x) + Math.sin(wave * 0.7) * 7;
        const centerY = this.mapY(spot.y) + Math.sin(wave * 0.9) * 3;
        const halfWidth = spot.width * (0.8 + Math.sin(wave) * 0.17);
        const opacity = Math.round(42 + 36 * (0.5 + 0.5 * Math.sin(wave)));
        graphics.lineWidth = 2.1;
        graphics.strokeColor = new Color(239, 244, 222, opacity);
        for (let line = 0; line < 2; line++) {
            const y = centerY - line * 8;
            const width = halfWidth * (line ? 0.64 : 1);
            graphics.moveTo(centerX - width, y);
            graphics.bezierCurveTo(centerX - width * 0.35, y + 3,
                centerX + width * 0.25, y - 3, centerX + width, y + 1);
            graphics.stroke();
        }
    }

    private drawPetal(graphics: Graphics, petal: FallingPetal): void {
        const progress = (this.elapsed / petal.period + petal.phase) % 1;
        const fade = Math.sin(Math.PI * progress);
        const x = this.mapX(petal.x) - progress * petal.drift + Math.sin(this.elapsed * 1.1 + petal.phase * 9) * 8;
        const y = this.mapY(petal.y) - progress * petal.fall;
        const angle = this.elapsed * 1.5 + petal.phase * 10;
        const dx = Math.cos(angle) * petal.size;
        const dy = Math.sin(angle) * petal.size * 0.55;
        const nx = -dy * 0.45;
        const ny = dx * 0.45;
        graphics.fillColor = new Color(197, 119, 105, Math.round(90 * fade));
        graphics.moveTo(x - dx, y - dy);
        graphics.bezierCurveTo(x - dx * 0.3 + nx, y - dy * 0.3 + ny,
            x + dx * 0.3 + nx, y + dy * 0.3 + ny, x + dx, y + dy);
        graphics.bezierCurveTo(x + dx * 0.3 - nx, y + dy * 0.3 - ny,
            x - dx * 0.3 - nx, y - dy * 0.3 - ny, x - dx, y - dy);
        graphics.close();
        graphics.fill();
    }

    private mapX(normalized: number): number {
        return (normalized - 0.5) * this.mapWidth;
    }

    private mapY(normalizedFromTop: number): number {
        return (0.5 - normalizedFromTop) * this.mapHeight;
    }
}
