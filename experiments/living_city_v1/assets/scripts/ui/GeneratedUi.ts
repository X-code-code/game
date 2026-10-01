import { assetManager, AssetManager, Node, Sprite, SpriteFrame, warn } from 'cc';

/** UI image loading only; rounded outlines and painted surfaces are generated PNGs. */
export function generatedUi(node: Node, name: string, bundle?: AssetManager.Bundle, sliced = true): Sprite {
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    if (sliced) sprite.type = Sprite.Type.SLICED;
    const source = bundle ?? assetManager.getBundle('city_living_city_street_block_01');
    if (!source) { warn(`Generated UI bundle unavailable: ${name}`); return sprite; }
    source.load(`ui/${name}/spriteFrame`, SpriteFrame, (error, frame) => {
        if (!node.isValid) return;
        if (error || !frame) { warn(`Generated UI image unavailable: ${name}`, error); return; }
        sprite.spriteFrame = frame;
    });
    return sprite;
}
