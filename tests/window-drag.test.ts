import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { WindowDrag } from '../electron/window-drag';

test('window dragging tracks OS DIP deltas and stops on release or loss of focus', async () => {
  let focused = true;
  let point = { x: 1500, y: 900 };
  const moves: number[][] = [];
  const window = { getPosition: () => [640, 336], setPosition: (x: number, y: number) => { moves.push([x, y]); }, focus: () => { focused = true; }, isDestroyed: () => false, isFocused: () => focused, isMaximized: () => false, isMinimized: () => false };
  const drag = new WindowDrag(window, () => point);
  try {
    drag.start(); point = { x: 1600, y: 950 }; await wait(40);
    assert.deepEqual(moves.at(-1), [740, 386]);
    drag.stop(); const count = moves.length; point = { x: -200, y: 20 }; await wait(25);
    assert.equal(moves.length, count);
    drag.start(); focused = false; await wait(25); assert.equal(moves.length, count);
  } finally { drag.stop(); }
});

test('quick pointer release applies the final position even before the first timer tick', () => {
  const moves: number[][] = [];
  const window = { getPosition: () => [640, 336], setPosition: (x: number, y: number) => { moves.push([x, y]); }, focus: () => {}, isDestroyed: () => false, isFocused: () => true, isMaximized: () => false, isMinimized: () => false };
  const drag = new WindowDrag(window, () => ({ x: 1240, y: 676 }));
  try {
    drag.start({ x: 1140, y: 636 }); drag.stop(true);
    assert.deepEqual(moves, [[740, 376]]);
  } finally { drag.stop(); }
});
