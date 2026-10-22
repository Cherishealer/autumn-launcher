import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { nativeImage } from 'electron';
import { Version, MinecraftFolder, type ResolvedVersion } from '@xmcl/core';
import { diagnoseInstallation, diagnoseVersionAssets, resolveLibraryInstallFiles, resolveAssetInstallFiles, resolveAssetMetadataInstallFiles, type InstallIssue, type InstallFile } from '@xmcl/installer';
import { childPath } from './validation';
import type { InstalledVersion } from '../shared/types';

export async function validateMetadata(root: string, id: string, seen = new Set<string>()): Promise<void> {
  if (!id || /[\\/:\0]/.test(id) || id === '.' || id === '..') throw new Error('版本 ID 包含非法路径');
  if (seen.has(id) || seen.size > 20) throw new Error('版本继承循环或层级过深');
  seen.add(id);
  const json = JSON.parse(await fs.readFile(childPath(root, 'versions', id, id + '.json'), 'utf8'));
  if (json.id !== id) throw new Error('版本 JSON 的 ID 与目录不匹配');
  if (json.inheritsFrom) await validateMetadata(root, json.inheritsFrom, seen);
  if (json.jar && (/[\\/:\0]/.test(json.jar) || ['.', '..'].includes(json.jar))) throw new Error('主程序引用路径无效');
  if (json.assetIndex?.id && /[\\/:\0]/.test(json.assetIndex.id)) throw new Error('资源索引路径无效');
  if (json.assetIndex?.sha1 && !/^[0-9a-f]{40}$/i.test(json.assetIndex.sha1)) throw new Error('资源索引哈希无效');
  if (typeof json.assets === 'string' && /[\\/:\0]/.test(json.assets)) throw new Error('资源索引路径无效');
  for (const lib of json.libraries || []) {
    for (const artifact of [lib.downloads?.artifact, ...Object.values(lib.downloads?.classifiers || {})] as any[]) if (artifact?.path) childPath(path.join(root, 'libraries'), artifact.path);
    if (typeof lib.name !== 'string' || /[\\/\0]/.test(lib.name) || lib.name.split(':').some((v: string) => v === '..' || v === '.')) throw new Error('依赖库名称无效');
  }
}
export async function resolveVersion(root: string, id: string) {
  await validateMetadata(root, id);
  const version = await Version.parse(root, id);
  for (const lib of version.libraries) childPath(path.join(root, 'libraries'), lib.download.path);
  for (const p of version.pathChain) childPath(root, path.relative(root, p));
  return version;
}
export function classify(version: ResolvedVersion): Pick<InstalledVersion, 'loader' | 'loaderVersion'> {
  const fabric = version.libraries.find(l => l.name.startsWith('net.fabricmc:fabric-loader:'));
  const forge = version.libraries.find(l => /^net\.minecraftforge:(?:forge|fmlloader):/.test(l.name));
  const neo = version.libraries.find(l => /^(net\.neoforged:neoforge|net\.neoforged:forge):/.test(l.name));
  if (neo && /(?:bootstraplauncher|modlauncher)/i.test(version.mainClass)) return { loader: 'NeoForge', loaderVersion: neo.version };
  if (forge && /(?:bootstraplauncher|modlauncher|launchwrapper)/i.test(version.mainClass)) return { loader: 'Forge', loaderVersion: forge.version };
  if (fabric && /^net\.fabricmc\./.test(version.mainClass)) return { loader: 'Fabric', loaderVersion: fabric.version };
  if (version.mainClass === 'net.minecraft.client.main.Main' && !fabric && !neo && !version.libraries.some(l => /forge|quilt|optifine/i.test(l.groupId))) return { loader: 'Vanilla' };
  return { loader: 'Unsupported' };
}
export function issueSummary(issue?: InstallIssue): string[] {
  if (!issue) return [];
  return [issue.jar && '主程序 JAR 缺失或损坏', issue.libraries?.length && `${issue.libraries.length} 个依赖库缺失或损坏`, issue.assetsIndex && '资源索引缺失或损坏', issue.assets?.length && `${issue.assets.length} 个资源文件缺失或损坏`, issue.forge && '加载器安装尚未完成，请重新运行安装器', issue.profile && '加载器处理步骤尚未完成'].filter(Boolean) as string[];
}
const indexModes = new WeakMap<ResolvedVersion, boolean>();

export async function useHashedAssetIndex(version: ResolvedVersion): Promise<boolean> {
  if (!version.assetIndex?.sha1) return false;
  const conventional = childPath(version.minecraftDirectory, 'assets', 'indexes', version.assets + '.json');
  const data = await fs.readFile(conventional).catch(() => undefined);
  const matches = !!data && createHash('sha1').update(data).digest('hex') === version.assetIndex.sha1;
  // Asset index IDs are reused by multiple releases. Keep a mismatched existing
  // index intact and materialize this version's verified index under its hash.
  const byHash = !matches;
  indexModes.set(version, byHash);
  return byHash;
}

export async function diagnoseVersion(version: ResolvedVersion, strict: boolean) {
  const issue = { ...await diagnoseInstallation(version, { strict }) };
  delete issue.assets; delete issue.assetsIndex;
  Object.assign(issue, await diagnoseVersionAssets(version, { strict, useHashForAssetsIndex: await useHashedAssetIndex(version) }));
  return Object.keys(issue).length ? issue : undefined;
}

function clientInstallFile(version: ResolvedVersion): InstallFile | undefined {
  const client = version.downloads.client;
  if (!client || !/^[0-9a-f]{40}$/i.test(client.sha1 || '') || !client.size || client.size < 1) return;
  try { if (new URL(client.url).protocol !== 'https:') return; } catch { return; }
  return { path: childPath(version.minecraftDirectory, 'versions', version.minecraftVersion, version.minecraftVersion + '.jar'), urls: [client.url], size: client.size, checksum: { algorithm: 'sha1', value: client.sha1 } };
}

async function canRepair(version: ResolvedVersion, issue: InstallIssue): Promise<boolean> {
  if (issue.forge || issue.profile || (issue.jar && !clientInstallFile(version))) return false;
  const files = repairFiles(version, issue);
  if (!files.length) return false;
  // Only missing files can be repaired automatically. Existing corrupt files
  // require the original installer; no existing game data is overwritten.
  for (const file of files) if (await fs.stat(file.path).then(() => true).catch(() => false)) return false;
  return true;
}

export async function scanVersions(roots: string[]): Promise<{ versions: InstalledVersion[]; errors: string[] }> {
  const versions: InstalledVersion[] = []; const errors: string[] = [];
  for (const candidate of [...new Set(roots.map(r => path.resolve(r)))]) {
    let root: string;
    try { root = await fs.realpath(candidate); } catch { errors.push(`游戏目录不存在：${candidate}`); continue; }
    let entries;
    try { entries = await fs.readdir(path.join(root, 'versions'), { withFileTypes: true }); }
    catch { errors.push(`未找到 versions 目录：${root}`); continue; }
    for (const entry of entries.filter(e => e.isDirectory() && !e.isSymbolicLink())) {
      const item: InstalledVersion = { key: JSON.stringify([root, entry.name]), root, id: entry.name, minecraft: entry.name, loader: 'Unsupported', javaMajor: 21, runnable: false, repairable: false, issues: [] };
      try {
        const resolved = await resolveVersion(root, entry.name);
        Object.assign(item, classify(resolved));
        item.minecraft = resolved.minecraftVersion;
        item.javaMajor = resolved.javaVersion?.majorVersion || 17;
        const supportedRuntime = item.javaMajor >= 17;
        if (!supportedRuntime) item.issues.push('此旧版本需要的启动链尚未适配');
        if (item.loader === 'Unsupported') item.issues.push('无法确认加载器或主类，暂不支持此自定义版本');
        const issue = await diagnoseVersion(resolved, false);
        item.issues.push(...issueSummary(issue));
        item.repairable = supportedRuntime && item.loader !== 'Unsupported' && !!issue && await canRepair(resolved, issue);
        item.runnable = item.issues.length === 0;
        for (const icon of [path.join(root, 'versions', entry.name, 'icon.png'), path.join(root, 'versions', entry.name, entry.name + '.png'), path.join(root, 'icon.png')]) {
          try { const stat = await fs.stat(icon); if (stat.size > 4 * 1024 * 1024) continue; const image = nativeImage.createFromPath(icon); if (!image.isEmpty()) { item.icon = image.resize({ width: 64, height: 64 }).toDataURL(); break; } } catch { /* Use bundled fallback. */ }
        }
      } catch (e: any) { item.issues.push(e.code === 'ENOENT' ? '版本 JSON 或继承版本不存在' : e.message || '版本元数据无法解析'); }
      versions.push(item);
    }
  }
  return { versions: versions.sort((a, b) => b.minecraft.localeCompare(a.minecraft, undefined, { numeric: true })), errors };
}
export function repairFiles(version: ResolvedVersion, issue: InstallIssue): InstallFile[] {
  const folder = new MinecraftFolder(version.minecraftDirectory);
  return [
    ...(issue.jar && clientInstallFile(version) ? [clientInstallFile(version)!] : []),
    ...resolveLibraryInstallFiles(issue.libraries || [], folder),
    ...resolveAssetInstallFiles(issue.assets || [], folder),
    ...(issue.assetsIndex ? resolveAssetMetadataInstallFiles(version, folder, { useHashForAssetsIndex: indexModes.get(version) ?? true }).filter(file => path.dirname(file.path) === path.join(version.minecraftDirectory, 'assets', 'indexes')) : [])
  ];
}
