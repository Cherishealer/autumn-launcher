import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginLaunch, latestLog, transition } from '../shared/launch-state';

test('startup displays each latest nonempty log, then freezes after running', () => {
  let state = beginLaunch('first', 'launch.log');
  state = latestLog(state, 'first', 'Checking Java...');
  assert.equal(state.message, 'Checking Java...');
  state = latestLog(state, 'first', 'Loading libraries...');
  assert.equal(state.message, 'Loading libraries...');
  state = latestLog(state, 'first', ' \r\n');
  assert.equal(state.message, 'Loading libraries...');
  state = transition(state, 'first', 'running');
  assert.equal(latestLog(state, 'first', 'Game chat and later output'), state);
  assert.equal(state.message, 'Instance is Running.');
});
test('failed status stays fixed even when stdout or a ready event arrives late', () => {
  let state = transition(beginLaunch('a', 'log'), 'a', 'failed', 'Java missing');
  assert.equal(state.message, 'Launch Failed.');
  assert.equal(latestLog(state, 'a', 'Late output'), state);
  assert.equal(transition(state, 'a', 'running'), state);
  assert.equal(state.error, 'Java missing');
});
test('late log and lifecycle events from previous attempts are ignored', () => {
  const state = beginLaunch('new', 'new.log');
  assert.equal(latestLog(state, 'old', 'Late failure'), state);
  assert.equal(transition(state, 'old', 'failed'), state);
});
test('normal exit restores ready; abnormal exit shows failure', () => {
  const running = transition(beginLaunch('a', 'log'), 'a', 'running');
  assert.equal(transition(running, 'a', 'ready').message, 'Ready to launch.');
  assert.equal(transition(running, 'a', 'failed', 'Exit code 1').message, 'Launch Failed.');
});
