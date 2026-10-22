import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { childPath, parseJvmArgs, settingsSchema, instanceSchema } from '../electron/validation';

test('JVM options preserve quoted values and Windows backslashes', () => {
  assert.deepEqual(parseJvmArgs('-Dname="Autumn Launcher" -Dfolder="C:\\Games\\Minecraft" -XX:+UseG1GC'), ['-Dname=Autumn Launcher', '-Dfolder=C:\\Games\\Minecraft', '-XX:+UseG1GC']);
});
test('reject malformed arguments and overrides of controlled launch parameters', () => {
  for (const input of ['-Dname="unfinished', '-jar game.jar', '-cp evil', '-Xmx8G', '@arguments.txt', '-Dfoo=bar\n-jar']) assert.throws(() => parseJvmArgs(input));
});
test('resource traversal cannot escape root', () => {
  const root = path.resolve('work/test-root');
  assert.throws(() => childPath(root, '..', 'outside'));
  assert.equal(childPath(root, 'libraries', 'library.jar'), path.join(root, 'libraries', 'library.jar'));
});
test('IPC rejects bad identifiers, fields and reversed memory', () => {
  assert.equal(instanceSchema.safeParse({ id: '../x', name: 'test', versionKey: 'x' }).success, false);
  assert.equal(instanceSchema.safeParse({ name: 'test', versionKey: 'x', minMemory: 4096, maxMemory: 1024 }).success, false);
  assert.equal(instanceSchema.safeParse({ name: 'test', versionKey: 'x', command: 'anything' }).success, false);
  assert.equal(settingsSchema.safeParse({}).success, false);
});
