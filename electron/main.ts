import './stdio';
import { translate } from '../shared/i18n';
import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, screen } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store } from './storage';
import { WindowDrag } from './window-drag';
import { orderInstances } from './instance-order';
import { Auth } from './auth';
import { Network } from './network';
import { Launcher } from './launcher';
import { scanVersions } from './versions';
import { detectJava } from './java';
import { idSchema, instanceSchema, settingsSchema, parseJvmArgs } from './validation';
import type { Api, InstalledVersion, Snapshot, DeviceCode } from '../shared/types';

const t = (text: string) => translate(text, store?.config?.settings.language || 'zh-CN');
let win: BrowserWindow;
let windowDrag: WindowDrag;
let store: Store;
let auth: Auth;
let network: Network;
let launcher: Launcher;
let versions: InstalledVersion[] = [];
let scanErrors: string[] = [];
let scanning: Promise<void> | undefined;
let notifyTimer: NodeJS.Timeout | undefined;
const development = process.env.AUTUMN_DEV_URL === 'http://127.0.0.1:5173';
const bootUrl = development ? 'http://127.0.0.1:5173' : undefined;

function snapshot(): Snapshot {
  return { ...store.config, versions, account: auth.account, states: launcher.states, scanErrors };
}
function notify() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => { notifyTimer = undefined; if (!win?.isDestroyed()) win.webContents.send('launcher:snapshot', snapshot()); }, 50);
}
async function scan() {
  if (!scanning) scanning = (async () => { const result = await scanVersions(store.config.settings.roots); versions = result.versions; scanErrors = result.errors; notify(); })().finally(() => { scanning = undefined; });
  await scanning;
}
function instance(id: string) { const found = store.config.instances.find(i => i.id === id); if (!found) throw new Error('实例不存在'); return found; }
async function openFolder(id: string) { const result = await shell.openPath(instance(id).gameDir); if (result) throw new Error(result); }
async function pick(kind: 'java' | 'directory') {
  const result = await dialog.showOpenDialog(win, kind === 'java'
    ? { title: t('选择 Java'), properties: ['openFile'], filters: [{ name: t('Java 可执行程序'), extensions: ['exe'] }] }
    : { title: t('选择目录'), properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? undefined : result.filePaths[0];
}
function registerIpc() {
  const methods: { [K in keyof Omit<Api, 'onSnapshot' | 'onDeviceCode'>]: (...args: any[]) => any } = {
    snapshot,
    scan: async () => { await scan(); return snapshot(); },
    addRoot: async () => {
      const root = await pick('directory');
      if (root && !store.config.settings.roots.some(r => r.toLowerCase() === root.toLowerCase())) { store.config.settings.roots.push(root); await store.save(); }
      await scan(); return snapshot();
    },
    select: async id => { instance(idSchema.parse(id)); store.config.selectedId = id; await store.save(); return snapshot(); },
    reorderInstances: async ids => {
      store.config.instances = orderInstances(store.config.instances, ids);
      await store.save(); notify(); return snapshot();
    },
    saveInstance: async input => {
      const data = instanceSchema.parse(input);
      if (data.id) {
        const current = instance(data.id); if (launcher.busy(current.id)) throw new Error('请在游戏退出后编辑此实例');
        if (data.versionKey !== current.versionKey || data.gameDir && data.gameDir !== current.gameDir) throw new Error('编辑实例不能移动目录或替换版本');
        Object.assign(current, { name: data.name, javaPath: data.javaPath, minMemory: data.minMemory, maxMemory: data.maxMemory });
      } else {
        const installed = versions.find(v => v.key === data.versionKey);
        if (!installed || (!installed.runnable && !installed.repairable)) throw new Error('请选择可运行或可补齐资源的已安装版本');
        const id = randomUUID(); const gameDir = data.gameDir || path.join(store.config.settings.instancesDir, id);
        const normalized = path.resolve(gameDir).toLowerCase();
        const overlaps = (a: string, b: string) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
        if (versions.some(v => overlaps(normalized, path.resolve(v.root).toLowerCase())) || store.config.instances.some(i => overlaps(normalized, path.resolve(i.gameDir).toLowerCase()))) throw new Error('实例目录不能与共享游戏资源或其他实例重叠');
        await fs.mkdir(path.dirname(gameDir), { recursive: true });
        // Existing directories are never adopted, emptied, renamed, or overwritten.
        await fs.mkdir(gameDir).catch((e: any) => { if (e.code === 'EEXIST') throw new Error('目标目录已存在，请选择一个新的实例目录'); throw e; });
        store.config.instances.push({ id, name: data.name, versionKey: data.versionKey, gameDir, javaPath: data.javaPath, minMemory: data.minMemory, maxMemory: data.maxMemory });
        store.config.selectedId = id;
      }
      await store.save(); notify(); return snapshot();
    },
    deleteInstance: async id => {
      const current = instance(idSchema.parse(id)); if (launcher.busy(id)) throw new Error('请在游戏退出后删除实例记录');
      store.config.instances = store.config.instances.filter(i => i.id !== current.id);
      if (store.config.selectedId === id) store.config.selectedId = store.config.instances[0]?.id;
      delete launcher.states[id]; await store.save();
      return snapshot();
    },
    chooseIcon: async id => {
      const current = instance(idSchema.parse(id));
      const result = await dialog.showOpenDialog(win, { title: t('选择实例图标'), properties: ['openFile'], filters: [{ name: t('图片'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (!result.canceled) {
        const source = result.filePaths[0]; const stat = await fs.stat(source); if (stat.size > 10 * 1024 * 1024) throw new Error('图标最大 10MB');
        const image = nativeImage.createFromPath(source); if (image.isEmpty()) throw new Error('图片无法读取');
        const icon = image.resize({ width: 128, height: 128, quality: 'best' });
        await fs.mkdir(path.join(store.dir, 'icons'), { recursive: true });
        await fs.writeFile(path.join(store.dir, 'icons', id + '.png'), icon.toPNG());
        current.icon = icon.toDataURL(); await store.save();
      }
      return snapshot();
    },
    openFolder: id => openFolder(idSchema.parse(id)),
    choosePath: kind => pick(z.enum(['java', 'directory']).parse(kind)),
    detectJava: () => detectJava(store.config.settings.roots),
    saveSettings: async (input, password) => {
      const next = settingsSchema.parse(input); const secret = z.string().max(512).optional().parse(password);
      parseJvmArgs(next.jvmArgs);
      await network.configure(next, secret);
      if (next.clientId !== store.config.settings.clientId) await auth.logout();
      store.config.settings = next; await store.save(); await scan(); return snapshot();
    },
    login: async () => { await auth.login(); notify(); return snapshot(); },
    cancelLogin: () => auth.cancel(),
    logout: async () => { await auth.logout(); notify(); return snapshot(); },
    launch: async id => { const current = instance(idSchema.parse(id)); await launcher.launch(id, versions.find(v => v.key === current.versionKey)); },
    openLogs: async id => {
      instance(idSchema.parse(id)); const file = launcher.states[id]?.logFile;
      if (file) { const result = await shell.openPath(file); if (result) throw new Error(result); }
      else { await fs.mkdir(path.join(store.dir, 'logs'), { recursive: true }); const result = await shell.openPath(path.join(store.dir, 'logs')); if (result) throw new Error(result); }
    },
    window: (action, pointer) => {
      const allowed = z.enum(['minimize', 'close', 'drag-start', 'drag-stop']).parse(action);
      if (allowed === 'drag-start') {
        const point = z.object({ x: z.number().finite().min(0), y: z.number().finite().min(0) }).strict().parse(pointer);
        const bounds = win.getContentBounds(); const zoom = win.webContents.getZoomFactor();
        if (point.x * zoom > bounds.width || point.y * zoom > bounds.height) throw new Error('Invalid drag origin');
        windowDrag.start({ x: bounds.x + point.x * zoom, y: bounds.y + point.y * zoom });
      }
      else if (allowed === 'drag-stop') windowDrag.stop(true);
      else if (allowed === 'minimize') win.minimize();
      else win.close();
    }
  };
  for (const [name, method] of Object.entries(methods)) ipcMain.handle(`launcher:${name}`, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('调用来源无效');
    try { return { ok: true, value: await method(...args) }; }
    catch (error: any) { return { ok: false, error: error instanceof z.ZodError ? error.issues.map(i => i.message).join('；') : error.message || '操作失败' }; }
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    app.setAppUserModelId('local.autumn.minecraft.launcher');
    store = new Store(app.getPath('userData'), app.getPreferredSystemLanguages()[0] || app.getLocale()); await store.init();
    const commonRoots = [path.join(app.getPath('appData'), '.minecraft'), path.join(app.getPath('home'), '.minecraft'), path.join(app.getPath('documents'), '.minecraft')];
    for (const root of commonRoots) if (!store.config.settings.roots.includes(root) && await fs.stat(path.join(root, 'versions')).then(s => s.isDirectory()).catch(() => false)) store.config.settings.roots.push(root);
    network = new Network(store);
    app.on('login', async (event, _webContents, _details, info, callback) => {
      if (info.isProxy) { event.preventDefault(); callback(store.config.settings.proxyUsername, await store.readSecret('proxy') || ''); }
      else callback();
    });
    await network.configure(store.config.settings);
    auth = new Auth(store, network, (value?: DeviceCode) => { if (!win?.isDestroyed()) win.webContents.send('launcher:deviceCode', value); });
    await auth.init();
    launcher = new Launcher(store, auth, network, notify);
    win = new BrowserWindow({ width: 1280, height: 720, minWidth: 960, minHeight: 620, frame: false, transparent: true, backgroundColor: '#00000000', show: false, title: 'Autumn Launcher', icon: path.join(__dirname, development ? '../../public/assets/app-icon.png' : '../../dist/assets/app-icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    windowDrag = new WindowDrag(win, () => screen.getCursorScreenPoint());
    win.on('blur', () => windowDrag.stop());
    win.on('closed', () => windowDrag.stop());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win.once('ready-to-show', () => win.show());
    win.on('close', event => {
      if (launcher.processes.size) {
        const result = dialog.showMessageBoxSync(win, { type: 'question', message: t('游戏仍在运行，关闭启动器后游戏会继续运行。'), detail: t('关闭后将停止显示进程状态和记录新日志。'), buttons: [t('取消'), t('关闭启动器')], defaultId: 0, cancelId: 0 });
        if (result === 0) event.preventDefault();
      }
    });
    registerIpc();
    if (bootUrl) await win.loadURL(bootUrl); else await win.loadFile(path.join(__dirname, '../../dist/index.html'));
    await scan(); await store.save();
  }).catch(error => { dialog.showErrorBox(t('启动器初始化失败'), error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
