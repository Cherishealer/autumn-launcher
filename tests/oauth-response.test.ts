import { test } from 'node:test';
import assert from 'node:assert/strict';
import { microsoftResponse, readDeviceCode } from '../electron/oauth-response';
const endpoint = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
test('malformed and untrusted verification addresses are rejected with clear errors', () => {
  for (const uri of [undefined, '', 'not-a-url', 'http://microsoft.com/devicelogin', 'https://microsoft.com.evil.example/link', 'https://user:pass@microsoft.com/link']) {
    assert.throws(() => readDeviceCode({ userCode: 'TEST', verificationUri: uri, expiresIn: 900 }), error => error instanceof Error && !error.message.includes('Invalid URL'));
  }
});
test('an error response with HTTP 200 is still handled as an error', () => {
  assert.throws(() => microsoftResponse(endpoint, 200, { error: 'invalid_client', error_codes: [70002] }), /AADSTS70002/);
});
test('OAuth diagnostics do not expose raw response descriptions, identities or tokens', () => {
  assert.throws(() => microsoftResponse(endpoint, 401, { error: 'invalid_client', error_description: 'AADSTS70002 sensitive-token someone@example.com' }), error => {
    assert.ok(error instanceof Error); assert.match(error.message, /AADSTS70002/);
    assert.doesNotMatch(error.message, /sensitive-token|someone@example.com/); return true;
  });
});
test('normal token polling responses pass through to MSAL unchanged', () => {
  const pending = { error: 'authorization_pending' };
  const token = endpoint.replace('/devicecode', '/token');
  assert.equal(microsoftResponse(token, 400, pending), pending);
  const slowdown = { error: 'slow_down' }; assert.equal(microsoftResponse(token, 400, slowdown), slowdown);
});
test('invalid device session data is rejected before the SDK starts polling', () => {
  assert.throws(() => microsoftResponse(endpoint, 200, { user_code: 'TEST', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900 }), /缺少设备会话信息/);
  assert.throws(() => readDeviceCode({ userCode: 'TEST', verificationUri: 'https://microsoft.com/devicelogin', expiresIn: -1 }), /有效期无效/);
});
