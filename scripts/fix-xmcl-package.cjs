// @xmcl/unzip 2.2.0 ships dist/ but accidentally publishes its workspace entry.
// Keep the upstream implementation intact; correct only that known metadata bug.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../node_modules/@xmcl/unzip/package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
if (pkg.version === '2.2.0' && pkg.main === './index.ts') {
  if (!fs.existsSync(path.join(path.dirname(file), 'dist/index.js'))) throw new Error('XMCL unzip distribution is missing');
  pkg.main = './dist/index.js'; pkg.module = './dist/index.mjs'; pkg.types = './dist/index.d.ts';
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log('Corrected @xmcl/unzip 2.2.0 published entry point.');
}
// installer 6.3.6 imports this unshipped subpath. The exact upstream helper
// (verified in core's published source map) only removes undefined values.
const core = path.join(__dirname, '../node_modules/@xmcl/core');
const corePkg = JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8'));
if (corePkg.version === '2.16.2' && !fs.existsSync(path.join(core, 'utils.js'))) {
  fs.writeFileSync(path.join(core, 'utils.js'), "// XMCL MIT licensed compatibility export.\nexports.isNotNull = (value) => value !== undefined;\n");
  console.log('Restored missing @xmcl/core/utils compatibility export.');
}
