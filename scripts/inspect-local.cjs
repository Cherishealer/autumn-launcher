// Read-only local diagnostics. No game process is launched and no account data is read.
const fs = require('node:fs/promises');
const path = require('node:path');
const { scanVersions, resolveVersion, diagnoseVersion } = require('../dist-electron/electron/versions');
const { detectJava } = require('../dist-electron/electron/java');
(async () => {
  const root = process.argv[2] || path.join(process.env.APPDATA, '.minecraft');
  const result = await scanVersions([root]);
  for (const version of result.versions) {
    const { id, loader, loaderVersion, javaMajor, runnable, issues } = version;
    console.log(JSON.stringify({ id, loader, loaderVersion, javaMajor, runnable, issues }));
  }
  console.log(JSON.stringify({ errors: result.errors }));
  for (const id of ['1.21.1', 'fabric-loader-0.16.5-1.21.1']) {
    const found = result.versions.find(v => v.id === id);
    if (found) {
      const issue = await diagnoseVersion(await resolveVersion(root, id), true);
      console.log(JSON.stringify({ strictValidation: id, issues: issue ? { jar: issue.jar, libraries: issue.libraries?.length, assets: issue.assets?.length, assetsIndex: !!issue.assetsIndex, profile: !!issue.profile } : null }));
    }
  }
  console.log(JSON.stringify({ java: await detectJava([root]) }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
