import { AssetManager, Node, SpriteFrame, warn } from 'cc';
import type { Size } from '../config/CityTypes';
import { AmbientChickenNpc } from '../character/AmbientChickenNpc';
import type { AmbientNpcActivity, AmbientNpcStop } from '../character/AmbientChickenRoute';
import { SceneDepthLayer } from './SceneDepthLayer';

/** Seven reusable costumes keep the scene populated without 20 separate textures. */
type WinterNpcArt = 'courier' | 'vendor' | 'child' | 'potter' | 'porter' | 'elder' | 'shopper';

interface CrowdStop {
    /** Normalized foot contact point on the map, not the sprite centre. */
    x: number;
    y: number;
    wait: number;
    activity: AmbientNpcActivity;
    facing?: 'left' | 'right';
}

interface CrowdRole {
    id: string;
    art: WinterNpcArt;
    stops: readonly CrowdStop[];
    /** Character-height multiplier; children are smaller than adults at the same depth. */
    stature?: number;
    /** Seconds before its first stroll, so the street never moves in unison. */
    startOffset: number;
}

function stop(x: number, y: number, wait: number, activity: AmbientNpcActivity,
    facing?: 'left' | 'right'): CrowdStop {
    return { x, y, wait, activity, facing };
}

/**
 * Locations are foot points measured against the winter market illustration.
 * Each short route stays on one paved lane or at one stall, never across a roof.
 */
const CROWD: readonly CrowdRole[] = [
    { id: 'winter_bridge_courier', art: 'courier', startOffset: 1.7, stops: [
        stop(.610, .720, 1.1, 'look', 'right'), stop(.597, .708, 1.5, 'gesture', 'left')] },
    { id: 'winter_bridge_visitor', art: 'shopper', startOffset: 4.8, stops: [
        stop(.600, .720, 1.7, 'look', 'left'), stop(.585, .705, 1.9, 'idle', 'right')] },
    { id: 'winter_bridge_child', art: 'child', stature: .86, startOffset: 7.3, stops: [
        stop(.540, .680, .8, 'gesture', 'right'), stop(.552, .669, 1.5, 'look', 'left')] },
    { id: 'winter_bridge_elder', art: 'elder', startOffset: 2.9, stops: [
        stop(.580, .640, 2.8, 'look', 'left'), stop(.566, .626, 2.3, 'idle', 'right')] },

    { id: 'winter_upper_lane_porter', art: 'porter', startOffset: 9.2, stops: [
        stop(.540, .600, .8, 'idle', 'right'), stop(.555, .588, 2.2, 'browse', 'left')] },
    { id: 'winter_upper_lane_child', art: 'child', stature: .87, startOffset: 3.6, stops: [
        stop(.550, .570, 1.5, 'look', 'right'), stop(.532, .555, .8, 'gesture', 'left')] },
    { id: 'winter_arch_vendor', art: 'vendor', startOffset: 0.2, stops: [
        stop(.540, .540, 2.8, 'gesture', 'right'), stop(.551, .530, 2.5, 'browse', 'left')] },

    { id: 'winter_arch_customer', art: 'shopper', startOffset: 5.3, stops: [
        stop(.560, .500, 1.6, 'browse', 'right'), stop(.542, .486, 1.9, 'chat', 'left')] },
    { id: 'winter_lantern_courier', art: 'courier', startOffset: 2.1, stops: [
        stop(.530, .470, 1.2, 'look', 'right'), stop(.545, .454, 2.2, 'chat', 'left')] },
    { id: 'winter_lantern_child', art: 'child', stature: .86, startOffset: 6.5, stops: [
        stop(.550, .440, 1.1, 'gesture', 'right'), stop(.568, .424, 1.4, 'look', 'left')] },
    { id: 'winter_lantern_elder', art: 'elder', startOffset: 0.6, stops: [
        stop(.510, .400, 2.4, 'look', 'left'), stop(.493, .384, 2.0, 'chat', 'right')] },
    { id: 'winter_flower_customer', art: 'shopper', startOffset: 7.9, stops: [
        stop(.560, .360, 1.5, 'browse', 'right'), stop(.542, .346, 2.0, 'look', 'left')] },

    { id: 'winter_pottery_shopper', art: 'shopper', startOffset: 3.1, stops: [
        stop(.495, .340, 1.6, 'browse', 'right'), stop(.508, .326, 1.8, 'chat', 'left')] },
    { id: 'winter_right_lane_courier', art: 'courier', startOffset: 8.4, stops: [
        stop(.460, .300, .8, 'idle', 'right'), stop(.477, .286, 1.5, 'look', 'left')] },
    { id: 'winter_right_lane_child', art: 'child', stature: .88, startOffset: 1.2, stops: [
        stop(.520, .270, .9, 'gesture', 'right'), stop(.540, .255, 1.2, 'look', 'left')] },
    { id: 'winter_right_lane_porter', art: 'porter', startOffset: 6.0, stops: [
        stop(.580, .240, .9, 'idle', 'left'), stop(.562, .228, 2.0, 'browse', 'right')] },

    { id: 'winter_tea_stall_vendor', art: 'vendor', startOffset: 2.4, stops: [
        stop(.480, .200, 3.5, 'gesture', 'left'), stop(.492, .186, 2.7, 'browse', 'right')] },
    { id: 'winter_basket_customer', art: 'shopper', startOffset: 4.1, stops: [
        stop(.540, .180, 1.9, 'browse', 'right'), stop(.557, .167, 1.3, 'chat', 'left')] },
    { id: 'winter_lower_lane_potter', art: 'potter', startOffset: 7.2, stops: [
        stop(.580, .150, 2.1, 'look', 'right'), stop(.563, .138, 1.6, 'chat', 'left')] },
    { id: 'winter_lower_lane_elder', art: 'elder', startOffset: 3.7, stops: [
        stop(.530, .100, 2.1, 'look', 'right'), stop(.548, .094, 1.5, 'idle', 'left')] },
];

const ART_PATHS: Record<WinterNpcArt, string> = {
    courier: 'winter_npc_courier/spriteFrame',
    vendor: 'winter_npc_vendor/spriteFrame',
    child: 'winter_npc_child/spriteFrame',
    potter: 'winter_npc_potter/spriteFrame',
    porter: 'winter_npc_porter/spriteFrame',
    elder: 'winter_npc_elder/spriteFrame',
    shopper: 'winter_npc_shopper/spriteFrame',
};

/** The normalized 256px cutouts occupy about 74% of their transparent canvas height. */
const ALPHA_HEIGHT_FRACTION = .74;
/** Their feet sit around y=222 of 256; offset their centred node to the pavement. */
const FOOT_OFFSET_FRACTION = (222 - 128) / 256;

function visibleHeightAt(footY: number, stature: number): number {
    return Math.max(28, Math.min(105, 111 - footY * 103)) * stature;
}

/**
 * Adds non-interactive residents to the shared depth layer. Returns its node
 * so dialogue targets can still resolve residents by ID.
 */
export function populateWinterMarketCrowd(depthLayer: SceneDepthLayer, mapSize: Size,
    artBundle: AssetManager.Bundle): Node {
    const layer = depthLayer.node;

    const byArt = new Map<WinterNpcArt, AmbientChickenNpc[]>();
    // Add distant residents first; SceneDepthLayer updates order as they walk.
    for (const role of [...CROWD].sort((a, b) => b.stops[0].y - a.stops[0].y)) {
        const footY = role.stops[0].y;
        const spriteSize = visibleHeightAt(footY, role.stature ?? 1) / ALPHA_HEIGHT_FRACTION;
        const spriteStops: AmbientNpcStop[] = role.stops.map(point => ({
            x: (point.x - .5) * mapSize.width,
            y: (point.y - .5) * mapSize.height + spriteSize * FOOT_OFFSET_FRACTION,
            waitSeconds: point.wait,
            activity: point.activity,
            facing: point.facing,
        }));
        const node = new Node(role.id);
        const npc = node.addComponent(AmbientChickenNpc);
        npc.configure({
            id: role.id,
            stops: spriteStops,
            speed: Math.max(9, 30 - footY * 22),
            startOffsetSeconds: role.startOffset,
            spriteSize,
        });
        depthLayer.addActor(node, () => npc.footY);
        const group = byArt.get(role.art) ?? [];
        group.push(npc);
        byArt.set(role.art, group);
    }

    // Load each costume once; all copies share one SpriteFrame and stay tappable-through.
    for (const [art, npcs] of byArt) {
        const path = ART_PATHS[art];
        artBundle.load(path, SpriteFrame, (error, frame) => {
            if (!layer.isValid) return;
            if (error || !frame) {
                warn(`Winter market NPC art unavailable at ${path}`, error);
                return;
            }
            for (const npc of npcs) {
                if (npc.isValid) npc.setFrames({ idle: frame });
            }
        });
    }
    return layer;
}

/** Used by scene validation to verify the expected population and route data. */
export const WINTER_MARKET_CROWD_COUNT = CROWD.length;
