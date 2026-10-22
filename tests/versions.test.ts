import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { scanVersions, resolveVersion, diagnoseVersion, repairFiles, useHashedAssetIndex, classify } from '../electron/versions';
import type { ResolvedVersion } from '@xmcl/core';

const hash = (data: string) => createHash('sha1').update(data).digest('hex');
async function fixture(id = '1.20.1', withClient = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'autumn-versions-'));
  const jar = 'synthetic-client-jar'; const index = JSON.stringify({ objects: {} });
  await mkdir(path.join(root, 'versions', id), { recursive: true });
  await mkdir(path.join(root, 'assets', 'indexes'), { recursive: true });
  const metadata = { id, mainClass: 'net.minecraft.client.main.Main', type: id.startsWith('1.') ? 'release' : 'snapshot', time: '2024-08-08T00:00:00Z', releaseTime: '2024-08-08T00:00:00Z', arguments: { game: [], jvm: [] }, javaVersion: { component: 'test-runtime', majorVersion: 21 }, downloads: { client: { url: 'https://piston-data.mojang.com/v1/objects/' + hash(jar) + '/client.jar', sha1: hash(jar), size: Buffer.byteLength(jar) } }, assets: 'shared', assetIndex: { id: 'shared', sha1: hash(index), size: Buffer.byteLength(index), url: 'https://piston-meta.mojang.com/v1/packages/' + hash(index) + '/shared.json' }, libraries: [] };
  await writeFile(path.join(root, 'versions', id, id + '.json'), JSON.stringify(metadata));
  if (withClient) await writeFile(path.join(root, 'versions', id, id + '.jar'), jar);
  await writeFile(path.join(root, 'assets', 'indexes', 'shared.json'), index);
  return { root, id, jar, index };
}
async function cleanup(root: string) {
  assert.equal(path.dirname(root), os.tmpdir());
  await rm(root, { recursive: true, force: true });
}

test('an installed modern snapshot is accepted from its metadata instead of a release-name allowlist', async () => {
  const f = await fixture('25w07a');
  try {
    const scanned = await scanVersions([f.root]);
    assert.equal(scanned.versions[0].runnable, true); assert.equal(scanned.versions[0].loader, 'Vanilla');
  } finally { await cleanup(f.root); }
});

test('missing client files are repairable from verified existing metadata, but existing corrupt files remain blocked', async () => {
  const f = await fixture('1.21.1', false);
  try {
    let scanned = await scanVersions([f.root]);
    assert.equal(scanned.versions[0].runnable, false); assert.equal(scanned.versions[0].repairable, true);
    const version = await resolveVersion(f.root, f.id); const issue = await diagnoseVersion(version, true);
    const files = repairFiles(version, issue!);
    assert.ok(files.some(file => file.path === path.join(f.root, 'versions', f.id, f.id + '.jar') && file.checksum?.value === hash(f.jar)));
    await writeFile(path.join(f.root, 'versions', f.id, f.id + '.jar'), 'corrupt-existing-client');
    scanned = await scanVersions([f.root]);
    assert.equal(scanned.versions[0].repairable, false);
    assert.equal(await readFile(path.join(f.root, 'versions', f.id, f.id + '.jar'), 'utf8'), 'corrupt-existing-client');
  } finally { await cleanup(f.root); }
});

test('a reused asset-index ID is repaired under its expected hash without overwriting another version index', async () => {
  const f = await fixture(); const olderIndex = JSON.stringify({ objects: {}, oldIndexMarker: true });
  try {
    const conventional = path.join(f.root, 'assets', 'indexes', 'shared.json');
    await writeFile(conventional, olderIndex);
    const scanned = await scanVersions([f.root]); assert.equal(scanned.versions[0].repairable, true);
    const version = await resolveVersion(f.root, f.id); const issue = await diagnoseVersion(version, true);
    assert.equal(await useHashedAssetIndex(version), true);
    const files = repairFiles(version, issue!);
    assert.equal(files.length, 1); assert.equal(files[0].path, path.join(f.root, 'assets', 'indexes', hash(f.index) + '.json'));
    await writeFile(files[0].path, f.index);
    assert.equal(await diagnoseVersion(version, true), undefined);
    assert.equal(await readFile(conventional, 'utf8'), olderIndex);
  } finally { await cleanup(f.root); }
});

test('standard index names remain valid when their checksum matches, and installed Forge is classified separately', async () => {
  const f = await fixture();
  try {
    const version = await resolveVersion(f.root, f.id);
    assert.equal(await useHashedAssetIndex(version), false);
    assert.equal(await diagnoseVersion(version, true), undefined);
    const forge = { ...version, mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher', libraries: [{ name: 'net.minecraftforge:fmlloader:1.20.1-47.3.0', version: '1.20.1-47.3.0' }] } as ResolvedVersion;
    assert.equal(classify(forge).loader, 'Forge');
  } finally { await cleanup(f.root); }
});

test('asset-index hash paths cannot escape the configured game root', async () => {
  const f = await fixture();
  try {
    const target = path.join(f.root, 'versions', f.id, f.id + '.json');
    const metadata = JSON.parse(await readFile(target, 'utf8'));
    metadata.assetIndex.sha1 = '../../outside';
    await writeFile(target, JSON.stringify(metadata));
    await assert.rejects(resolveVersion(f.root, f.id), /资源索引哈希无效/);
  } finally { await cleanup(f.root); }
});
