import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { systemLanguage, translate } from '../shared/i18n';
import { Store } from '../electron/storage';

test('Chinese system languages default to Chinese; every other system defaults to English', () => {
  for (const locale of ['zh', 'zh-CN', 'zh-TW', 'zh-Hant', 'zh_HK']) assert.equal(systemLanguage(locale), 'zh-CN');
  for (const locale of ['en-US', 'ja-JP', 'de', 'fr-FR', '']) assert.equal(systemLanguage(locale), 'en-US');
});

test('language defaults migrate old settings and explicit choices survive a different system language', async () => {
  const scratch = path.resolve('node_modules');
  const temp = await mkdtemp(path.join(scratch, 'autumn-language-'));
  try {
    const first = new Store(temp, 'ja-JP'); await first.init();
    assert.equal(first.config.settings.language, 'en-US');
    await first.save();
    const legacy = JSON.parse(await readFile(path.join(temp, 'config.json'), 'utf8'));
    delete legacy.settings.language;
    await writeFile(path.join(temp, 'config.json'), JSON.stringify(legacy));
    const migrated = new Store(temp, 'zh-TW'); await migrated.init();
    assert.equal(migrated.config.settings.language, 'zh-CN');
    migrated.config.settings.language = 'en-US'; await migrated.save();
    const reopened = new Store(temp, 'zh-CN'); await reopened.init();
    assert.equal(reopened.config.settings.language, 'en-US');
  } finally {
    assert.equal(path.dirname(temp), scratch);
    await rm(temp, { recursive: true, force: true });
  }
});

test('English covers composed authorization errors without changing user names or raw game output', () => {
  const error = 'Minecraft 登录失败（HTTP 403）。服务返回 Invalid app registration：此启动器的 Client ID 尚未获准访问 Minecraft API，需要提交应用访问资格申请；重复授权账号无法解决。';
  const english = translate(error, 'en-US');
  assert.match(english, /Minecraft sign-in failed/); assert.match(english, /HTTP 403/);
  assert.doesNotMatch(english, /[\u3400-\u9fff]/);
  assert.equal(translate('游戏异常退出（退出码 1）。请查看详细日志。', 'en-US'), 'Game exited abnormally (exit code  1). See the detailed log.');
  assert.equal(translate('Instance is Running.', 'en-US'), 'Instance is Running.');
  assert.equal(translate(error, 'zh-CN'), error);
});
