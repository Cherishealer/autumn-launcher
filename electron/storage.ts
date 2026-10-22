import { promises as fs } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { Instance, Settings } from '../shared/types';
import { instanceSchema, settingsSchema } from './validation';
import { systemLanguage } from '../shared/i18n';

interface Config { settings: Settings; instances: Instance[]; selectedId?: string }
export class Store {
  config!: Config;
  private queue = Promise.resolve();
  constructor(readonly dir: string, private systemLocale = Intl.DateTimeFormat().resolvedOptions().locale) {}
  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    const defaults: Settings = { language: systemLanguage(this.systemLocale), javaPath: '', instancesDir: path.join(this.dir, 'instances'), minMemory: 1024, maxMemory: 4096, jvmArgs: '', clientId: process.env.MICROSOFT_CLIENT_ID || '', roots: [], proxyMode: 'system', proxyAddress: '', proxyUsername: '' };
    try {
      const data = JSON.parse(await fs.readFile(path.join(this.dir, 'config.json'), 'utf8'));
      const settings = settingsSchema.parse({ ...defaults, ...data.settings });
      const instances: Instance[] = (data.instances || []).map((v: Instance) => { instanceSchema.parse({ id: v.id, name: v.name, versionKey: v.versionKey, gameDir: v.gameDir, javaPath: v.javaPath, minMemory: v.minMemory, maxMemory: v.maxMemory }); return v; });
      this.config = { settings, instances, selectedId: data.selectedId };
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw new Error('配置文件无法读取或格式损坏。请先备份 config.json，再修复配置。');
      this.config = { settings: defaults, instances: [] };
    }
  }
  save() {
    const contents = JSON.stringify(this.config, null, 2);
    this.queue = this.queue.catch(() => {}).then(async () => {
      const target = path.join(this.dir, 'config.json');
      await fs.writeFile(target + '.tmp', contents, { mode: 0o600 });
      await fs.rename(target + '.tmp', target);
    });
    return this.queue;
  }
  async readSecret(name: 'account' | 'proxy'): Promise<string | undefined> {
    try { return (await safeStorage.decryptStringAsync(await fs.readFile(path.join(this.dir, name + '.bin')))).result; }
    catch (e: any) { if (e.code === 'ENOENT') return; throw new Error('Windows 无法解密保存的凭据，请重新登录或重新设置代理密码。'); }
  }
  async writeSecret(name: 'account' | 'proxy', value?: string) {
    const target = path.join(this.dir, name + '.bin');
    if (!value) { await fs.rm(target, { force: true }); return; }
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('系统凭据加密不可用，未保存任何明文凭据。');
    const temporary = target + '.tmp';
    await fs.writeFile(temporary, await safeStorage.encryptStringAsync(value), { mode: 0o600 });
    await fs.rename(temporary, target);
  }
}
