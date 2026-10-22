import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { JavaInstallation } from '../shared/types';
const exec = promisify(execFile);
export async function inspectJava(file: string): Promise<JavaInstallation> {
  const executable = /javaw\.exe$/i.test(file) ? file.replace(/javaw\.exe$/i, 'java.exe') : file;
  const real = await fs.realpath(executable);
  if (!/^java(?:\.exe)?$/i.test(path.basename(real))) throw new Error('请选择 java.exe 或 javaw.exe');
  const result = await exec(real, ['-XshowSettings:properties', '-version'], { windowsHide: true, timeout: 12000, maxBuffer: 65536 });
  const text = result.stderr + result.stdout;
  const version = text.match(/(?:java\.version\s*=\s*|version\s+")([^\s"]+)/)?.[1];
  if (!version) throw new Error('无法读取此 Java 的版本');
  const major = Number(version.startsWith('1.') ? version.split('.')[1] : version.split(/[.+-]/)[0]);
  const arch = text.match(/os\.arch\s*=\s*(\S+)/)?.[1] || 'unknown';
  return { path: real, version, major, arch };
}
export async function detectJava(roots: string[]): Promise<JavaInstallation[]> {
  const candidates = new Set<string>();
  if (process.env.JAVA_HOME) candidates.add(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'));
  for (const p of (process.env.PATH || '').split(path.delimiter)) candidates.add(path.join(p, 'java.exe'));
  const search = [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Java'), path.join(process.env.ProgramFiles || 'C:/Program Files', 'Eclipse Adoptium'), path.join(process.env.ProgramFiles || 'C:/Program Files', 'Microsoft'), ...roots.map(r => path.join(r, 'runtime'))];
  async function walk(dir: string, depth: number) {
    if (!depth) return;
    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) { const sub = path.join(dir, e.name); candidates.add(path.join(sub, 'bin', 'java.exe')); await walk(sub, depth - 1); }
    }
  }
  await Promise.all(search.map(p => walk(p, 4)));
  const found: JavaInstallation[] = [];
  // Check existence first so nonexistent PATH candidates never spawn a process.
  for (const p of candidates) { try { await fs.access(p); const java = await inspectJava(p); if (!found.some(x => x.path.toLowerCase() === java.path.toLowerCase())) found.push(java); } catch { /* Candidate unavailable. */ } }
  return found.sort((a, b) => b.major - a.major);
}
