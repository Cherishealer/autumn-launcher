import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WindowDragGesture } from '../src/window-drag-gesture';
import type { Api } from '../shared/types';

test('rapid clicks and sub-threshold pointer jitter never send native drag requests', () => {
  const calls: unknown[] = [];
  const gesture = new WindowDragGesture(async (...args) => { calls.push(args); });
  for (let index = 0; index < 1000; index++) {
    gesture.press(index, 330.5, 210.25);
    gesture.move(index, 332.25, 208.75);
    gesture.release(index);
    gesture.move(index, 500, 500);
  }
  assert.deepEqual(calls, []);
});

test('intentional movement starts one drag with the original press location', () => {
  const calls: unknown[] = [];
  const gesture = new WindowDragGesture(async (...args) => { calls.push(args); });
  gesture.press(1, 300, 200);
  gesture.move(2, 1000, 1000); gesture.move(1, 303, 204);
  assert.deepEqual(calls, []);
  gesture.move(1, 306, 200); gesture.move(1, 800, 500);
  gesture.release(2);
  assert.deepEqual(calls, [['drag-start', { x: 300, y: 200 }]]);
  gesture.release(1); gesture.release(1);
  assert.deepEqual(calls, [['drag-start', { x: 300, y: 200 }], ['drag-stop']]);
});

test('cancelling a press does nothing and replacing an active drag stops it first', () => {
  const calls: unknown[] = [];
  const gesture = new WindowDragGesture(async (...args) => { calls.push(args); });
  gesture.press(1, 100, 100); gesture.release();
  gesture.press(2, 100, 100); gesture.move(2, 110, 100);
  gesture.press(3, 200, 200); gesture.release();
  assert.deepEqual(calls, [['drag-start', { x: 100, y: 100 }], ['drag-stop']]);
});

test('a late failed start cannot cancel a newer pointer gesture', async () => {
  const calls: unknown[] = [];
  const failures: Array<(error: Error) => void> = [];
  const send: Api['window'] = (...args) => {
    calls.push(args);
    return args[0] === 'drag-start' ? new Promise((_resolve, reject) => failures.push(reject)) : Promise.resolve();
  };
  const gesture = new WindowDragGesture(send);
  gesture.press(1, 100, 100); gesture.move(1, 120, 100); gesture.release();
  gesture.press(2, 200, 200); gesture.move(2, 220, 200);
  failures[0](new Error('Stale request')); await Promise.resolve();
  gesture.release();
  assert.equal(calls.filter(args => (args as unknown[])[0] === 'drag-stop').length, 2);
  failures[1](new Error('Current request')); await Promise.resolve();
});
