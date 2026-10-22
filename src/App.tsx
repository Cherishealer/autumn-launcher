import { LanguageProvider } from './i18n';
import { useEffect, useRef, useState } from 'react';
import type { DeviceCode, Snapshot } from '../shared/types';
import { initialState } from '../shared/launch-state';
import { translate, systemLanguage } from '../shared/i18n';
import { Modal } from './Modal';
import { SettingsDialog } from './SettingsDialog';
import { InstanceDialog } from './InstanceDialog';
import { InstanceSidebar } from './InstanceSidebar';
import { RemoveInstanceDialog } from './RemoveInstanceDialog';

const asset = (name: string) => `./assets/${name}.svg`;
export function App() {
  const api = window.launcher;
  const [data, setData] = useState<Snapshot>();
  const language = data?.settings.language || systemLanguage(navigator.language);
  const t = (text: string) => translate(text, language);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const [modal, setModal] = useState<'create' | 'edit' | 'settings' | 'account' | 'error' | 'remove' | undefined>();
  const [error, setError] = useState('');
  const [device, setDevice] = useState<DeviceCode>();
  const [loggingIn, setLoggingIn] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const openEdit = (id: string) => { setEditingId(id); setModal('edit'); };
  const openRemove = (id: string) => { setEditingId(id); setModal('remove'); };
  const dragPointer = useRef<number | undefined>(undefined);
  const stopWindowDrag = () => {
    if (dragPointer.current === undefined) return;
    dragPointer.current = undefined;
    void api?.window('drag-stop').catch(() => {});
  };
  const startWindowDrag = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as Element;
    if (event.button !== 0 || !event.isPrimary || target.closest('button,input,select,textarea,a,summary,[role="button"],.modal-body,.device-code,.path-text,.root-row,.account-profile,.instance-list.fade-top,.instance-list.fade-bottom')) return;
    dragPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    void api?.window('drag-start', { x: event.clientX, y: event.clientY }).catch(stopWindowDrag);
  };
  const selected = data?.instances.find(i => i.id === data.selectedId) || data?.instances[0];
  const modalInstance = editingId ? data?.instances.find(item => item.id === editingId) : selected;
  const version = data?.versions.find(v => v.key === selected?.versionKey);
  const state = selected ? data?.states[selected.id] || initialState() : initialState();
  const busy = ['checking', 'downloading', 'starting'].includes(state.phase);
  const run = async (task: () => Promise<unknown>) => { try { await task(); } catch (e: any) { setError(e.message); setModal('error'); } };
  useEffect(() => {
    if (!api) return;
    void run(async () => setData(await api.snapshot()));
    const off = api.onSnapshot(setData); const offCode = api.onDeviceCode(setDevice);
    return () => { off(); offCode(); };
  }, []);
  if (!api) return <main className="browser-message"><h1>Autumn Launcher</h1><p>{t("请通过桌面程序打开启动器。")}</p><p>{t("在项目目录执行 npm run build，再执行 npm start。")}</p></main>;
  if (!data) return <main className="boot"><span className="spinner" />{t("正在读取本地启动器配置…")}</main>;
  const close = () => setModal(undefined);
  return <LanguageProvider language={language}><main className="launcher-shell" onPointerDown={startWindowDrag} onPointerUp={stopWindowDrag} onPointerCancel={stopWindowDrag} onLostPointerCapture={stopWindowDrag}>
    <div className="scene" aria-hidden="true" /><div className="shade" aria-hidden="true" />
    <div className="window-drag-surface" aria-hidden="true" />
    
    <InstanceSidebar api={api} data={data} selectedId={selected?.id} update={setData} failed={e => { setError(e instanceof Error ? e.message : String(e)); setModal('error'); }} edit={openEdit} remove={openRemove} create={() => setModal('create')} settings={() => setModal('settings')} />
    <div className="top-controls">
      <button className="account-button" aria-label={data.account ? (t("账号：") + (data.account.name)) : t("登录微软账号")} title={data.account?.name || t("登录微软账号")} onClick={() => setModal('account')}>
        {data.account?.avatar ? <img src={data.account.avatar} alt={data.account.name} /> : <span className="person-icon" aria-hidden="true" />}
      </button>
      <div className="window-controls"><button aria-label={t("最小化")} onClick={() => void api.window('minimize')}><span className="minimize" /></button><button aria-label={t("关闭启动器")} onClick={() => void api.window('close')}><img src={asset('close')} alt="" /></button></div>
    </div>
    <section className={`instance-info ${selected ? '' : 'empty'}`} aria-label={t("当前实例")}>
      <span className="version-badge">{selected ? version?.minecraft || t("版本未找到") : 'Minecraft Java Edition'}</span>
      <div className="instance-title"><h1 title={selected?.name}>{selected ? <button className="instance-name-button" onClick={() => selected && openEdit(selected.id)} aria-label={t("编辑实例") + ": " + selected.name}>{selected.name}</button> : t("创建你的第一个实例")}</h1>{selected && <button className="edit-button" aria-label={t("编辑实例")} onClick={() => selected && openEdit(selected.id)}><img src={asset('edit')} alt="" /></button>}</div>
      <p className="loader-name">{selected ? version ? `${version.loader}${version.loaderVersion ? ` ${version.loaderVersion}` : ''}` : t("请重新扫描游戏目录") : t("从本地已安装的游戏版本开始")}</p>
      {!selected && <button className="empty-create" onClick={() => setModal('create')}>{t("添加实例")}</button>}
      {selected && <button className={`launch-status ${state.phase}`} title={t(state.error || state.message)} aria-label={t("打开详细启动日志")} onClick={() => void run(() => api.openLogs(selected.id))}>
        <img src={asset('status')} alt="" /><span role="status" aria-live={busy ? 'off' : 'polite'}>{state.message}</span>
      </button>}
      {state.phase === 'failed' && <button className="error-summary" onClick={() => void run(() => api.openLogs(selected!.id))}>{t(state.error || '')}{t("· 查看日志")}</button>}
    </section>
    <button className={`launch-button ${busy ? 'busy' : ''}`} aria-label={state.phase === 'running' ? t("实例正在运行") : busy ? t("正在启动游戏") : t("启动游戏")} title={state.phase === 'running' ? t("实例正在运行") : t("启动游戏")} disabled={!selected || busy || state.phase === 'running'} onClick={() => selected && void run(() => api.launch(selected.id))}>
      {busy ? <><img className="progress-bg" src={asset('progress-bg')} alt="" /><img className="progress-track" src={asset('progress-track')} alt="" /><span className={`progress-ring ${state.progress === undefined ? 'indeterminate' : ''}`} style={{ '--progress': `${(state.progress || 0) * 360}deg` } as React.CSSProperties} /><span className="progress-number">{state.progress === undefined ? '' : <>{Math.floor(state.progress * 100)}<small>%</small></>}</span></>
        : <img src={asset(state.phase === 'running' ? 'running' : 'play')} alt="" />}
    </button>
    {modal === 'settings' && <SettingsDialog api={api} data={data} saved={d => { setData(d); close(); }} close={close} />}
    {(modal === 'create' || modal === 'edit') && <InstanceDialog api={api} data={data} instance={modal === 'edit' ? modalInstance : undefined} saved={d => { setData(d); close(); }} update={setData} close={close} />}
    {modal === 'remove' && modalInstance && <RemoveInstanceDialog api={api} instance={modalInstance} saved={d => { setData(d); close(); }} close={close} />}
    {modal === 'account' && <Modal title={data.account ? t("微软正版账号") : t("登录微软账号")} close={() => { if (loggingIn) void api.cancelLogin(); close(); }} footer={<>
      {data.account ? <button className="danger" onClick={() => void run(async () => { setData(await api.logout()); close(); })}>{t("退出账号")}</button> : <button className="primary" disabled={loggingIn || !data.settings.clientId} onClick={() => void run(async () => { setLoggingIn(true); try { setData(await api.login()); setDevice(undefined); close(); } finally { setLoggingIn(false); } })}>{loggingIn ? t("等待微软授权…") : t("在浏览器中登录")}</button>}
      {loggingIn && <button onClick={() => void api.cancelLogin()}>{t("取消登录")}</button>}<button onClick={close}>{t("关闭")}</button></>}>
      {data.account ? <div className="account-profile">{data.account.avatar && <img src={data.account.avatar} alt={t("玩家头像")} />}<div><h3>{data.account.name}</h3><p>Minecraft Java Edition</p><small>{data.account.id}</small></div></div> : <><p>{t("使用拥有 Minecraft Java Edition 的 Microsoft 账号登录。授权将在微软官方页面完成。")}</p>
        {device && <div className="device-code"><p>{t("在浏览器中输入此代码：")}</p><strong>{device.code}</strong><p>{device.uri}</p><small>{t("授权码会过期，请及时完成登录。")}</small></div>}
        {!data.settings.clientId && <div className="notice">{t("此开发版本需要配置启动器应用的 Microsoft Client ID。")}<button onClick={() => setModal('settings')}>{t("打开全局配置")}</button></div>}
      </>}
    </Modal>}
    {modal === 'error' && <Modal title={t("操作未完成")} close={close} footer={<button className="primary" onClick={close}>{t("知道了")}</button>}><p className="error-text">{t(error)}</p></Modal>}
  </main></LanguageProvider>;
}
