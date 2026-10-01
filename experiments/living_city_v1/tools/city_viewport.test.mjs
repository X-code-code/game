import assert from 'node:assert/strict';
import test from 'node:test';
import { CityViewport } from '../assets/scripts/map/CityViewport.ts';

test('bottom-edge search objects can pan above a tray without exposing an uncovered edge', () => {
    const view = new CityViewport(1536, 2048, 444, 960, 1, 2.25);
    view.zoomAt(1.4, 0, 0);
    view.setBottomInset(142);
    view.focusAt(-430, -835);
    const state = view.value;
    const screenY = 480 - (-835 * state.scale + state.y);
    assert.ok(screenY < 960 - 142 - 30, `Parcel chest remains under tray: ${screenY}`);
    view.panBy(0, 100000);
    const bottomEdge = -1024 * view.value.scale + view.value.y;
    assert.ok(Math.abs(bottomEdge - (-480 + 142)) < .001);
    view.setBottomInset(0);
    assert.ok(-1024 * view.value.scale + view.value.y <= -480);
});

test('map covers portrait and landscape viewports', () => {
    for (const [width, height] of [[960, 640], [360, 780], [1280, 720]]) {
        const view = new CityViewport(2400, 1600, width, height);
        const state = view.value;
        assert.ok(2400 * state.scale >= width);
        assert.ok(1600 * state.scale >= height);
    }
});

test('hint focus centers a live target, preserves zoom and clamps targets at map edges', () => {
    const view = new CityViewport(2400, 1600, 960, 640, 1, 3);
    view.zoomAt(2,0,0);
    const scale=view.value.scale;
    view.focusAt(100,-80);
    assert.equal(view.value.scale,scale);
    assert.equal(view.value.x+100*scale,0);
    assert.equal(view.value.y-80*scale,0);
    view.focusAt(1200,800);
    assert.deepEqual(view.value,{scale,x:-480,y:-320});
    const before=view.value;view.focusAt(NaN,0);assert.deepEqual(view.value,before);
});

test('panning stops at the map edges and zoom stays in range', () => {
    const view = new CityViewport(2400, 1600, 960, 640, 1, 3);
    view.zoomAt(2, 0, 0);
    view.panBy(100000, -100000);
    assert.deepEqual(view.value, { scale: 0.8, x: 480, y: -320 });
    view.zoomAt(100, 0, 0);
    assert.ok(Math.abs(view.value.scale - 1.2) < 1e-9);
    view.zoomAt(0.0001, 0, 0);
    assert.ok(Math.abs(view.value.scale - 0.4) < 1e-9);
    assert.equal(view.value.x, 0);
    assert.equal(view.value.y, 0);
});

test('wheel zoom keeps the pointed map location under the pointer', () => {
    const view = new CityViewport(2400, 1600, 960, 640, 1, 3);
    view.zoomAt(1.5, 0, 0);
    view.panBy(70, -30);
    const before = view.value;
    const mapX = (120 - before.x) / before.scale;
    const mapY = (80 - before.y) / before.scale;
    view.zoomAt(1.2, 120, 80);
    const after = view.value;
    assert.ok(Math.abs((120 - after.x) / after.scale - mapX) < 1e-9);
    assert.ok(Math.abs((80 - after.y) / after.scale - mapY) < 1e-9);
});

test('pinch moves its midpoint and resize preserves relative zoom', () => {
    const view = new CityViewport(2400, 1600, 960, 640, 1, 3);
    view.zoomAt(1.5, 0, 0);
    const before = view.value;
    view.zoomBetween(1.2, 40, 0, 60, 10);
    const afterPinch = view.value;
    assert.ok(Math.abs((40 - before.x) / before.scale - (60 - afterPinch.x) / afterPinch.scale) < 1e-9);
    const relativeZoom = afterPinch.scale / 0.4;
    view.resize(360, 780);
    const afterResize = view.value;
    const newFit = Math.max(360 / 2400, 780 / 1600);
    assert.ok(Math.abs(afterResize.scale / newFit - relativeZoom) < 1e-9);
    assert.ok(2400 * afterResize.scale >= 360);
    assert.ok(1600 * afterResize.scale >= 780);
});
