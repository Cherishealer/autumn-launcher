import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { guardOutput } from '../electron/stdio';
test('a detached console cannot throw an uncaught EPIPE error', async () => {
  const broken = new Writable({ write(_chunk, _encoding, callback) { callback(Object.assign(new Error('broken pipe'), { code: 'EPIPE' })); } });
  guardOutput(broken);
  const closed = new Promise<void>(resolve => broken.on('close', resolve));
  assert.doesNotThrow(() => broken.write('Electron warning after parent terminal closed'));
  await closed;
  assert.equal(broken.destroyed, true);
});
