require('../dist-electron/electron/stdio');
const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Store } = require('../dist-electron/electron/storage');
const { resolveVersion, classify, scanVersions } = require('../dist-electron/electron/versions');

app.whenReady().then(async () => {
  const parent = process.argv[2];
  if (!parent || !path.isAbsolute(parent)) throw new Error('Supply an absolute scratch directory');
  await fs.mkdir(parent, { recursive: true });
  const dir = await fs.mkdtemp(path.join(parent, 'backend-check-'));
  const first = new Store(path.join(dir, 'config')); await first.init();
  first.config.settings.minMemory = 2048; first.config.settings.maxMemory = 4096;
  const id = randomUUID();
  first.config.instances.push({ id, name: 'Persistence check', versionKey: 'test', gameDir: path.join(dir, 'instance') });
  first.config.selectedId = id; await first.save();
  const second = new Store(path.join(dir, 'config')); await second.init();
  assert.equal(second.config.settings.minMemory, 2048);
  assert.equal(second.config.selectedId, id);
  assert.equal(second.config.instances[0].name, 'Persistence check');
  await second.writeSecret('proxy', 'synthetic-test-credential');
  assert.equal(await second.readSecret('proxy'), 'synthetic-test-credential');
  assert.equal((await fs.readFile(path.join(second.dir, 'proxy.bin'))).includes(Buffer.from('synthetic-test-credential')), false);
  // Verify that existing v0.1.0 encrypted files still decrypt after the async API migration.
  await fs.writeFile(path.join(second.dir, 'proxy.bin'), safeStorage.encryptString('synthetic-legacy-credential'));
  assert.equal(await second.readSecret('proxy'), 'synthetic-legacy-credential');
    const root = path.join(dir, 'minecraft');
  async function metadata(id, json) { await fs.mkdir(path.join(root, 'versions', id), { recursive: true }); await fs.writeFile(path.join(root, 'versions', id, id + '.json'), JSON.stringify({ id, ...json })); }
  await metadata('1.21.1', { mainClass: 'net.minecraft.client.main.Main', type: 'release', time: '2024-08-08T00:00:00Z', releaseTime: '2024-08-08T00:00:00Z', arguments: { game: [], jvm: [] }, javaVersion: { component: 'java-runtime-delta', majorVersion: 21 }, downloads: { client: { url: 'https://example.invalid/client.jar', sha1: '0'.repeat(40), size: 100 } }, assets: '17', assetIndex: { id: '17', sha1: '0'.repeat(40), size: 100, url: 'https://example.invalid/17.json' }, libraries: [] });
  await metadata('fabric-check', { inheritsFrom: '1.21.1', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient', libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.5' }] });
  await metadata('neoforge-check', { inheritsFrom: '1.21.1', mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher', libraries: [{ name: 'net.neoforged:neoforge:21.1.100' }] });
  assert.equal(classify(await resolveVersion(root, '1.21.1')).loader, 'Vanilla');
  assert.equal(classify(await resolveVersion(root, 'fabric-check')).loader, 'Fabric');
  assert.equal(classify(await resolveVersion(root, 'neoforge-check')).loader, 'NeoForge');
  await metadata('cycle-a', { inheritsFrom: 'cycle-b' }); await metadata('cycle-b', { inheritsFrom: 'cycle-a' });
  await assert.rejects(resolveVersion(root, 'cycle-a'), /继承循环/);
  await metadata('escape', { inheritsFrom: '../../outside' }); await assert.rejects(resolveVersion(root, 'escape'), /非法路径/);
  const scanned = await scanVersions([root]); assert.equal(scanned.versions.some(v => v.runnable), false);
  assert.ok(scanned.versions.find(v => v.id === '1.21.1').issues.some(i => i.includes('主程序')));
        await fs.writeFile(path.join(parent, 'backend-check-result.json'), JSON.stringify({ passed: true, checks: ['configuration and instance persistence', 'Windows encrypted credential round trip', 'Vanilla/Fabric/NeoForge inherited metadata', 'inheritance cycle and traversal rejection', 'incomplete versions never runnable'], fixtureDirectory: dir, gameLaunchTested: false }, null, 2));
  app.quit();
}).catch(async error => { if (process.argv[2]) await fs.writeFile(path.join(process.argv[2], 'backend-check-result.json'), JSON.stringify({ passed: false, error: error.stack }, null, 2)); app.exit(1); });
