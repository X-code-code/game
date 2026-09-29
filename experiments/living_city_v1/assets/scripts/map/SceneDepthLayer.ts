import { AssetManager, Node, Sprite, SpriteFrame, UITransform, warn } from 'cc';
import type { ForegroundSpriteConfig, Size } from '../config/CityTypes';

interface DepthEntry {
    node: Node;
    footY: () => number;
    sequence: number;
}

/** Sort cutouts and moving characters together by their ground contact line. */
export class SceneDepthLayer {
    public readonly node: Node;
    private readonly entries: DepthEntry[] = [];

    public constructor(map: Node, mapSize: Size, private readonly artBundle: AssetManager.Bundle,
        name = 'SceneDepthLayer') {
        this.node = new Node(name);
        this.node.addComponent(UITransform).setContentSize(mapSize.width, mapSize.height);
        map.addChild(this.node);
    }

    public addActor(node: Node, footY: () => number): void {
        this.node.addChild(node);
        this.entries.push({ node, footY, sequence: this.entries.length });
    }

    /**
     * The source PNG must be transparent and imported in this city's art bundle
     * with a filename matching config.asset. Its centre and size are world units.
     */
    public addForeground(config: ForegroundSpriteConfig): void {
        const node = new Node(config.id);
        node.setPosition(config.x, config.y, 0);
        node.setRotationFromEuler(0, 0, config.rotation ?? 0);
        node.addComponent(UITransform).setContentSize(config.width, config.height);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        this.addActor(node, () => config.footY);
        const path = `${config.asset}/spriteFrame`;
        this.artBundle.load(path, SpriteFrame, (error, frame) => {
            if (!node.isValid) return;
            if (error || !frame) {
                warn(`Foreground art unavailable at ${path}`, error);
                return;
            }
            sprite.spriteFrame = frame;
        });
    }

    /** Called in lateUpdate, after NPC routes have advanced for this frame. */
    public sort(): void {
        const nodes = this.entries.filter(entry => entry.node.isValid && entry.node.parent === this.node);
        nodes.sort((a, b) => b.footY() - a.footY() || a.sequence - b.sequence);
        // Cocos 2D draws later siblings over earlier siblings. Only mutate crossed pairs.
        nodes.forEach((entry, index) => {
            if (this.node.children[index] !== entry.node) entry.node.setSiblingIndex(index);
        });
    }
}
