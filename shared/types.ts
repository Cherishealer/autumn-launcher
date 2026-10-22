export type Language = 'zh-CN' | 'en-US';
export type Phase = 'ready' | 'checking' | 'downloading' | 'starting' | 'running' | 'failed';
export interface LaunchState {
  phase: Phase; message: string; progress?: number; error?: string; logFile?: string; attempt: string;
}
export interface InstalledVersion {
  key: string; root: string; id: string; minecraft: string;
  loader: 'Vanilla' | 'Fabric' | 'Forge' | 'NeoForge' | 'Unsupported'; loaderVersion?: string;
  javaMajor: number; runnable: boolean; repairable: boolean; issues: string[]; icon?: string;
}
export interface Instance {
  id: string; name: string; versionKey: string; gameDir: string; icon?: string;
  javaPath?: string; minMemory?: number; maxMemory?: number;
}
export interface Settings {
  language: Language;
  javaPath: string; instancesDir: string; minMemory: number; maxMemory: number;
  jvmArgs: string; clientId: string; roots: string[];
  proxyMode: 'system' | 'direct' | 'http' | 'socks5'; proxyAddress: string; proxyUsername: string;
}
export interface Account { name: string; id: string; avatar?: string }
export interface DeviceCode { code: string; uri: string; expiresAt: number }
export interface Snapshot {
  settings: Settings; instances: Instance[]; versions: InstalledVersion[]; account?: Account;
  states: Record<string, LaunchState>; selectedId?: string; scanErrors: string[];
}
export interface JavaInstallation { path: string; version: string; major: number; arch: string }
export interface InstanceInput { id?: string; name: string; versionKey: string; gameDir?: string; javaPath?: string; minMemory?: number; maxMemory?: number }
export interface Api {
  snapshot(): Promise<Snapshot>;
  scan(): Promise<Snapshot>;
  addRoot(): Promise<Snapshot>;
  select(id: string): Promise<Snapshot>;
  saveInstance(input: InstanceInput): Promise<Snapshot>;
  deleteInstance(id: string): Promise<Snapshot>;
  chooseIcon(id: string): Promise<Snapshot>;
  openFolder(id: string): Promise<void>;
  choosePath(kind: 'java' | 'directory'): Promise<string | undefined>;
  detectJava(): Promise<JavaInstallation[]>;
  saveSettings(settings: Settings, proxyPassword?: string): Promise<Snapshot>;
  login(): Promise<Snapshot>;
  cancelLogin(): Promise<void>;
  logout(): Promise<Snapshot>;
  launch(id: string): Promise<void>;
  openLogs(id: string): Promise<void>;
  window(action: 'minimize' | 'close' | 'drag-start' | 'drag-stop', point?: { x: number; y: number }): Promise<void>;
  onSnapshot(fn: (data: Snapshot) => void): () => void;
  onDeviceCode(fn: (data: DeviceCode | undefined) => void): () => void;
}
