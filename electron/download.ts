import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { InstallFile } from '@xmcl/installer';
import type { Network } from './network';
import { childPath } from './validation';

// XMCL resolves dependency names, inherited versions and checksums. This adapter
// only transfers the missing files through Electron's configured network session.
export async function downloadMissing(files: InstallFile[], root: string, network: Network, progress: (done: number, total: number, file: string) => void) {
  const unique = [...new Map(files.map(f => [f.path, f])).values()];
  let done = 0; progress(0, unique.length, '');
  for (const file of unique) {
    childPath(root, path.relative(root, file.path));
    try { await fs.lstat(file.path); throw new Error(`已有资源损坏，未覆盖原文件：${file.path}。请用原安装器修复。`); }
    catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    const parent = await fs.realpath(path.dirname(file.path));
    childPath(await fs.realpath(root), path.relative(root, parent));
    const temporary = path.join(parent, `.autumn-download-${randomUUID()}.tmp`);
    let error: unknown; let completed = false;
    for (const rawUrl of file.urls) {
      const url = new URL(rawUrl); if (url.protocol !== 'https:' || url.username || url.password) continue;
      try {
        const response = await network.fetch(url.href, { signal: AbortSignal.timeout(180000) });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        if (new URL(response.url).protocol !== 'https:') throw new Error('下载地址跳转到不安全连接');
        const handle = await fs.open(temporary, 'wx'); let bytes = 0;
        const hash = createHash(file.checksum?.algorithm || 'sha1');
        try { for await (const chunk of response.body as any) { const buffer = Buffer.from(chunk); bytes += buffer.length; hash.update(buffer); await handle.write(buffer); } }
        finally { await handle.close(); }
        if (file.size !== undefined && bytes !== file.size) throw new Error('下载文件大小不符');
        if (file.checksum && hash.digest('hex').toLowerCase() !== file.checksum.value.toLowerCase()) throw new Error('下载文件校验失败');
        // COPYFILE_EXCL avoids replacing an existing file, including a symlink.
        await fs.copyFile(temporary, file.path, 1); await fs.rm(temporary, { force: true });
        completed = true; error = undefined; break;
      } catch (e) { error = e; await fs.rm(temporary, { force: true }); }
    }
    if (!completed) throw new Error(`资源下载失败：${path.basename(file.path)}${error instanceof Error ? `（${error.message}）` : ''}`);
    progress(++done, unique.length, path.basename(file.path));
  }
}
