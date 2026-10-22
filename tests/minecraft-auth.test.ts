import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MicrosoftAuthenticator } from '@xmcl/user';
import { minecraftAuthFetch, MinecraftAuthError } from '../electron/minecraft-auth';

const mc = 'https://api.minecraftservices.com';
const tokenUrl = mc + '/authentication/login_with_xbox';
const secret = 'SYNTHETIC-TOKEN-MUST-NOT-LEAK';
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function xboxFixture(failure: 'invalid-app' | 'unknown-403' | 'xsts' | 'none' | 'optional-xsts') {
  const calls: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url === 'https://user.auth.xboxlive.com/user/authenticate') return reply({ Token: secret });
    if (url === 'https://device.auth.xboxlive.com/device/authenticate') return reply({ Token: secret });
    if (url === 'https://xsts.auth.xboxlive.com/xsts/authorize') {
      if (failure === 'xsts' || (failure === 'optional-xsts' && JSON.parse(String(init?.body)).RelyingParty === 'http://xboxlive.com')) return reply({ XErr: 2148916238, Message: secret, Token: secret }, 401);
      return reply({ Token: secret, DisplayClaims: { xui: [{ uhs: 'synthetic-user-hash' }] } });
    }
    if (url === tokenUrl) {
      if (failure === 'invalid-app') return reply({ error: 'FORBIDDEN', errorMessage: 'Invalid app registration, ' + secret, access_token: secret }, 403);
      if (failure === 'unknown-403') return reply({ errorMessage: secret }, 403);
      return reply({ access_token: secret, expires_in: 3600 });
    }
    throw new Error('Unexpected test endpoint');
  };
  return { calls, authenticator: new MicrosoftAuthenticator({ fetch: minecraftAuthFetch(transport) }) };
}

async function exchange(authenticator: MicrosoftAuthenticator) {
  const xbox = await authenticator.acquireXBoxToken('synthetic-oauth-access-token');
  const xsts = xbox.minecraftXstsResponse;
  return authenticator.loginMinecraftWithXBox(xsts.DisplayClaims.xui[0].uhs, xsts.Token);
}

test('real XMCL Xbox pipeline distinguishes explicit Minecraft app rejection and never exposes service tokens', async () => {
  const { authenticator, calls } = xboxFixture('invalid-app');
  await assert.rejects(exchange(authenticator), (error: MinecraftAuthError) => {
    assert.ok(error instanceof MinecraftAuthError);
    assert.equal(error.stage, 'minecraft-token'); assert.equal(error.status, 403);
    assert.equal(error.reason, 'invalid_app_registration');
    assert.match(error.message, /Invalid app registration/);
    assert.match(error.message, /提交应用访问资格申请/);
    assert.doesNotMatch(error.message + JSON.stringify(error), new RegExp(secret));
    return true;
  });
  assert.equal(calls.at(-1), tokenUrl);
  assert.ok(calls.includes('https://xsts.auth.xboxlive.com/xsts/authorize'));
});

test('unexplained Minecraft 403 keeps uncertainty instead of diagnosing a family or app restriction', async () => {
  const { authenticator } = xboxFixture('unknown-403');
  await assert.rejects(exchange(authenticator), (error: MinecraftAuthError) => {
    assert.equal(error.stage, 'minecraft-token'); assert.equal(error.reason, undefined);
    assert.match(error.message, /未明确说明原因/); assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});

test('XSTS refusal preserves its actual stage and numeric XErr, without attempting Minecraft login', async () => {
  const { authenticator, calls } = xboxFixture('xsts');
  await assert.rejects(exchange(authenticator), (error: MinecraftAuthError) => {
    assert.equal(error.stage, 'xbox-xsts'); assert.equal(error.status, 401); assert.equal(error.xErr, 2148916238);
    assert.equal(error.reason, undefined); assert.match(error.message, /XErr 2148916238/);
    assert.doesNotMatch(error.message + JSON.stringify(error), new RegExp(secret)); return true;
  });
  assert.equal(calls.includes(tokenUrl), false);
});

test('real XMCL successful exchange still works when optional Xbox profile authorization fails', async () => {
  for (const failure of ['none', 'optional-xsts'] as const) {
    const result = await exchange(xboxFixture(failure).authenticator);
    assert.equal(result.access_token, secret); assert.equal(result.expires_in, 3600);
  }
});

test('ownership, profile and device errors remain distinct from app access approval', async () => {
  for (const [url, stage, status] of [
    [mc + '/entitlements/mcstore', 'minecraft-ownership', 403],
    [mc + '/minecraft/profile', 'minecraft-profile', 404],
    ['https://device.auth.xboxlive.com/device/authenticate', 'xbox-device', 503],
    ['https://xsts.auth.xboxlive.com/xsts/authorize', 'xbox-xsts', 503]
  ] as const) {
    const fetcher = minecraftAuthFetch(async () => reply({ errorMessage: 'Invalid app registration ' + secret }, status));
    await assert.rejects(fetcher(url), (error: MinecraftAuthError) => {
      assert.equal(error.stage, stage); assert.equal(error.status, status); assert.equal(error.reason, undefined);
      if (status === 503) assert.match(error.message, /服务繁忙/);
      assert.doesNotMatch(error.message, /提交应用访问资格申请/); assert.doesNotMatch(error.message, new RegExp(secret)); return true;
    });
  }
});

test('non-JSON HTTP failures and transport failures expose safe stage information only', async () => {
  const html = minecraftAuthFetch(async () => new Response('<html>' + secret + '</html>', { status: 403 }));
  await assert.rejects(html(tokenUrl), (error: MinecraftAuthError) => {
    assert.equal(error.status, 403); assert.equal(error.reason, undefined); assert.doesNotMatch(error.message, new RegExp(secret)); return true;
  });
  const offline = minecraftAuthFetch(async () => { throw new Error(secret); });
  await assert.rejects(offline(tokenUrl), (error: MinecraftAuthError) => {
    assert.equal(error.stage, 'minecraft-token'); assert.equal(error.status, undefined); assert.doesNotMatch(error.message, new RegExp(secret)); return true;
  });
});
