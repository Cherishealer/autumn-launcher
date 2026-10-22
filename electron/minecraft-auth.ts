export type MinecraftAuthStage = 'xbox-user' | 'xbox-device' | 'xbox-xsts' | 'minecraft-token' | 'minecraft-ownership' | 'minecraft-profile';

const endpoints: Record<string, { stage: MinecraftAuthStage; label: string }> = {
  'https://user.auth.xboxlive.com/user/authenticate': { stage: 'xbox-user', label: 'Xbox 账号验证' },
  'https://device.auth.xboxlive.com/device/authenticate': { stage: 'xbox-device', label: 'Xbox 设备验证' },
  'https://xsts.auth.xboxlive.com/xsts/authorize': { stage: 'xbox-xsts', label: 'Xbox XSTS 授权' },
  'https://api.minecraftservices.com/authentication/login_with_xbox': { stage: 'minecraft-token', label: 'Minecraft 登录' },
  'https://api.minecraftservices.com/entitlements/mcstore': { stage: 'minecraft-ownership', label: 'Minecraft 正版资格检查' },
  'https://api.minecraftservices.com/minecraft/profile': { stage: 'minecraft-profile', label: 'Minecraft 玩家档案读取' }
};

export class MinecraftAuthError extends Error {
  constructor(message: string, readonly stage: MinecraftAuthStage, readonly status?: number, readonly reason?: 'invalid_app_registration', readonly xErr?: number) {
    super(message); this.name = 'MinecraftAuthError';
  }
}

// Keep service bodies, headers and tokens inside the main process. Only fixed
// explanations and numeric status/XErr codes may cross the IPC error boundary.
export function minecraftAuthFetch(transport: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const endpoint = endpoints[url.origin + url.pathname];
    if (!endpoint) return transport(input, init);
    let response: Response;
    try { response = await transport(input, { ...init, signal: init?.signal || AbortSignal.timeout(60000) }); }
    catch { throw new MinecraftAuthError(endpoint.label + '网络请求失败，请检查网络或代理后重试。', endpoint.stage); }
    if (response.ok) return response;
    let body: Record<string, unknown> = {};
    try { const value = await response.json(); if (value && typeof value === 'object' && !Array.isArray(value)) body = value; } catch { /* Non-JSON failures still retain stage and HTTP status. */ }
    const xErr = typeof body.XErr === 'number' && Number.isSafeInteger(body.XErr) && body.XErr >= 0 ? body.XErr : undefined;
    const status = '（HTTP ' + response.status + (xErr === undefined ? '' : '；XErr ' + xErr) + '）';
    let detail = '请稍后重试；持续失败时请根据此阶段和状态码排查。';
    let reason: 'invalid_app_registration' | undefined;
    if (endpoint.stage === 'minecraft-token' && response.status === 403) {
      const invalidApp = [body.error, body.errorMessage, body.message].some(value => typeof value === 'string' && /\binvalid app registration\b/i.test(value));
      if (invalidApp) {
        reason = 'invalid_app_registration';
        detail = '服务返回 Invalid app registration：此启动器的 Client ID 尚未获准访问 Minecraft API，需要提交应用访问资格申请；重复授权账号无法解决。';
      } else {
        detail = '微软账号及 Xbox 验证已通过，但 Minecraft 服务拒绝此登录请求。常见原因是应用 Client ID 尚未获准访问 Minecraft API；本次响应未明确说明原因，不能据此判断为家庭权限问题。';
      }
    } else if (response.status === 429 || response.status >= 500) {
      detail = '服务繁忙或暂时不可用，请稍后重试。';
    } else if (endpoint.stage === 'xbox-xsts') {
      detail = xErr === undefined ? 'Xbox 拒绝授权请求，本次响应未提供 XErr 代码，请重新登录或稍后重试。' : 'Xbox 拒绝授权，请根据 XErr 代码检查 Xbox 档案及账号限制。';
    } else if (endpoint.stage === 'minecraft-profile' && response.status === 404) {
      detail = '账号尚未建立 Minecraft Java 玩家档案，请先在 Minecraft 官网完成档案设置。';
    } else if (response.status === 401) {
      detail = '此阶段的登录凭据未被服务接受，请重新登录。';
    }
    throw new MinecraftAuthError(endpoint.label + '失败' + status + '。' + detail, endpoint.stage, response.status, reason, xErr);
  };
}
