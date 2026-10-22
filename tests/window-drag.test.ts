import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { WindowDrag } from '../electron/window-drag';

function fixture() {
  let focused = true;
  let point = { x: 1500, y: 900 };
  let bounds = { x: 640, y: 336, width: 1280, height: 720 };
  const moves: typeof bounds[] = [];
  const window = { getBounds: () => ({ ...bounds }), setBounds: (next: typeof bounds) => { moves.push({ ...next }); bounds = { ...next }; }, focus: () => { focused = true; }, isDestroyed: () => false, isFocused: () => focused, isMaximized: () => false, isMinimized: () => false };
  return { window, moves, bounds: () => bounds, point: (next: typeof point) => { point = next; }, blur: () => { focused = false; }, drag: new WindowDrag(window, () => point) };
}

test('window dragging tracks OS DIP deltas and stops on release or loss of focus', async () => {
  const { drag, point, moves, blur } = fixture();
  try {
    drag.start(); point({ x: 1600, y: 950 }); await wait(50);
    assert.deepEqual(moves.at(-1), { x: 740, y: 386, width: 1280, height: 720 });
    drag.stop(); const count = moves.length; point({ x: -200, y: 20 }); await wait(30);
    assert.equal(moves.length, count);
    drag.start(); blur(); await wait(30); drag.stop(true); assert.equal(moves.length, count);
  } finally { drag.stop(); }
});

test('quick pointer release applies the final position before the first timer tick', () => {
  const { drag, point, moves } = fixture(); point({ x: 1240, y: 676 });
  try {
    drag.start({ x: 1140, y: 636 }); drag.stop(true);
    assert.deepEqual(moves, [{ x: 740, y: 376, width: 1280, height: 720 }]);
  } finally { drag.stop(); }
});

test('holding a stationary pointer never calls the native window mutator', async () => {
  const { drag, moves, bounds } = fixture();
  try {
    drag.start(); await wait(200); drag.stop(true);
    assert.equal(moves.length, 0);
    for (let index = 0; index < 500; index++) { drag.start(); drag.stop(true); }
    assert.equal(moves.length, 0);
    assert.deepEqual(bounds(), { x: 640, y: 336, width: 1280, height: 720 });
  } finally { drag.stop(); }
});

test('repeated drags preserve both dimensions and skip repeated coordinates', async () => {
  const { drag, point, moves, bounds } = fixture();
  try {
    drag.start(); point({ x: 1600, y: 950 }); await wait(100);
    assert.equal(moves.length, 1); drag.stop(true); assert.equal(moves.length, 1);
    for (let index = 0; index < 100; index++) {
      drag.start(); point({ x: 1600 + (index + 1) * 8, y: 950 + (index + 1) * 8 }); drag.stop(true);
    }
    assert.equal(bounds().width, 1280); assert.equal(bounds().height, 720);
    assert.ok(moves.every(move => move.width === 1280 && move.height === 720));
    assert.equal(moves.length, 101);
  } finally { drag.stop(); }
});

test('rapid releases ignore fractional-DPI origin noise without moving or resizing', () => {
  const { drag, moves, bounds } = fixture();
  try {
    for (let index = 0; index < 1000; index++) {
      drag.start({ x: 1499.25 + (index % 3) / 2, y: 899.25 + (index % 3) / 2 });
      drag.stop(true);
    }
    assert.equal(moves.length, 0);
    assert.deepEqual(bounds(), { x: 640, y: 336, width: 1280, height: 720 });
  } finally { drag.stop(); }
});

test('after a real drag starts, small movements remain responsive', async () => {
  const { drag, point, moves } = fixture();
  try {
    drag.start(); point({ x: 1510, y: 900 }); await wait(50);
    point({ x: 1511, y: 900 }); await wait(50); drag.stop(true);
    assert.equal(moves.at(-1)?.x, 651);
    assert.equal(moves.at(-1)?.width, 1280);
    assert.equal(moves.length, 2);
  } finally { drag.stop(); }
});
