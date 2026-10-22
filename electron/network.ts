import { net, session } from 'electron';
import type { Settings } from '../shared/types';
import type { Store } from './storage';
import { microsoftResponse, MicrosoftLoginError } from './oauth-response';

export class Network {
  constructor(private store: Store) {}
  async configure(settings: Settings, password?: string) {
    if (['http', 'socks5'].includes(settings.proxyMode)) {
      const url = new URL(`${settings.proxyMode === 'http' ? 'http' : 'socks5'}://${settings.proxyAddress.replace(/^\w+:\/\//, '')}`);
      if (!url.hostname || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('代理地址应为 host:port，账号密码请填在独立字段中');
      if (settings.proxyMode === 'socks5' && (settings.proxyUsername || password)) throw new Error('当前网络引擎只支持不带认证的 SOCKS5；HTTP 支持账号密码。');
      await session.defaultSession.setProxy({ mode: 'fixed_servers', proxyRules: `${settings.proxyMode}://${url.host}` });
    } else await session.defaultSession.setProxy({ mode: settings.proxyMode === 'direct' ? 'direct' : 'system' });
    if (password !== undefined) await this.store.writeSecret('proxy', password);
    await session.defaultSession.closeAllConnections();
  }
  fetch: typeof fetch = (input, init) => net.fetch(input instanceof URL ? input.href : input, init);
  async json(url: string, init?: RequestInit) {
    const response = await this.fetch(url, { ...init, signal: init?.signal || AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`网络请求失败（${new URL(url).hostname}，HTTP ${response.status}）`);
    return response.json();
  }
  msalClient = {
    sendGetRequestAsync: async <T>(url: string, options?: { headers?: Record<string, string> }) => this.msal<T>(url, { headers: options?.headers }),
    sendPostRequestAsync: async <T>(url: string, options?: { headers?: Record<string, string>; body?: string }) => this.msal<T>(url, { method: 'POST', headers: options?.headers, body: options?.body })
  };
  private async msal<T>(url: string, init: RequestInit) {
    const res = await this.fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
    let body: unknown;
    try { body = await res.json(); }
    catch { throw new MicrosoftLoginError(`微软登录服务未返回可识别的 JSON（HTTP ${res.status}），请检查代理或稍后重试。`); }
    return { headers: Object.fromEntries(res.headers.entries()), body: microsoftResponse(url, res.status, body) as T, status: res.status };
  }
}
