import { AssetManager, Graphics, Node, Sprite, SpriteFrame, UITransform, warn } from 'cc';

type Size = { width: number; height: number };

/**
 * Load one generated cutout. The canvas and node
 * have the same size and centre, so a transparent pixel never changes placement.
 * Production scenes pass no drawing fallback; missing art stays empty.
 */
export function loadSceneArtSlot(bundle: AssetManager.Bundle, slotId: string, node: Node,
    fallback: Graphics | null, size: Size, onLoaded?: () => void): void {
    const path = `simple2d_scene/${slotId}/spriteFrame`;
    // A city can still run as a greybox when its production artwork is absent.
    if (!bundle.getInfoWithPath(path, SpriteFrame)) return;
    bundle.load(path, SpriteFrame, (error, frame) => {
        if (!node.isValid) return;
        if (error || !frame) {
            warn(`Scene art could not load at ${path}`, error);
            return;
        }
        const imageSize = frame.originalSize;
        if (imageSize.width !== size.width || imageSize.height !== size.height) {
            warn(`Scene art ${slotId} has ${imageSize.width}x${imageSize.height}; expected ${size.width}x${size.height}`);
            return;
        }
        const visual = new Node(`${slotId}_art`);
        node.insertChild(visual, 0);
        visual.addComponent(UITransform).setContentSize(size.width, size.height);
        const sprite = visual.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.spriteFrame = frame;
        if (fallback) fallback.enabled = false;
        // The greybox name is a child Label, which is independent of Graphics.
        for (const child of node.children) {
            if (child.name.startsWith('Label_')) child.active = false;
        }
        onLoaded?.();
    });
}
