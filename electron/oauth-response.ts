import type { DeviceCode } from '../shared/types';
import { AuthError } from '@azure/msal-node';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};

export class MicrosoftLoginError extends AuthError {
  constructor(message: string, code = 'invalid_login_response') {
    super(code, '', message);
    // AuthError sets its own prototype, so restore the derived type as well.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'MicrosoftLoginError'; this.message = message;
  }
}

export class MicrosoftOAuthError extends MicrosoftLoginError {
  constructor(payload: unknown, status: number) {
    const body = object(payload);
    const code = typeof body.error === 'string' && /^[a-z][a-z0-9_]{0,79}$/i.test(body.error) ? body.error : 'microsoft_error';
    const numeric = Array.isArray(body.error_codes) ? body.error_codes.find(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0) : undefined;
    const match = typeof body.error_description === 'string' ? body.error_description.match(/\bAADSTS(\d{4,10})\b/) : undefined;
    const aadsts = numeric || (match ? Number(match[1]) : undefined);
    let action = '请检查应用注册和网络设置，或稍后重试。';
    if (aadsts === 70002 || aadsts === 7000218) action = '应用尚未允许公共客户端登录。请在 Azure「应用注册 → 你的应用 → 身份验证 → 高级设置」中将「允许公共客户端流」设为「是」并保存，然后重试。';
    else if (aadsts === 700016) action = '微软找不到此应用。请核对「应用程序（客户端）ID」，不要填写租户 ID。';
    else if (aadsts === 50020 || aadsts === 50194 || aadsts === 500208) action = '请检查应用的受支持账户类型是否包含个人 Microsoft 账户。';
    else if (code === 'invalid_client' || code === 'unauthorized_client') action = '请核对应用 Client ID、个人 Microsoft 账户支持及「允许公共客户端流」设置。';
    else if (code === 'invalid_scope') action = '微软未接受当前应用请求的 Xbox 授权范围。请检查应用注册及 Xbox/Minecraft API 访问资格。';
    else if (code === 'access_denied') action = '微软授权被拒绝或取消，请重新发起登录并在官方页面完成授权。';
    super(`微软登录失败（${code}${aadsts ? ` / AADSTS${aadsts}` : ''}，HTTP ${status}）。${action}`, code);
    this.name = 'MicrosoftOAuthError';
  }
}

function verificationUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new MicrosoftLoginError('微软授权响应缺少登录网址，请稍后重试；如持续发生，请检查代理和应用注册。');
  let url: URL;
  try { url = new URL(value); } catch { throw new MicrosoftLoginError('微软授权响应中的登录网址无效，请检查代理或稍后重试。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['microsoft.com', 'www.microsoft.com', 'login.microsoftonline.com', 'login.live.com'].includes(url.hostname)) throw new MicrosoftLoginError('微软授权响应中的登录网址不是受信任的官方 HTTPS 地址，未打开浏览器。');
  return url.href;
}

export function readDeviceCode(value: unknown): DeviceCode {
  const response = object(value);
  const uri = verificationUrl(response.verificationUri);
  if (typeof response.userCode !== 'string' || !response.userCode.trim()) throw new MicrosoftLoginError('微软授权响应缺少设备授权码，请重新发起登录。');
  const expires = Number(response.expiresIn);
  if (!Number.isFinite(expires) || expires <= 0) throw new MicrosoftLoginError('微软返回的设备授权码已过期或有效期无效，请重新发起登录。');
  return { code: response.userCode, uri, expiresAt: Date.now() + expires * 1000 };
}

export function microsoftResponse(url: string, status: number, value: unknown): unknown {
  const body = object(value);
  const deviceEndpoint = new URL(url).pathname.endsWith('/devicecode');
  const polling = body.error === 'authorization_pending' || body.error === 'slow_down';
  // MSAL 7's device-code endpoint destructures even error responses as success.
  // Catch service errors here, before the SDK calls the UI with undefined URLs.
  if (body.error && (deviceEndpoint || !polling)) throw new MicrosoftOAuthError(body, status);
  if (polling && !deviceEndpoint) return value;
  if (status < 200 || status >= 300) throw new MicrosoftLoginError(`微软登录服务请求失败（HTTP ${status}），请检查代理或稍后重试。`);
  if (!deviceEndpoint) return value;
  const uri = body.verification_uri ?? body.verification_url;
  const parsed = readDeviceCode({ userCode: body.user_code, verificationUri: uri, expiresIn: body.expires_in });
  if (typeof body.device_code !== 'string' || !body.device_code) throw new MicrosoftLoginError('微软授权响应缺少设备会话信息，请重新发起登录。');
  const interval = body.interval === undefined ? 5 : Number(body.interval);
  if (!Number.isFinite(interval) || interval < 0) throw new MicrosoftLoginError('微软授权响应中的轮询间隔无效，请稍后重试。');
  return { ...body, verification_uri: parsed.uri, expires_in: Number(body.expires_in), interval };
}
