import { PublicClientApplication } from '@azure/msal-node';
import { MicrosoftAuthenticator } from '@xmcl/user';
import { nativeImage, shell } from 'electron';
import type { Account, DeviceCode } from '../shared/types';
import type { Store } from './storage';
import type { Network } from './network';
import { MicrosoftLoginError, readDeviceCode } from './oauth-response';
import { minecraftAuthFetch, MinecraftAuthError } from './minecraft-auth';

type DeviceCodeRequest = Parameters<PublicClientApplication['acquireTokenByDeviceCode']>[0];

export class Auth {
  account?: Account;
  private pca?: PublicClientApplication;
  private activeClient = '';
  private loginRequest?: DeviceCodeRequest;
  private token?: { accessToken: string; expiresAt: number };
  constructor(private store: Store, private network: Network, private code: (code?: DeviceCode) => void, private openBrowser: (url: string) => Promise<unknown> = url => shell.openExternal(url)) {}
  async init() {
    const encrypted = await this.store.readSecret('account');
    if (encrypted) this.account = JSON.parse(encrypted).profile;
  }
  private async client() {
    const clientId = this.store.config.settings.clientId;
    if (!clientId) throw new Error('启动器尚未配置 Microsoft 应用 Client ID。请在账号窗口配置应用编号后使用官方登录通道。');
    if (!this.pca || this.activeClient !== clientId) {
      this.activeClient = clientId;
      this.pca = new PublicClientApplication({
        auth: { clientId, authority: 'https://login.microsoftonline.com/consumers' },
        system: { networkClient: this.network.msalClient, loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } }
      });
      const saved = await this.store.readSecret('account');
      if (saved) { const data = JSON.parse(saved); if (data.clientId === clientId && data.cache) this.pca.getTokenCache().deserialize(data.cache); }
    }
    return this.pca;
  }
  async login() {
    if (this.loginRequest) throw new Error('已有一个微软登录流程正在进行');
    // MSAL normalizes this object with Object.assign and then polls its cancel
    // property. Keep the same ordinary, writable request for MSAL and cancel().
    const request: DeviceCodeRequest = {
      scopes: ['XboxLive.signin'],
      cancel: false,
      deviceCodeCallback: response => {
        if (request.cancel) return;
        const device = readDeviceCode(response);
        this.code(device);
        if (request.cancel) return;
        void this.openBrowser(device.uri).catch(() => {});
      }
    };
    this.loginRequest = request;
    try {
      const pca = await this.client();
      if (request.cancel) throw new Error('已取消登录');
      const result = await pca.acquireTokenByDeviceCode(request);
      if (!result || request.cancel) throw new Error('已取消登录');
      await this.exchange(result.accessToken);
    } catch (error: any) {
      if (request.cancel) throw new Error('已取消登录');
      if (error instanceof MicrosoftLoginError) throw error;
      if (error.errorCode) throw new Error(`微软登录失败（${error.errorCode}）。请检查应用注册、网络及账户权限。`);
      throw error;
    } finally { this.loginRequest = undefined; this.code(); }
  }
  cancel() { if (this.loginRequest) this.loginRequest.cancel = true; this.code(); }
  private async exchange(accessToken: string) {
    const authFetch = minecraftAuthFetch(this.network.fetch);
    const authenticator = new MicrosoftAuthenticator({ fetch: authFetch });
    const xbox = await authenticator.acquireXBoxToken(accessToken);
    const xsts = xbox.minecraftXstsResponse;
    const token = await authenticator.loginMinecraftWithXBox(xsts.DisplayClaims.xui[0].uhs, xsts.Token);
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const entitlements = await (await authFetch('https://api.minecraftservices.com/entitlements/mcstore', { headers })).json();
    if (!Array.isArray(entitlements.items) || !entitlements.items.some((v: any) => ['game_minecraft', 'product_minecraft'].includes(v.name))) throw new Error('此账号未检测到 Minecraft Java Edition 使用资格。');
    const profile = await (await authFetch('https://api.minecraftservices.com/minecraft/profile', { headers })).json();
    if (!/^[0-9a-f]{32}$/i.test(profile.id) || typeof profile.name !== 'string') throw new Error('账号尚未建立有效的 Minecraft Java 玩家档案。');
    let avatar: string | undefined;
    try {
      const url = new URL(profile.skins?.find((s: any) => s.state === 'ACTIVE')?.url);
      if (url.protocol === 'https:' && url.hostname === 'textures.minecraft.net') {
        const response = await this.network.fetch(url.href, { signal: AbortSignal.timeout(15000) });
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 4 * 1024 * 1024) {
          const skin = nativeImage.createFromBuffer(bytes); const size = skin.getSize();
          if (size.width >= 64 && size.height >= 32) avatar = skin.crop({ x: 8, y: 8, width: 8, height: 8 }).toDataURL();
        }
      }
    } catch { /* Login remains valid if the skin server is unavailable. */ }
    this.account = { id: profile.id, name: profile.name, avatar };
    this.token = { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
    await this.store.writeSecret('account', JSON.stringify({ clientId: this.activeClient, cache: this.pca!.getTokenCache().serialize(), profile: this.account }));
  }
  async credentials() {
    if (!this.account) throw new Error('请先点击右上角头像登录微软正版账号');
    if (!this.token || this.token.expiresAt < Date.now() + 120000) {
      const pca = await this.client(); const accounts = await pca.getTokenCache().getAllAccounts();
      if (!accounts[0]) throw new Error('登录已过期，请重新点击头像登录');
      try {
        const result = await pca.acquireTokenSilent({ account: accounts[0], scopes: ['XboxLive.signin'] });
        await this.exchange(result.accessToken);
      } catch (error) {
        if (error instanceof MinecraftAuthError || error instanceof MicrosoftLoginError) throw error;
        throw new Error('无法刷新登录状态，请重新登录；也可检查代理和网络设置。');
      }
    }
    return { profile: this.account!, accessToken: this.token!.accessToken };
  }
  async logout() {
    this.cancel(); this.pca = undefined; this.token = undefined; this.account = undefined;
    await this.store.writeSecret('account');
  }
}
