import { z } from 'zod';
import path from 'node:path';

const absolutePath = z.string().max(4096).refine(p => path.isAbsolute(p) && !p.includes('\0'), '需要有效的绝对路径');
const memory = z.number().int().min(256).max(65536);
export const idSchema = z.string().uuid();
export const instanceSchema = z.object({
  id: idSchema.optional(), name: z.string().trim().min(1).max(80), versionKey: z.string().min(1).max(8192),
  gameDir: absolutePath.optional(), javaPath: z.union([absolutePath, z.literal('')]).optional(),
  minMemory: memory.optional(), maxMemory: memory.optional()
}).strict().refine(v => v.minMemory === undefined || v.maxMemory === undefined || v.minMemory <= v.maxMemory, '最小内存不能大于最大内存');
export const settingsSchema = z.object({
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  javaPath: z.union([absolutePath, z.literal('')]), instancesDir: absolutePath,
  minMemory: memory, maxMemory: memory, jvmArgs: z.string().max(8000),
  clientId: z.union([z.string().uuid(), z.literal('')]), roots: z.array(absolutePath).max(30),
  proxyMode: z.enum(['system', 'direct', 'http', 'socks5']), proxyAddress: z.string().max(2048), proxyUsername: z.string().max(256)
}).strict().refine(v => v.minMemory <= v.maxMemory, '最小内存不能大于最大内存');

export function parseJvmArgs(input: string): string[] {
  const args: string[] = []; let arg = ''; let quote = ''; let started = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '\0' || c === '\n' || c === '\r') throw new Error('JVM 参数不能包含换行或空字符');
    if ((c === '"' || c === "'") && (!quote || quote === c)) { quote = quote ? '' : c; started = true; }
    else if (/\s/.test(c) && !quote) { if (started) args.push(arg); arg = ''; started = false; }
    else { arg += c; started = true; }
  }
  if (quote) throw new Error('JVM 参数的引号未闭合');
  if (started) args.push(arg);
  if (args.some(a => !a.startsWith('-') || /^-(?:jar|cp|classpath|p|m)$|^--(?:class-path|module|module-path)(?:=|$)|^-Xm[sx]|^@/.test(a))) throw new Error('仅允许独立 JVM 选项；内存请使用内存设置，不能覆盖主类或类路径');
  return args;
}
export function childPath(root: string, ...parts: string[]): string {
  const result = path.resolve(root, ...parts);
  const relative = path.relative(path.resolve(root), result);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('资源路径超出游戏目录');
  return result;
}
