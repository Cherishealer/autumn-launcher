import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/types';
const names = ['snapshot', 'scan', 'addRoot', 'select', 'reorderInstances', 'saveInstance', 'deleteInstance', 'chooseIcon', 'openFolder', 'choosePath', 'detectJava', 'saveSettings', 'login', 'cancelLogin', 'logout', 'launch', 'openLogs', 'window'] as const;
const api: Record<string, unknown> = {};
for (const name of names) api[name] = async (...args: unknown[]) => {
  const result = await ipcRenderer.invoke(`launcher:${name}`, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
function subscribe(channel: string, listener: (value: any) => void) {
  const wrapped = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}
api.onSnapshot = (listener: Parameters<Api['onSnapshot']>[0]) => subscribe('launcher:snapshot', listener);
api.onDeviceCode = (listener: Parameters<Api['onDeviceCode']>[0]) => subscribe('launcher:deviceCode', listener);
contextBridge.exposeInMainWorld('launcher', Object.freeze(api));
