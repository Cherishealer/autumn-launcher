import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { ChildProcess } from 'node:child_process';
import { launch, createMinecraftProcessWatcher } from '@xmcl/core';
import { initialState, beginLaunch, latestLog, transition } from '../shared/launch-state';
import type { LaunchState, InstalledVersion } from '../shared/types';
import { parseJvmArgs } from './validation';
import { resolveVersion, diagnoseVersion, repairFiles, issueSummary, useHashedAssetIndex } from './versions';
import { inspectJava, detectJava } from './java';
import { downloadMissing } from './download';
import type { Store } from './storage';
import type { Auth } from './auth';
import type { Network } from './network';

export class Launcher {
  states: Record<string, LaunchState> = {};
  processes = new Map<string, ChildProcess>();
  private active = new Set<string>();
  constructor(private store: Store, private auth: Auth, private network: Network, private notify: () => void) {}
  busy(id: string) { return this.active.has(id) || this.processes.has(id); }
  async launch(id: string, installed?: InstalledVersion) {
    const instance = this.store.config.instances.find(i => i.id === id);
    if (!instance) throw new Error('找不到实例');
    if (this.busy(id)) throw new Error('此实例正在启动或运行');
    this.active.add(id);
    const attempt = randomUUID();
    const logs = path.join(this.store.dir, 'logs');
    const logFile = path.join(logs, `${id}-${Date.now()}.log`);
    try { await fs.mkdir(logs, { recursive: true }); await fs.writeFile(logFile, '', { flag: 'wx', mode: 0o600 }); }
    catch { this.active.delete(id); throw new Error('无法创建启动日志，请检查配置目录权限。'); }
    const stream = createWriteStream(logFile, { flags: 'a', mode: 0o600 });
    this.states[id] = beginLaunch(attempt, logFile); this.notify();
    const secrets: string[] = [];
    const redact = (value: string) => {
      let text = value.replace(/(Bearer\s+|--accessToken[=\s]+|(?:access_token|refresh_token|identityToken)["':=\s]+)\S+/gi, '$1[REDACTED]');
      for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
      return text;
    };
    const log = (value: string) => {
      const message = redact(value).trim(); if (!message) return;
      if (!stream.destroyed) stream.write(`${new Date().toISOString()} ${message}\n`);
      this.states[id] = latestLog(this.states[id], attempt, message); this.notify();
    };
    const move = (phase: LaunchState['phase'], error?: string) => { this.states[id] = transition(this.states[id], attempt, phase, error); this.notify(); };
    stream.on('error', () => { move('failed', '详细日志写入失败，请检查配置目录权限。'); });
    try {
      if (!installed || installed.loader === 'Unsupported') throw new Error('此版本不可用，请重新扫描并检查版本问题');
      log('Checking Microsoft session...');
      const credentials = await this.auth.credentials(); secrets.push(credentials.accessToken);
      log('Checking Java runtime...');
      const settings = this.store.config.settings;
      let javaPath = instance.javaPath || settings.javaPath;
      if (!javaPath) {
        const detected = await detectJava(settings.roots);
        javaPath = detected.find(j => j.major === installed.javaMajor && ['amd64', 'x86_64', 'aarch64'].includes(j.arch))?.path || '';
      }
      if (!javaPath) throw new Error(`未找到 Java ${installed.javaMajor}，请在全局配置中设置路径`);
      const java = await inspectJava(javaPath);
      if (java.major !== installed.javaMajor) throw new Error(`当前是 Java ${java.major}，此版本要求 Java ${installed.javaMajor}。请更换 Java。`);
      if (!['amd64', 'x86_64'].includes(java.arch)) throw new Error('此 Windows x64 启动器需要 64 位 x86 Java');
      const minMemory = instance.minMemory ?? settings.minMemory; const maxMemory = instance.maxMemory ?? settings.maxMemory;
      if (minMemory > maxMemory) throw new Error('最小内存不能大于最大内存');
      const extraJVMArgs = parseJvmArgs(settings.jvmArgs);
      log('Validating version and shared resources...');
      const version = await resolveVersion(installed.root, installed.id);
      let issue = await diagnoseVersion(version, true);
      for (let stage = 0; issue && stage < 3; stage++) {
        if (issue.forge || issue.profile) throw new Error(issueSummary(issue).join('；'));
        const files = repairFiles(version, issue);
        if (!files.length) break;
        move('downloading');
        await downloadMissing(files, installed.root, this.network, (done, total, file) => {
          log(`Downloading resources... ${done}/${total}${file ? ` — ${file}` : ''}`);
          this.states[id] = { ...this.states[id], progress: total ? done / total : undefined }; this.notify();
        });
        log('Verifying downloaded resources...');
        issue = await diagnoseVersion(version, true);
      }
      if (issue) throw new Error(issueSummary(issue).join('；'));
      log('Checking instance directory...');
      await fs.access(instance.gameDir, fs.constants.W_OK);
      move('starting'); log('Starting Minecraft Java Edition...');
      const process = await launch({
        version, javaPath: java.path, gamePath: instance.gameDir, resourcePath: installed.root,
        useHashAssetsIndex: await useHashedAssetIndex(version),
        gameProfile: credentials.profile, accessToken: credentials.accessToken,
        launcherName: 'Autumn Launcher', launcherBrand: 'Autumn', minMemory, maxMemory,
        ...(extraJVMArgs.length ? { extraJVMArgs } : {}), nativeRoot: path.join(instance.gameDir, '.autumn-natives'),
        extraExecOption: { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      });
      this.processes.set(id, process);
      const watcher = createMinecraftProcessWatcher(process);
      watcher.on('error', error => { log(error.message || 'Java process failed'); move('failed', 'Java 进程无法启动，请查看详细日志。'); this.processes.delete(id); this.active.delete(id); stream.end(); });
      watcher.on('minecraft-window-ready', () => { log('Minecraft window initialized.'); move('running'); });
      for (const pipe of [process.stdout, process.stderr]) if (pipe) {
        const lines = createInterface({ input: pipe, crlfDelay: Infinity });
        lines.on('line', line => log(line.slice(0, 32768)));
      }
      process.once('close', (code, signal) => {
        const wasRunning = this.states[id].phase === 'running';
        log(`Minecraft exited (code=${code}, signal=${signal || 'none'}).`);
        if (wasRunning && code === 0) move('ready');
        else move('failed', `游戏${wasRunning ? '异常退出' : '未完成启动'}（退出码 ${code ?? signal}）。请查看详细日志。`);
        this.processes.delete(id); this.active.delete(id); stream.end();
      });
      this.active.delete(id);
    } catch (error: any) {
      const message = redact(error.message || '启动失败'); log(message); move('failed', message);
      this.active.delete(id); stream.end();
    }
  }
  state(id: string) { return this.states[id] || initialState(); }
}
