import { useTranslator } from './i18n';
import { useState } from 'react';
import type { Api, Instance, InstanceInput, Snapshot } from '../shared/types';
import { Modal } from './Modal';
import { RemoveInstanceDialog } from './RemoveInstanceDialog';
export function InstanceDialog({ api, data, instance, close, saved, update }: { api: Api; data: Snapshot; instance?: Instance; close: () => void; saved: (d: Snapshot) => void; update: (d: Snapshot) => void }) {
  const t = useTranslator();
  const [form, setForm] = useState<InstanceInput>({ id: instance?.id, name: instance?.name || '', versionKey: instance?.versionKey || (data.versions.find(v => v.runnable) || data.versions.find(v => v.repairable))?.key || '', gameDir: instance?.gameDir, javaPath: instance?.javaPath, minMemory: instance?.minMemory, maxMemory: instance?.maxMemory });
  const [error, setError] = useState(''); const [working, setWorking] = useState(false); const [confirm, setConfirm] = useState(false);
  const version = data.versions.find(v => v.key === form.versionKey);
  const change = <K extends keyof InstanceInput>(key: K, value: InstanceInput[K]) => setForm(f => ({ ...f, [key]: value }));
  const task = async (fn: () => Promise<void>) => { setError(''); setWorking(true); try { await fn(); } catch (e: any) { setError(e.message); } finally { setWorking(false); } };
  const browse = () => task(async () => { const parent = await api.choosePath('directory'); if (parent) change('gameDir', parent + '\\' + (form.name.replace(/[<>:"/\\|?*]/g, '').trim() || 'Minecraft') + '-' + Date.now()); });
  if (confirm && instance) return <RemoveInstanceDialog api={api} instance={instance} close={() => setConfirm(false)} saved={saved} />;
  return <Modal title={instance ? t("编辑实例") : t("创建实例")} close={close} footer={<>{instance && <button className="danger delete-instance" onClick={() => setConfirm(true)}>{t("删除记录")}</button>}<button onClick={close}>{t("取消")}</button><button className="primary" disabled={working || !form.name.trim() || !instance && !version?.runnable && !version?.repairable} onClick={() => void task(async () => saved(await api.saveInstance(form)))}>{working ? t("处理中…") : instance ? t("保存") : t("创建")}</button></>}>
    <div className="instance-form">
      <div className="form-row"><label htmlFor="instance-name">{t("实例名称")}</label><input id="instance-name" autoFocus maxLength={80} value={form.name} placeholder={t("给这段冒险取个名字")} onChange={e => change('name', e.target.value)} /></div>
      <div className="form-row"><label htmlFor="game-version">{t("游戏版本")}</label><select id="game-version" disabled={!!instance} value={form.versionKey} onChange={e => change('versionKey', e.target.value)}><option value="">{t("选择已安装的游戏版本")}</option>{data.versions.map(v => <option key={v.key} value={v.key} disabled={!v.runnable && !v.repairable}>{v.id} · {v.loader}{v.runnable ? '' : v.repairable ? t(' · 启动时补齐文件') : t(' · 暂不支持或需原安装器修复')}</option>)}</select></div>
      {version && <div className="version-details"><span>{version.minecraft} · {version.loader} {version.loaderVersion} · Java {version.javaMajor}</span><small>{version.root}</small>{version.repairable && <p className="notice">{t('此版本可以选择。首次启动将校验并下载缺失的客户端、依赖或资源，下载量可能较大。')}</p>}</div>}
      {!instance && <><div className="scan-actions"><button className="accent" disabled={working} onClick={() => void task(async () => update(await api.addRoot()))}>{t("添加游戏根目录")}</button><button disabled={working} onClick={() => void task(async () => update(await api.scan()))}>{working ? t("处理中…") : t("重新扫描")}</button></div>
        {!data.versions.some(v => v.runnable || v.repairable) && <p className="notice">{t("未找到完整可用的 Minecraft 版本。请添加包含 versions、libraries 和 assets 的游戏根目录，或先用原安装器完成安装。")}</p>}
        {!!data.versions.filter(v => !v.runnable && !v.repairable).length && <details className="scan-issues"><summary>{t("查看不可运行的版本（")}{data.versions.filter(v => !v.runnable && !v.repairable).length}{t("）")}</summary>{data.versions.filter(v => !v.runnable && !v.repairable).map(v => <p key={v.key}><strong>{v.id}</strong><br />{v.issues.map(t).join('; ')}</p>)}</details>}
        {data.scanErrors.map(text => <p className="inline-error" key={text}>{t(text)}</p>)}
      </>}
      <div className="form-row"><label htmlFor="game-directory">{t("实例目录")}</label><div className="field-with-actions"><input id="game-directory" disabled={!!instance} value={form.gameDir || ''} placeholder={t("自动创建独立目录")} onChange={e => change('gameDir', e.target.value || undefined)} />{!instance && <button className="accent" onClick={() => void browse()}>{t("浏览")}</button>}</div></div>
      {!instance && <p className="field-help">{t("默认位置：")}{data.settings.instancesDir}{t("。每个实例单独存储 mods、config 和 saves。")}</p>}
      <div className="form-row"><label>{t("实例图标")}</label><div className="icon-field"><img src={instance?.icon || version?.icon || './assets/grass.svg'} alt={t("实例图标")} /><div><p>{instance?.icon ? t("自定义图标") : t("版本图标 / 默认 Minecraft 图标")}</p>{instance ? <button className="accent" disabled={working} onClick={() => void task(async () => update(await api.chooseIcon(instance.id)))}>{t("更换图标")}</button> : <small>{t("创建后可在编辑实例中上传自定义图标。")}</small>}</div></div></div>
      <div className="form-row"><label htmlFor="instance-java">{t("Java覆盖")}</label><div className="field-with-actions"><input id="instance-java" value={form.javaPath || ''} placeholder={t("使用全局设置")} onChange={e => change('javaPath', e.target.value || undefined)} /><button className="accent" onClick={() => void task(async () => { const p = await api.choosePath('java'); if (p) change('javaPath', p); })}>{t("浏览")}</button></div></div>
      <div className="memory-row"><label htmlFor="instance-min">{t("最小内存")}</label><input id="instance-min" type="number" placeholder={((data.settings.minMemory) + t(" MiB（全局）"))} min={256} max={65536} value={form.minMemory ?? ''} onChange={e => change('minMemory', e.target.value ? Number(e.target.value) : undefined)} /><label htmlFor="instance-max">{t("最大内存")}</label><input id="instance-max" type="number" placeholder={((data.settings.maxMemory) + t(" MiB（全局）"))} min={256} max={65536} value={form.maxMemory ?? ''} onChange={e => change('maxMemory', e.target.value ? Number(e.target.value) : undefined)} /></div>
      {instance && <button onClick={() => void task(() => api.openFolder(instance.id))}>{t("打开实例文件夹")}</button>}
      {error && <p className="inline-error" role="alert">{t(error)}</p>}
    </div>
  </Modal>;
}
