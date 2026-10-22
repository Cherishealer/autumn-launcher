// Render the existing grass SVG with Chromium and package PNG frames as a Windows ICO.
const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const root = path.resolve(__dirname, '..');
let window;
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
async function fail(error) {
  await fs.writeFile(path.join(root, 'icon-generation-error.log'), String(error.stack || error)).catch(() => {});
  if (app) app.exit(1); else process.exit(1);
}
if (!app) throw new Error('Run this script with Electron, not plain Node.js.');
app.disableHardwareAcceleration();
const deadline = setTimeout(() => fail(new Error('Icon rendering timed out.')), 30000);
deadline.unref();
app.whenReady().then(async () => {
  const svg = await fs.readFile(path.join(root, 'public/assets/grass.svg'), 'utf8');
  window = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true } });
  const html = '<html><head><style>html,body{margin:0;width:256px;height:256px;background:transparent;overflow:hidden}img{display:block;width:256px;height:256px}</style></head><body><img src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '"></body></html>';
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const image = await window.webContents.capturePage();
  if (image.isEmpty()) throw new Error('SVG rendering produced an empty image.');
  const frames = [16, 24, 32, 48, 64, 128, 256].map(size => ({ size, png: image.resize({ width: size, height: size, quality: 'best' }).toPNG() }));
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const at = 6 + index * 16;
    header[at] = frame.size === 256 ? 0 : frame.size;
    header[at + 1] = frame.size === 256 ? 0 : frame.size;
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(frame.png.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += frame.png.length;
  });
  await fs.writeFile(path.join(root, 'public/assets/app-icon.png'), image.toPNG());
  await fs.writeFile(path.join(root, 'public/assets/app-icon.ico'), Buffer.concat([header, ...frames.map(frame => frame.png)]));
  window.destroy(); app.exit(0);
}).catch(fail);
