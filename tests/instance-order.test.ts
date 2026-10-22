import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { orderInstances } from '../electron/instance-order';
import { Store } from '../electron/storage';
import type { Instance } from '../shared/types';

const instances: Instance[] = [1, 2, 3].map(index => ({ id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'), name: 'Instance ' + index, versionKey: 'installed-version', gameDir: path.resolve('node_modules', 'fixture-' + index) }));

test('instance ordering preserves each record and does not mutate the original list', () => {
  const ids = [instances[2].id, instances[0].id, instances[1].id];
  const result = orderInstances(instances, ids);
  assert.deepEqual(result.map(instance => instance.id), ids);
  assert.equal(result[0], instances[2]); assert.equal(instances[0].name, 'Instance 1');
});

test('instance ordering rejects duplicates, missing, stale and malformed IDs', () => {
  for (const invalid of [[instances[0].id, instances[0].id, instances[2].id], [instances[0].id], [...instances.map(instance => instance.id), '00000000-0000-4000-8000-000000000004'], [instances[0].id, instances[1].id, '00000000-0000-4000-8000-000000000004'], ['../config.json'], null]) {
    assert.throws(() => orderInstances(instances, invalid));
  }
  assert.deepEqual(orderInstances([], []), []);
});

test('a saved order survives reopening without changing selection or instance paths', async () => {
  const scratch = path.resolve('node_modules'); const temp = await mkdtemp(path.join(scratch, 'autumn-order-'));
  try {
    const store = new Store(temp, 'en-US'); await store.init(); store.config.instances = [...instances]; store.config.selectedId = instances[1].id;
    const ids = [instances[2].id, instances[1].id, instances[0].id];
    store.config.instances = orderInstances(store.config.instances, ids); await store.save();
    const reopened = new Store(temp, 'en-US'); await reopened.init();
    assert.deepEqual(reopened.config.instances.map(instance => instance.id), ids);
    assert.equal(reopened.config.selectedId, instances[1].id);
    assert.equal(reopened.config.instances[2].gameDir, instances[0].gameDir);
  } finally { assert.equal(path.dirname(temp), scratch); await rm(temp, { recursive: true, force: true }); }
});
