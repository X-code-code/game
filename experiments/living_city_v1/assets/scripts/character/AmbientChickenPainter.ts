import { Color, Graphics } from 'cc';

export type AmbientChickenRole = 'vendor' | 'ambient_shopper' | 'ambient_vendor' | 'ambient_watcher'
    | 'tea_regular' | 'flower_buyer' | 'lane_child';
export type AmbientChickenHeading = 'side' | 'north' | 'south';

export type AmbientChickenPose = {
    role: AmbientChickenRole;
    height: number;
    facing: number;
    heading: AmbientChickenHeading;
    time: number;
    motionSeconds: number;
    moving: boolean;
    eventSeconds: number;
};

type Command = ['M' | 'L', number, number] | ['Q', number, number, number, number]
    | ['C', number, number, number, number, number, number] | ['Z'];

const C = {
    ink: new Color(87, 73, 84, 255),
    lightInk: new Color(132, 114, 122, 255),
    cream: new Color(255, 245, 223, 255),
    pale: new Color(255, 250, 235, 255),
    honey: new Color(248, 224, 164, 255),
    russet: new Color(242, 194, 103, 255),
    cheek: new Color(238, 158, 145, 255),
    terracotta: new Color(238, 139, 127, 255),
    sage: new Color(125, 187, 131, 255),
    slate: new Color(117, 191, 200, 255),
    wood: new Color(201, 144, 100, 255),
    orange: new Color(230, 161, 82, 255),
    orangeLight: new Color(242, 194, 103, 255),
    eye: new Color(87, 73, 84, 255),
    shadow: new Color(87, 73, 84, 42),
};

/** Commands stay in a shared, foot-anchored 120-unit character coordinate system. */
function shape(g: Graphics, scale: number, facing: number, commands: Command[], fill: Color,
    outline: Color | null = C.ink, width = 3): void {
    for (const command of commands) {
        switch (command[0]) {
            case 'M': g.moveTo(command[1] * scale * facing, command[2] * scale); break;
            case 'L': g.lineTo(command[1] * scale * facing, command[2] * scale); break;
            case 'Q': g.quadraticCurveTo(command[1] * scale * facing, command[2] * scale,
                command[3] * scale * facing, command[4] * scale); break;
            case 'C': g.bezierCurveTo(command[1] * scale * facing, command[2] * scale,
                command[3] * scale * facing, command[4] * scale,
                command[5] * scale * facing, command[6] * scale); break;
            case 'Z': g.close(); break;
        }
    }
    g.fillColor = fill;
    g.fill();
    if (outline) {
        g.strokeColor = outline;
        g.lineWidth = width * scale;
        g.stroke();
    }
}

function dot(g: Graphics, scale: number, facing: number, x: number, y: number, r: number,
    color: Color): void {
    g.fillColor = color;
    g.circle(x * scale * facing, y * scale, r * scale);
    g.fill();
}

function line(g: Graphics, scale: number, facing: number, points: number[][],
    color: Color = C.lightInk, width = 1.5): void {
    g.strokeColor = color;
    g.lineWidth = width * scale;
    g.moveTo(points[0][0] * scale * facing, points[0][1] * scale);
    for (const [x, y] of points.slice(1)) g.lineTo(x * scale * facing, y * scale);
    g.stroke();
}

function foot(g: Graphics, s: number, d: number, hipX: number, hipY: number,
    footX: number, lift: number): void {
    const ankleY = 7 + lift;
    shape(g, s, d, [
        ['M', hipX - 4, hipY], ['Q', footX - 5, 15 + lift, footX - 2, ankleY],
        ['L', footX + 3, ankleY], ['Q', footX + 2, 14 + lift, hipX + 4, hipY], ['Z'],
    ], C.orange, C.ink, 2.5);
    shape(g, s, d, [
        ['M', footX - 3, ankleY + 2], ['Q', footX - 7, 3 + lift, footX - 18, 2 + lift],
        ['Q', footX - 22, 0 + lift, footX - 18, -2 + lift],
        ['Q', footX - 9, -3 + lift, footX - 3, 0 + lift],
        ['Q', footX + 2, -4 + lift, footX + 13, -2 + lift],
        ['Q', footX + 17, 0 + lift, footX + 14, 3 + lift],
        ['Q', footX + 5, 6 + lift, footX - 3, ankleY + 2], ['Z'],
    ], C.orangeLight, C.ink, 2.4);
    line(g, s, d, [[footX + 2, 3 + lift], [footX + 7, 0 + lift]], C.lightInk, 1.1);
}

/** Front and back are redrawn around the same footpoint; no rotated side profile. */
function paintVerticalChicken(g: Graphics, pose: AmbientChickenPose): void {
    const s = pose.height / 120;
    const north = pose.heading === 'north';
    const vendor = pose.role === 'vendor';
    const shopper = pose.role === 'ambient_shopper';
    const seller = pose.role === 'ambient_vendor';
    const watcher = pose.role === 'ambient_watcher';
    const regular = pose.role === 'tea_regular';
    const flower = pose.role === 'flower_buyer';
    const child = pose.role === 'lane_child';
    const phase = pose.motionSeconds * (child ? 14 : 11);
    const swing = pose.moving ? Math.sin(phase) : 0;
    const bob = pose.moving ? Math.abs(swing) * (child ? 4 : 2.5)
        : Math.sin(pose.time * 1.8) * 1.1;
    const leftLift = Math.max(0, -swing) * (child ? 8 : 6);
    const rightLift = Math.max(0, swing) * (child ? 8 : 6);
    const bodyColor = seller ? C.russet : vendor || regular ? C.honey : C.cream;
    const headColor = seller || regular ? C.honey : C.cream;
    const wingColor = seller ? C.russet : C.honey;
    const cloth = vendor || flower || child ? C.terracotta
        : seller || shopper ? C.sage : C.slate;
    const sip = regular && !pose.moving && (pose.time + 0.9) % 5.8 > 1.3
        && (pose.time + 0.9) % 5.8 < 3.6;
    const wave = (watcher && (pose.time + 0.4) % 6.4 > 1.1
        && (pose.time + 0.4) % 6.4 < 3.5)
        || (child && !pose.moving && (pose.time + 1.3) % 5.2 > 1
            && (pose.time + 1.3) % 5.2 < 2.8);
    const exchange = vendor && pose.eventSeconds >= 0.35 && pose.eventSeconds < 1.9;
    const rightRaise = wave ? 18 + Math.sin(pose.time * 9) * 2
        : sip ? 17 : exchange ? 14 : 0;

    // Ground contact and alternating toes stay anchored while the torso bobs.
    shape(g, s, 1, [['M', -26, 0], ['C', -18, -5, 18, -5, 26, 0],
        ['C', 18, 4, -18, 4, -26, 0], ['Z']], C.shadow, null);
    for (const side of [-1, 1]) {
        const lift = side < 0 ? leftLift : rightLift;
        const travel = side < 0 ? swing * 4 : -swing * 4;
        const x = side * 13 + travel;
        shape(g, s, 1, [['M', x - 4, 31 + bob], ['Q', x - 5, 14 + lift, x - 3, 7 + lift],
            ['L', x + 3, 7 + lift], ['Q', x + 5, 16 + lift, x + 4, 31 + bob], ['Z']],
        C.orange, C.ink, 2.3);
        shape(g, s, 1, [['M', x - 14, 3 + lift], ['Q', x - 21, -1 + lift, x - 16, -3 + lift],
            ['Q', x - 8, -4 + lift, x, 0 + lift], ['Q', x + 9, -4 + lift, x + 17, -2 + lift],
            ['Q', x + 20, 1 + lift, x + 11, 4 + lift], ['Z']],
        C.orangeLight, C.ink, 2.2);
        line(g, s, 1, [[x, 3 + lift], [x + 3, 0 + lift]], C.lightInk, 1);
    }

    // A small rear tail and broad torso establish the front/back silhouette.
    shape(g, s, 1, [['M', -13, 40 + bob], ['Q', 0, 19 + bob, 16, 40 + bob],
        ['Q', 4, 47 + bob, -13, 40 + bob], ['Z']], bodyColor, C.ink, 2.4);
    shape(g, s, 1, [['M', -29, 46 + bob], ['C', -32, 27 + bob, -17, 22 + bob, 0, 23 + bob],
        ['C', 19, 22 + bob, 33, 28 + bob, 29, 49 + bob],
        ['C', 27, 70 + bob, 14, 78 + bob, 0, 78 + bob],
        ['C', -17, 78 + bob, -29, 66 + bob, -29, 46 + bob], ['Z']],
    bodyColor, C.ink, 3.2);
    if (north) {
        line(g, s, 1, [[-10, 67 + bob], [0, 72 + bob], [10, 67 + bob]], C.lightInk, 1.2);
    } else {
        shape(g, s, 1, [['M', -17, 57 + bob], ['Q', 0, 68 + bob, 17, 57 + bob],
            ['Q', 18, 35 + bob, 0, 29 + bob], ['Q', -18, 35 + bob, -17, 57 + bob], ['Z']],
        C.pale, null);
    }

    // Clothes are drawn for this view, rather than reusing the side-view contour.
    if (child) {
        shape(g, s, 1, [['M', -22, 65 + bob], ['Q', 0, 56 + bob, 22, 65 + bob],
            ['L', 24, 56 + bob], ['Q', 0, 47 + bob, -23, 56 + bob], ['Z']],
        cloth, C.ink, 2.3);
        const tail = pose.moving ? swing * 5 : Math.sin(pose.time * 2) * 2;
        shape(g, s, 1, [['M', 17, 56 + bob], ['Q', 30, 48 + bob + tail, 33, 37 + bob + tail],
            ['L', 27, 35 + bob + tail], ['Q', 19, 43 + bob, 10, 55 + bob], ['Z']],
        cloth, C.ink, 1.9);
    } else {
        shape(g, s, 1, [['M', -23, 59 + bob], ['Q', -22, 41 + bob, flower ? -32 : -21, 29 + bob],
            ['Q', 0, flower ? 20 + bob : 27 + bob, flower ? 32 : 21, 29 + bob],
            ['Q', 22, 45 + bob, 23, 59 + bob], ['Q', 0, 55 + bob, -23, 59 + bob], ['Z']],
        cloth, C.ink, 2.4);
        if (north) {
            line(g, s, 1, [[-18, 59 + bob], [0, 34 + bob], [18, 59 + bob]],
                C.cream, 2);
        } else if (vendor || seller) {
            shape(g, s, 1, [['M', -13, 58 + bob], ['L', 13, 58 + bob],
                ['L', 17, 32 + bob], ['Q', 0, 28 + bob, -17, 32 + bob], ['Z']],
            cloth, C.cream, 1.8);
            line(g, s, 1, [[-9, 43 + bob], [9, 43 + bob]], C.cream, 1.5);
        } else if (regular) {
            line(g, s, 1, [[0, 56 + bob], [0, 33 + bob]], C.cream, 2);
            dot(g, s, 1, 0, 44 + bob, 1.8, C.wood);
        } else if (shopper) {
            line(g, s, 1, [[-20, 57 + bob], [14, 34 + bob]], C.cream, 2);
        } else if (watcher) {
            line(g, s, 1, [[-21, 57 + bob], [0, 47 + bob], [21, 57 + bob]],
                C.cream, 2);
        } else if (flower) {
            line(g, s, 1, [[-19, 58 + bob], [0, 37 + bob], [19, 58 + bob]],
                C.cream, 1.6);
        }
    }

    const wing = (side: number, raise: number): void => {
        const flap = pose.moving ? (side < 0 ? swing : -swing) * 3 : 0;
        shape(g, s, side, [['M', 18, 65 + bob], ['Q', 33, 65 + bob, 39, 48 + bob + raise + flap],
            ['Q', 43, 42 + bob + raise + flap, 37, 39 + bob + raise + flap],
            ['Q', 31, 42 + bob + raise + flap, 27, 50 + bob],
            ['Q', 20, 48 + bob, 18, 65 + bob], ['Z']],
        wingColor, C.ink, 2.7);
        line(g, s, side, [[29, 48 + bob], [37, 43 + bob + raise + flap]],
            C.lightInk, 1);
    };
    wing(-1, 0);
    wing(1, rightRaise);

    // Head remains around 30% of standing height. Back view has no face or beak.
    const headY = bob + (sip ? -1.5 : 0);
    shape(g, s, 1, [['M', -22, 84 + headY], ['C', -26, 99 + headY, -15, 111 + headY, 0, 111 + headY],
        ['C', 17, 111 + headY, 27, 99 + headY, 23, 84 + headY],
        ['C', 21, 71 + headY, 9, 67 + headY, 0, 68 + headY],
        ['C', -12, 68 + headY, -21, 73 + headY, -22, 84 + headY], ['Z']],
    headColor, C.ink, 3.1);
    shape(g, s, 1, [['M', -5, 109 + headY], ['Q', -5, 120 + headY, 1, 119 + headY],
        ['Q', 4, 121 + headY, 7, 113 + headY], ['Z']], headColor, C.ink, 2.1);
    if (north) {
        line(g, s, 1, [[-13, 85 + headY], [-5, 82 + headY]],
            C.lightInk, 1.2);
        line(g, s, 1, [[6, 80 + headY], [15, 85 + headY]],
            C.lightInk, 1.2);
    } else {
        const blink = pose.time % 4.7 > 4.57;
        for (const x of [-10, 10]) {
            if (blink) line(g, s, 1, [[x - 3, 91 + headY], [x + 3, 91 + headY]], C.eye, 2.4);
            else dot(g, s, 1, x, 91 + headY, 2.8, C.eye);
            dot(g, s, 1, x * 1.6, 81 + headY, 3, C.cheek);
        }
        shape(g, s, 1, [['M', -8, 84 + headY], ['Q', 0, 77 + headY, 8, 84 + headY],
            ['L', 0, 73 + headY], ['Z']], C.orangeLight, C.ink, 2);
        line(g, s, 1, [[-5, 81 + headY], [5, 81 + headY]], C.lightInk, 1);
    }

    // Hats and scarves remain visible from both directions.
    if (vendor || seller || regular || flower || shopper || watcher) {
        const hatColor = vendor || watcher ? C.slate : seller ? C.terracotta
            : regular ? C.wood : C.sage;
        shape(g, s, 1, [['M', -23, 98 + headY], ['Q', -19, 116 + headY, 0, 116 + headY],
            ['Q', 19, 116 + headY, 24, 99 + headY],
            ['Q', 0, 106 + headY, -23, 98 + headY], ['Z']],
        hatColor, C.ink, 2);
        if (!north && (regular || seller)) {
            shape(g, s, 1, [['M', -19, 100 + headY], ['Q', 0, 97 + headY, 19, 100 + headY],
                ['Q', 16, 94 + headY, -18, 94 + headY], ['Z']],
            hatColor, C.ink, 1.4);
        }
        if (flower) dot(g, s, 1, -22, 99 + headY, 3, C.terracotta);
    }

    // Carried objects keep role identity in both vertical views.
    if (shopper) {
        shape(g, s, 1, [['M', -42, 49 + bob], ['L', -27, 51 + bob],
            ['L', -26, 30 + bob], ['Q', -34, 25 + bob, -42, 31 + bob], ['Z']],
        C.terracotta, C.ink, 2);
        line(g, s, 1, [[-39, 49 + bob], [-28, 49 + bob]], C.wood, 1.4);
    } else if (vendor || regular) {
        const cupY = sip ? 76 + headY : exchange ? 65 + bob : 51 + bob;
        shape(g, s, 1, [['M', 37, cupY + 5], ['L', 51, cupY + 5],
            ['L', 48, cupY - 5], ['Q', 44, cupY - 8, 40, cupY - 5], ['Z']],
        C.pale, C.ink, 1.8);
        line(g, s, 1, [[40, cupY], [49, cupY]], C.terracotta, 1.2);
    } else if (seller) {
        const sweep = Math.sin(pose.time * 5) * 3;
        line(g, s, 1, [[35, 51 + bob], [51 + sweep, 38 + bob]], C.wood, 3);
        shape(g, s, 1, [['M', 48 + sweep, 40 + bob], ['Q', 58 + sweep, 42 + bob, 61 + sweep, 36 + bob],
            ['Q', 55 + sweep, 32 + bob, 46 + sweep, 36 + bob], ['Z']],
        C.wood, C.ink, 1.2);
    } else if (flower) {
        const basketY = 32 + bob + swing * 2;
        shape(g, s, 1, [['M', 34, basketY + 9], ['Q', 47, basketY + 13, 60, basketY + 9],
            ['L', 56, basketY - 7], ['Q', 47, basketY - 11, 37, basketY - 7], ['Z']],
        C.wood, C.ink, 2.1);
        line(g, s, 1, [[37, basketY + 6], [47, basketY + 18], [57, basketY + 6]],
            C.cream, 1.5);
        line(g, s, 1, [[47, basketY + 8], [47, basketY + 28]], C.sage, 1.7);
        for (const x of [42, 47, 52]) dot(g, s, 1, x, basketY + 29, 3.3, C.terracotta);
        dot(g, s, 1, 47, basketY + 29, 2, C.honey);
    }
}

/** Original vector-drawn ambient cast. The only moving character node is the route node;
 *  the bird's body, legs, wing and held object change pose independently around its footpoint. */
export function paintAmbientChicken(g: Graphics, pose: AmbientChickenPose): void {
    g.clear();
    if (pose.heading !== 'side') {
        paintVerticalChicken(g, pose);
        return;
    }
    const s = pose.height / 120;
    const d = pose.facing < 0 ? -1 : 1;
    const isVendor = pose.role === 'vendor';
    const isShopper = pose.role === 'ambient_shopper';
    const isSeller = pose.role === 'ambient_vendor';
    const isWatcher = pose.role === 'ambient_watcher';
    const isRegular = pose.role === 'tea_regular';
    const isFlower = pose.role === 'flower_buyer';
    const isChild = pose.role === 'lane_child';
    const stridePhase = pose.motionSeconds * 11;
    const stride = pose.moving ? Math.sin(stridePhase) * (isChild ? 12 : 9) : 0;
    const rightLift = pose.moving ? Math.max(0, Math.sin(stridePhase)) * (isChild ? 8 : 6) : 0;
    const leftLift = pose.moving ? Math.max(0, -Math.sin(stridePhase)) * (isChild ? 8 : 6) : 0;
    const bob = pose.moving ? Math.abs(Math.sin(stridePhase)) * (isChild ? 4 : 2.4)
        : Math.sin(pose.time * (isWatcher || isChild ? 2.5 : 1.6)) * (isChild ? 1.7 : 1.1);
    const exchange = isVendor && pose.eventSeconds >= 0.35 && pose.eventSeconds < 1.9;
    const taskCycle = (pose.time + (isSeller ? 1.3 : 0)) % (isSeller ? 3.9 : 4.8);
    const tending = isSeller && taskCycle < 2.0;
    const arranging = isVendor && !exchange && taskCycle < 1.8;
    const waveCycle = (pose.time + 0.4) % 6.4;
    const wave = isWatcher && waveCycle > 1.1 && waveCycle < 3.5;
    const regularCycle = (pose.time + 0.9) % 5.8;
    const sipping = isRegular && !pose.moving && regularCycle > 1.3 && regularCycle < 3.6;
    const flowerCycle = (pose.time + 2.2) % 7.1;
    const inspectingFlower = isFlower && !pose.moving && flowerCycle > 2 && flowerCycle < 4.5;
    const childCycle = (pose.time + 1.3) % 5.2;
    const childGreeting = isChild && !pose.moving && childCycle > 1 && childCycle < 2.8;
    const wingLift = wave ? 16 + Math.sin(pose.time * 11) * 3
        : childGreeting ? 16 + Math.sin(pose.time * 9) * 3
            : sipping ? 23 : inspectingFlower ? 11
                : exchange ? 12 : tending ? 10 : arranging ? 5
                    : (isRegular || isFlower || isChild) && pose.moving
                        ? Math.sin(stridePhase) * 3 : 0;
    const bodyColor = isSeller ? C.russet : isVendor || isRegular ? C.honey : C.cream;
    const headBob = bob + (sipping ? -2.3 : inspectingFlower ? -1.8
        : isChild && !pose.moving ? Math.sin(pose.time * 2.4) * 1.8 : 0);

    // Runtime ground contact is independent of the character artwork.
    shape(g, s, d, [
        ['M', -26, 0], ['C', -19, -5, 18, -5, 27, 0],
        ['C', 18, 4, -17, 4, -26, 0], ['Z'],
    ], C.shadow, null);
    foot(g, s, d, -12, 27 + bob, -12 + stride, leftLift);
    foot(g, s, d, 11, 27 + bob, 12 - stride, rightLift);

    // Tail feathers are separate from the body contour and sway against the gait.
    const tailSwing = pose.moving ? Math.sin(stridePhase) * 3 : Math.sin(pose.time * 1.9) * 1.3;
    shape(g, s, d, [
        ['M', -24, 43 + bob], ['Q', -40, 39 + bob + tailSwing, -46, 50 + bob + tailSwing],
        ['Q', -44, 61 + bob + tailSwing, -32, 59 + bob],
        ['Q', -43, 65 + bob, -37, 72 + bob],
        ['Q', -27, 73 + bob, -20, 61 + bob], ['Z'],
    ], bodyColor, C.ink, 3.2);
    line(g, s, d, [[-34, 57 + bob], [-42, 55 + bob + tailSwing]], C.lightInk, 1.4);

    // The satchel is carried behind the shopper's torso, with a small walking swing.
    if (isShopper) {
        const bagSwing = pose.moving ? Math.sin(stridePhase) * 3 : 0;
        shape(g, s, d, [
            ['M', -29, 49 + bob + bagSwing], ['Q', -42, 49 + bob + bagSwing, -42, 40 + bob + bagSwing],
            ['L', -39, 26 + bob + bagSwing], ['Q', -31, 21 + bob + bagSwing, -21, 28 + bob + bagSwing],
            ['L', -20, 47 + bob + bagSwing], ['Z'],
        ], C.terracotta, C.ink, 2.5);
        line(g, s, d, [[-37, 47 + bob + bagSwing], [-26, 29 + bob + bagSwing]], C.wood, 1.7);
    }

    // A broad breast and tucked wing read as a chick at normal phone scale.
    shape(g, s, d, [
        ['M', -26, 37 + bob], ['C', -39, 51 + bob, -28, 74 + bob, -10, 79 + bob],
        ['C', 9, 84 + bob, 34, 70 + bob, 32, 47 + bob],
        ['C', 30, 30 + bob, 17, 23 + bob, -2, 24 + bob],
        ['C', -13, 24 + bob, -22, 28 + bob, -26, 37 + bob], ['Z'],
    ], bodyColor, C.ink, 3.5);
    shape(g, s, d, [
        ['M', -4, 61 + bob], ['Q', 22, 66 + bob, 22, 43 + bob],
        ['Q', 17, 29 + bob, -3, 28 + bob],
        ['Q', -16, 30 + bob, -18, 46 + bob],
        ['Q', -15, 57 + bob, -4, 61 + bob], ['Z'],
    ], C.pale, null);

    // Each job has a silhouette-level costume cue instead of a name label.
    if (isVendor) {
        shape(g, s, d, [
            ['M', -19, 53 + bob], ['Q', -10, 31 + bob, 0, 29 + bob],
            ['Q', 18, 29 + bob, 24, 42 + bob],
            ['L', 17, 60 + bob], ['Q', 2, 55 + bob, -19, 53 + bob], ['Z'],
        ], C.terracotta, C.ink, 2.3);
        line(g, s, d, [[-16, 55 + bob], [-3, 44 + bob], [17, 53 + bob]], C.cream, 2);
        shape(g, s, d, [
            ['M', 0, 42 + bob], ['Q', 12, 45 + bob, 15, 39 + bob],
            ['L', 15, 36 + bob], ['Q', 8, 37 + bob, 0, 35 + bob], ['Z'],
        ], C.cream, C.lightInk, 1.1);
    } else if (isSeller) {
        shape(g, s, d, [
            ['M', -17, 54 + bob], ['Q', -6, 32 + bob, 1, 28 + bob],
            ['Q', 17, 30 + bob, 25, 45 + bob],
            ['L', 17, 59 + bob], ['Q', 1, 52 + bob, -17, 54 + bob], ['Z'],
        ], C.sage, C.ink, 2.4);
        line(g, s, d, [[-11, 50 + bob], [13, 43 + bob]], C.cream, 2);
        line(g, s, d, [[-9, 42 + bob], [18, 36 + bob]], C.cream, 2);
    } else if (isShopper) {
        shape(g, s, d, [
            ['M', -24, 51 + bob], ['Q', -13, 33 + bob, -7, 28 + bob],
            ['Q', 17, 26 + bob, 25, 46 + bob],
            ['L', 21, 63 + bob], ['Q', 2, 67 + bob, -24, 51 + bob], ['Z'],
        ], C.sage, C.ink, 2.5);
        line(g, s, d, [[-19, 53 + bob], [14, 40 + bob]], C.cream, 2);
        dot(g, s, d, 4, 47 + bob, 2.2, C.wood);
    } else if (isRegular) {
        // Short checked waistcoat, open over the rounded breast.
        shape(g, s, d, [
            ['M', -22, 61 + bob], ['Q', -22, 45 + bob, -14, 34 + bob],
            ['L', -3, 31 + bob], ['L', 5, 52 + bob],
            ['L', 23, 35 + bob], ['Q', 28, 47 + bob, 23, 61 + bob],
            ['Q', 6, 55 + bob, -22, 61 + bob], ['Z'],
        ], C.slate, C.ink, 2.4);
        line(g, s, d, [[-8, 46 + bob], [7, 43 + bob]], C.cream, 1.7);
        dot(g, s, d, 7, 47 + bob, 1.9, C.wood);
    } else if (isFlower) {
        // Flared red coat creates a different lower silhouette from the shopper.
        shape(g, s, d, [
            ['M', -19, 61 + bob], ['Q', -22, 42 + bob, -31, 27 + bob],
            ['Q', 0, 19 + bob, 30, 28 + bob],
            ['Q', 22, 43 + bob, 23, 59 + bob],
            ['Q', 4, 66 + bob, -19, 61 + bob], ['Z'],
        ], C.terracotta, C.ink, 2.6);
        shape(g, s, d, [
            ['M', -4, 59 + bob], ['L', 4, 53 + bob],
            ['L', 15, 58 + bob], ['Q', 3, 36 + bob, -4, 59 + bob], ['Z'],
        ], C.cream, C.lightInk, 1.3);
    } else if (isChild) {
        // Long scarf tips bounce freely; the shorter planned actor height supplies age scale.
        shape(g, s, d, [
            ['M', -20, 66 + bob], ['Q', -2, 59 + bob, 20, 66 + bob],
            ['L', 24, 57 + bob], ['Q', -1, 49 + bob, -20, 58 + bob], ['Z'],
        ], C.terracotta, C.ink, 2.3);
        const scarfSwing = pose.moving ? Math.sin(stridePhase) * 5 : Math.sin(pose.time * 2) * 2;
        shape(g, s, d, [
            ['M', -15, 59 + bob], ['Q', -30, 53 + bob + scarfSwing, -38, 46 + bob + scarfSwing],
            ['L', -34, 39 + bob + scarfSwing],
            ['Q', -20, 42 + bob, -10, 56 + bob], ['Z'],
        ], C.terracotta, C.ink, 2);
    } else if (isWatcher) {
        shape(g, s, d, [
            ['M', -21, 59 + bob], ['Q', -8, 45 + bob, 17, 55 + bob],
            ['L', 23, 49 + bob], ['Q', 1, 36 + bob, -21, 50 + bob], ['Z'],
        ], C.slate, C.ink, 2.3);
        shape(g, s, d, [
            ['M', 17, 51 + bob], ['Q', 26, 53 + bob, 23, 43 + bob],
            ['Q', 19, 38 + bob, 14, 44 + bob], ['Z'],
        ], C.slate, C.ink, 1.5);
    }

    // Head is roughly 30% of full standing height, with a short beak and crest.
    shape(g, s, d, [
        ['M', -20, 80 + headBob], ['C', -23, 93 + headBob, -13, 106 + headBob, 4, 108 + headBob],
        ['C', 25, 111 + headBob, 37, 98 + headBob, 34, 83 + headBob],
        ['C', 31, 70 + headBob, 18, 66 + headBob, 4, 68 + headBob],
        ['C', -9, 68 + headBob, -17, 73 + headBob, -20, 80 + headBob], ['Z'],
    ], isSeller || isRegular ? C.honey : C.cream, C.ink, 3.3);
    shape(g, s, d, [
        ['M', -4, 106 + headBob], ['Q', -13, 117 + headBob, -6, 118 + headBob],
        ['Q', -2, 119 + headBob, 0, 114 + headBob],
        ['Q', 6, 120 + headBob, 10, 116 + headBob],
        ['Q', 13, 113 + headBob, 7, 107 + headBob], ['Z'],
    ], isSeller || isRegular ? C.honey : C.cream, C.ink, 2.7);
    // Headwear distinguishes each resident while keeping the shared chick anatomy.
    if (isVendor) {
        shape(g, s, d, [
            ['M', -23, 96 + headBob], ['Q', -10, 114 + headBob, 12, 108 + headBob],
            ['Q', 25, 106 + headBob, 30, 99 + headBob],
            ['Q', 5, 103 + headBob, -23, 96 + headBob], ['Z'],
        ], C.slate, C.ink, 2);
        shape(g, s, d, [
            ['M', -20, 96 + headBob], ['L', -33, 105 + headBob],
            ['L', -26, 91 + headBob], ['Z'],
        ], C.slate, C.ink, 1.5);
    } else if (isSeller) {
        shape(g, s, d, [
            ['M', -22, 97 + headBob], ['Q', -17, 114 + headBob, 4, 116 + headBob],
            ['Q', 26, 116 + headBob, 31, 100 + headBob],
            ['Q', 5, 105 + headBob, -22, 97 + headBob], ['Z'],
        ], C.terracotta, C.ink, 2);
        shape(g, s, d, [
            ['M', 15, 100 + headBob], ['Q', 31, 103 + headBob, 37, 99 + headBob],
            ['Q', 35, 95 + headBob, 15, 96 + headBob], ['Z'],
        ], C.terracotta, C.ink, 1.7);
    } else if (isShopper) {
        line(g, s, d, [[-19, 99 + headBob], [-14, 107 + headBob], [5, 110 + headBob]], C.sage, 3);
    } else if (isRegular) {
        shape(g, s, d, [
            ['M', -24, 98 + headBob], ['Q', -22, 112 + headBob, -7, 116 + headBob],
            ['Q', 11, 121 + headBob, 28, 104 + headBob],
            ['Q', 18, 105 + headBob, -24, 98 + headBob], ['Z'],
        ], C.wood, C.ink, 2.2);
        shape(g, s, d, [
            ['M', 12, 100 + headBob], ['Q', 31, 101 + headBob, 39, 96 + headBob],
            ['Q', 37, 92 + headBob, 19, 94 + headBob], ['Z'],
        ], C.wood, C.ink, 1.8);
        line(g, s, d, [[-18, 102 + headBob], [18, 104 + headBob]], C.cream, 1.5);
    } else if (isFlower) {
        shape(g, s, d, [
            ['M', -23, 94 + headBob], ['Q', -23, 113 + headBob, -5, 116 + headBob],
            ['Q', 12, 118 + headBob, 29, 101 + headBob],
            ['Q', 7, 108 + headBob, -23, 94 + headBob], ['Z'],
        ], C.sage, C.ink, 2.1);
        shape(g, s, d, [
            ['M', -21, 98 + headBob], ['Q', -33, 95 + headBob, -38, 87 + headBob],
            ['L', -30, 86 + headBob], ['Q', -27, 92 + headBob, -17, 94 + headBob], ['Z'],
        ], C.sage, C.ink, 1.7);
        dot(g, s, d, -21, 96 + headBob, 3, C.terracotta);
    } else if (isChild) {
        // The uncovered tall tuft and scarf make a smaller head read as youthful.
        shape(g, s, d, [
            ['M', -5, 111 + headBob], ['Q', -1, 125 + headBob, 7, 124 + headBob],
            ['Q', 5, 115 + headBob, 11, 112 + headBob], ['Z'],
        ], C.cream, C.ink, 2.1);
    } else {
        shape(g, s, d, [
            ['M', -17, 101 + headBob], ['Q', 0, 113 + headBob, 22, 104 + headBob],
            ['L', 15, 108 + headBob], ['Q', -1, 116 + headBob, -17, 104 + headBob], ['Z'],
        ], C.slate, C.ink, 1.8);
    }

    const blink = pose.time % 4.7 > 4.57;
    if (blink) line(g, s, d, [[21, 88 + headBob], [27, 87 + headBob]], C.eye, 2.7);
    else {
        dot(g, s, d, 23, 88 + headBob, 3.5, C.eye);
        dot(g, s, d, 24, 89.5 + headBob, 0.9, C.pale);
    }
    dot(g, s, d, 27, 79 + headBob, 4, C.cheek);
    shape(g, s, d, [
        ['M', 31, 83 + headBob], ['Q', 44, 81 + headBob, 46, 76 + headBob],
        ['Q', 42, 71 + headBob, 31, 73 + headBob], ['Z'],
    ], C.orangeLight, C.ink, 2.5);
    line(g, s, d, [[35, 77 + headBob], [44, 76 + headBob]], C.lightInk, 1.1);

    // Wings are feathered shapes with role-specific work and social gestures.
    const elbowX = wingLift > 2 ? 3 : -6;
    const elbowY = 58 + bob + wingLift * 0.55;
    const tipX = wingLift > 2 ? 43 : 10;
    const tipY = 49 + bob + wingLift;
    shape(g, s, d, [
        ['M', -13, 66 + bob],
        ['Q', elbowX, 69 + bob + wingLift * 0.6, tipX, tipY],
        ['Q', tipX + 3, tipY - 5, tipX - 4, tipY - 5],
        ['Q', tipX + 1, tipY - 10, tipX - 8, tipY - 9],
        ['Q', tipX - 1, tipY - 15, tipX - 11, tipY - 12],
        ['Q', -10, 45 + bob, -24, 52 + bob],
        ['Q', -28, 61 + bob, -13, 66 + bob], ['Z'],
    ], isSeller ? C.russet : C.honey, C.ink, 3);
    line(g, s, d, [[-14, 57 + bob], [elbowX, elbowY], [tipX - 10, tipY - 8]], C.lightInk, 1.2);

    if (isVendor && (exchange || arranging)) {
        // One clear cup transfer: reach, hold, return to arranging cups.
        const cupX = exchange ? 46 : 23;
        const cupY = exchange ? 61 + bob : 49 + bob;
        shape(g, s, d, [
            ['M', cupX - 6, cupY + 3], ['L', cupX + 6, cupY + 3],
            ['L', cupX + 4, cupY - 7], ['Q', cupX, cupY - 10, cupX - 4, cupY - 7], ['Z'],
        ], C.pale, C.ink, 1.8);
        line(g, s, d, [[cupX - 4, cupY], [cupX + 4, cupY]], C.terracotta, 1.3);
    } else if (isSeller && tending) {
        const sweep = Math.sin(pose.time * 5) * 4;
        line(g, s, d, [[30, 51 + bob], [49 + sweep, 43 + bob]], C.wood, 3);
        shape(g, s, d, [
            ['M', 44 + sweep, 43 + bob], ['Q', 54 + sweep, 43 + bob, 58 + sweep, 39 + bob],
            ['Q', 55 + sweep, 36 + bob, 45 + sweep, 38 + bob], ['Z'],
        ], C.wood, C.ink, 1.3);
    } else if (isRegular) {
        // The cup follows the raised wing to the beak, then rests at the waist.
        const cupX = sipping ? 44 : pose.moving ? 19 : 24;
        const cupY = sipping ? 77 + headBob : 50 + bob;
        shape(g, s, d, [
            ['M', cupX - 7, cupY + 3], ['L', cupX + 7, cupY + 3],
            ['L', cupX + 5, cupY - 7], ['Q', cupX, cupY - 10, cupX - 5, cupY - 7], ['Z'],
        ], C.pale, C.ink, 1.8);
        line(g, s, d, [[cupX - 5, cupY - 1], [cupX + 5, cupY - 1]], C.terracotta, 1.2);
        if (sipping) line(g, s, d, [[cupX - 1, cupY + 7], [cupX + 1, cupY + 11]], C.lightInk, 1.1);
    } else if (isFlower) {
        // The basket is carried by the wing. It swings with walking, and a bloom
        // is lifted for inspection only during a waypoint pause.
        const swing = pose.moving ? Math.sin(stridePhase) * 2.5 : 0;
        const basketY = 34 + bob + swing;
        shape(g, s, d, [
            ['M', 27, basketY + 8], ['Q', 40, basketY + 13, 53, basketY + 8],
            ['L', 49, basketY - 9], ['Q', 40, basketY - 13, 31, basketY - 9], ['Z'],
        ], C.wood, C.ink, 2.4);
        line(g, s, d, [[30, basketY + 1], [50, basketY + 1]], C.cream, 1.3);
        line(g, s, d, [[34, basketY - 7], [34, basketY + 7]], C.lightInk, 1.1);
        line(g, s, d, [[43, basketY - 9], [43, basketY + 8]], C.lightInk, 1.1);
        g.strokeColor = C.ink;
        g.lineWidth = 2.2 * s;
        g.moveTo(30 * s * d, (basketY + 7) * s);
        g.quadraticCurveTo(36 * s * d, (basketY + 31) * s, 43 * s * d, (basketY + 28) * s);
        g.quadraticCurveTo(49 * s * d, (basketY + 27) * s, 52 * s * d, (basketY + 7) * s);
        g.stroke();
        const bloomX = inspectingFlower ? 43 : 42;
        const bloomY = inspectingFlower ? 74 + headBob : 60 + bob + swing;
        line(g, s, d, [[bloomX, basketY + 8], [bloomX, bloomY - 4]], C.sage, 2);
        dot(g, s, d, bloomX - 4, bloomY + 1, 3.3, C.terracotta);
        dot(g, s, d, bloomX + 4, bloomY + 1, 3.3, C.terracotta);
        dot(g, s, d, bloomX, bloomY + 5, 3.3, C.terracotta);
        dot(g, s, d, bloomX, bloomY, 2.1, C.honey);
    }
}
