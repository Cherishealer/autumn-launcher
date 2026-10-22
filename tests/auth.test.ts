import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Auth } from '../electron/auth';
import type { Store } from '../electron/storage';
import { Network } from '../electron/network';
import type { DeviceCode } from '../shared/types';

// Exercise the installed MSAL implementation with an isolated HTTP transport.
// No real account, token, browser, user configuration or Microsoft service is used.
function fixture(onCode: (code?: DeviceCode) => void, readSecret: () => Promise<string | undefined> = async () => undefined, deviceReply?: { status: number; body: unknown }, exchangeTransport?: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: string[] = []; const opened: string[] = [];
  const authority = 'https://login.microsoftonline.com/consumers';
  const metadata = {
    authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
    token_endpoint: `${authority}/oauth2/v2.0/token`,
    device_authorization_endpoint: `${authority}/oauth2/v2.0/devicecode`,
    issuer: `${authority}/v2.0`,
    end_session_endpoint: `${authority}/oauth2/v2.0/logout`,
    jwks_uri: `${authority}/discovery/v2.0/keys`
  };
  const store = { config: { settings: { clientId: '00000000-0000-4000-8000-000000000001' } }, readSecret } as unknown as Store;
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const network = new Network(store);
  // Keep the actual production HTTP/JSON adapter as well as the actual SDK.
  // Replace only the lowest HTTP transport, so error responses follow the same
  // path as the real 401/AADSTS70002 response observed from Microsoft.
  network.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (init?.method !== 'POST') {
      if (url.includes('/discovery/instance')) return response({ tenant_discovery_endpoint: `${authority}/v2.0/.well-known/openid-configuration`, metadata: [{ preferred_network: 'login.microsoftonline.com', preferred_cache: 'login.windows.net', aliases: ['login.microsoftonline.com', 'login.windows.net', 'login.microsoft.com', 'sts.windows.net'] }] });
      if (url.includes('/.well-known/openid-configuration')) return response(metadata);
      throw new Error(`Unexpected test GET: ${url}`);
    }
    if (new URL(url).pathname.endsWith('/devicecode')) return deviceReply ? response(deviceReply.body, deviceReply.status) : response({ device_code: 'synthetic-device-code', user_code: 'TEST-ONLY', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 0, message: 'Synthetic test response' });
    if (exchangeTransport) return exchangeTransport(url, init);
    if (new URL(url).pathname.endsWith('/token')) return response({ error: 'access_denied', error_description: 'Synthetic authorization denial' }, 400);
    throw new Error(`Unexpected test POST: ${url}`);
  };
  const auth = new Auth(store, network, onCode, async url => { opened.push(url); });
  return { auth, calls, opened };
}

test('real MSAL can normalize the login request and reach the browser/device-code callback', { timeout: 10000 }, async () => {
  const codes: DeviceCode[] = [];
  const { auth, calls, opened } = fixture(code => { if (code) codes.push(code); });
  await assert.rejects(auth.login(), /微软登录失败/);
  assert.equal(codes[0]?.code, 'TEST-ONLY');
  assert.deepEqual(opened, ['https://microsoft.com/devicelogin']);
  assert.ok(calls.some(url => new URL(url).pathname.endsWith('/devicecode')));
  assert.ok(calls.some(url => new URL(url).pathname.endsWith('/token')));
});

test('cancel uses the same mutable object polled by real MSAL', { timeout: 10000 }, async () => {
  let auth: Auth;
  const result = fixture(code => { if (code) auth.cancel(); }); auth = result.auth;
  await assert.rejects(auth.login(), /已取消登录/);
  assert.equal(result.calls.some(url => new URL(url).pathname.endsWith('/token')), false);
  assert.equal(result.opened.length, 0);
});

test('cancel during client initialization stops before contacting the device endpoint', { timeout: 10000 }, async () => {
  let resolve!: (value: undefined) => void;
  const delayedRead = new Promise<undefined>(r => { resolve = r; });
  const { auth, calls } = fixture(() => {}, () => delayedRead);
  const login = auth.login(); auth.cancel(); resolve(undefined);
  await assert.rejects(login, /已取消登录/);
  assert.deepEqual(calls, []);
});

test('concurrent login is rejected and a cancelled attempt can be retried', { timeout: 10000 }, async () => {
  let resolve!: (value: undefined) => void;
  const delayedRead = new Promise<undefined>(r => { resolve = r; });
  const { auth } = fixture(() => {}, () => delayedRead);
  const first = auth.login();
  await assert.rejects(auth.login(), /已有一个微软登录流程/);
  auth.cancel(); resolve(undefined);
  await assert.rejects(first, /已取消登录/);
  await assert.rejects(auth.login(), /微软登录失败/);
});

test('real Microsoft 401/AADSTS70002 response explains the required app setting without an Invalid URL', { timeout: 10000 }, async () => {
  const codes: DeviceCode[] = [];
  const { auth, opened, calls } = fixture(code => { if (code) codes.push(code); }, undefined, { status: 401, body: { error: 'invalid_client', error_description: "AADSTS70002: The provided client is not supported for this feature. The client application must be marked as 'mobile.'", error_codes: [70002] } });
  await assert.rejects(auth.login(), (error: Error) => {
    assert.match(error.message, /AADSTS70002/);
    assert.match(error.message, /允许公共客户端流/);
    assert.doesNotMatch(error.message, /Invalid URL/);
    return true;
  });
  assert.deepEqual(codes, []); assert.deepEqual(opened, []);
  assert.equal(calls.some(url => new URL(url).pathname.endsWith('/token')), false);
});

test('missing verification URL never enters the UI or browser callback', { timeout: 10000 }, async () => {
  const codes: DeviceCode[] = [];
  const { auth, opened } = fixture(code => { if (code) codes.push(code); }, undefined, { status: 200, body: { device_code: 'synthetic', user_code: 'TEST-ONLY', expires_in: 900 } });
  await assert.rejects(auth.login(), /缺少登录网址/);
  assert.deepEqual(codes, []); assert.deepEqual(opened, []);
});

test('legacy verification_url field is normalized before MSAL reads it', { timeout: 10000 }, async () => {
  const codes: DeviceCode[] = [];
  const { auth, opened } = fixture(code => { if (code) codes.push(code); }, undefined, { status: 200, body: { device_code: 'synthetic', user_code: 'TEST-ONLY', verification_url: 'https://www.microsoft.com/link', expires_in: 900, interval: 0 } });
  await assert.rejects(auth.login(), /微软登录失败/);
  assert.equal(codes[0]?.uri, 'https://www.microsoft.com/link');
  assert.deepEqual(opened, ['https://www.microsoft.com/link']);
});

// Drive the real MSAL + Auth + XMCL flow across the OAuth boundary as well.
test('full login preserves Minecraft app rejection after Microsoft and Xbox authorize successfully', { timeout: 10000 }, async () => {
  const secret = 'SYNTHETIC-SECRET-DO-NOT-DISPLAY';
  const { auth, calls } = fixture(() => {}, undefined, undefined, async url => {
    const body = url.endsWith('/token')
      ? { access_token: secret, expires_in: 3600, token_type: 'Bearer', scope: 'XboxLive.signin' }
      : url.endsWith('/authentication/login_with_xbox')
        ? { errorMessage: 'Invalid app registration ' + secret }
        : { Token: secret, DisplayClaims: { xui: [{ uhs: 'synthetic-hash' }] } };
    return new Response(JSON.stringify(body), { status: url.endsWith('/authentication/login_with_xbox') ? 403 : 200, headers: { 'Content-Type': 'application/json' } });
  });
  await assert.rejects(auth.login(), (error: Error) => {
    assert.match(error.message, /Minecraft 登录失败（HTTP 403）/);
    assert.match(error.message, /Invalid app registration/);
    assert.doesNotMatch(error.message, new RegExp(secret)); return true;
  });
  assert.equal(auth.account, undefined);
  assert.ok(calls.some(url => url.endsWith('/authentication/login_with_xbox')));
});
