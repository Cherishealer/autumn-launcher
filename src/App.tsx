import { useEffect, useRef, useState } from 'react';
import type { Api, DeviceCode, Instance, Snapshot } from '../shared/types';
import { initialState } from '../shared/launch-state';
import { Modal } from './Modal';
import { SettingsDialog } from './SettingsDialog';
import { InstanceDialog } from './InstanceDialog';

const asset = (name: string) => `./assets/${name}.svg`;
export function App() {
  const api = window.launcher;
  const [data, setData] = useState<Snapshot>();
  const [modal, setModal] = useState<'create' | 'edit' | 'settings' | 'account' | 'error' | undefined>();
  const [error, setError] = useState('');
  const [device, setDevice] = useState<DeviceCode>();
  const [loggingIn, setLoggingIn] = useState(false);
  const [hover, setHover] = useState<{ item: Instance; top: number }>();
  const [scroll, setScroll] = useState({ top: false, bottom: false });
  const list = useRef<HTMLDivElement>(null);
  const selected = data?.instances.find(i => i.id === data.selectedId) || data?.instances[0];
  const version = data?.versions.find(v => v.key === selected?.versionKey);
  const state = selected ? data?.states[selected.id] || initialState() : initialState();
  const busy = ['checking', 'downloading', 'starting'].includes(state.phase);
  const run = async (task: () => Promise<unknown>) => { try { await task(); } catch (e: any) { setError(e.message); setModal('error'); } };
  function checkScroll() { const el = list.current; if (el) setScroll({ top: el.scrollTop > 2, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 2 }); }
  useEffect(() => {
    if (!api) return;
    void run(async () => setData(await api.snapshot()));
    const off = api.onSnapshot(setData); const offCode = api.onDeviceCode(setDevice);
    return () => { off(); offCode(); };
  }, []);
  useEffect(() => { checkScroll(); const resize = new ResizeObserver(checkScroll); if (list.current) resize.observe(list.current); return () => resize.disconnect(); }, [data?.instances.length]);
  if (!api) return <main className="browser-message"><h1>Autumn Launcher</h1><p>请通过桌面程序打开启动器。</p><p>在项目目录执行 npm run build，再执行 npm start。</p></main>;
  if (!data) return <main className="boot"><span className="spinner" /> 正在读取本地启动器配置…</main>;
  const close = () => setModal(undefined);
  return <main className="launcher-shell">
    <div className="scene" aria-hidden="true" /><div className="shade" aria-hidden="true" />
    <div className="drag-region" />
    <aside className="sidebar" aria-label="游戏实例">
      <div ref={list} className={`instance-list ${scroll.top ? 'fade-top' : ''} ${scroll.bottom ? 'fade-bottom' : ''}`} onScroll={() => { checkScroll(); setHover(undefined); }}>
        {data.instances.map(item => {
          const v = data.versions.find(v => v.key === item.versionKey);
          return <button key={item.id} className={`instance-icon ${selected?.id === item.id ? 'selected' : ''}`} aria-label={item.name} aria-pressed={selected?.id === item.id}
            onClick={() => void run(async () => setData(await api.select(item.id)))}
            onMouseEnter={e => setHover({ item, top: e.currentTarget.getBoundingClientRect().top + 9 })} onMouseLeave={() => setHover(undefined)}
            onFocus={e => setHover({ item, top: e.currentTarget.getBoundingClientRect().top + 9 })} onBlur={() => setHover(undefined)}>
            <img src={item.icon || v?.icon || asset('grass')} alt="" />
          </button>;
        })}
      </div>
      <div className="sidebar-actions"><div className="separator" /><button aria-label="创建实例" title="创建实例" className="add-button icon-button" onClick={() => setModal('create')}><img src={asset('plus')} alt="" /></button>
        <button aria-label="全局配置" title="全局配置" className="settings-button icon-button" onClick={() => setModal('settings')}><img src={asset('settings')} alt="" /></button></div>
    </aside>
    {hover && <div className="instance-tooltip" style={{ top: Math.min(hover.top, window.innerHeight - 90) }} role="tooltip"><img src={asset('tooltip')} alt="" /><div><strong>{hover.item.name}</strong><small>{data.versions.find(v => v.key === hover.item.versionKey)?.minecraft || '版本未找到'} {data.versions.find(v => v.key === hover.item.versionKey)?.loader}</small></div></div>}
    <div className="top-controls">
      <button className="account-button" aria-label={data.account ? `账号：${data.account.name}` : '登录微软账号'} title={data.account?.name || '登录微软账号'} onClick={() => setModal('account')}>
        {data.account?.avatar ? <img src={data.account.avatar} alt={data.account.name} /> : <span className="person-icon" aria-hidden="true" />}
      </button>
      <div className="window-controls"><button aria-label="最小化" onClick={() => void api.window('minimize')}><span className="minimize" /></button><button aria-label="关闭启动器" onClick={() => void api.window('close')}><img src={asset('close')} alt="" /></button></div>
    </div>
    <section className={`instance-info ${selected ? '' : 'empty'}`} aria-label="当前实例">
      <span className="version-badge">{selected ? version?.minecraft || '版本未找到' : 'Minecraft Java Edition'}</span>
      <div className="instance-title"><h1 title={selected?.name}>{selected?.name || '创建你的第一个实例'}</h1>{selected && <button className="edit-button" aria-label="编辑实例" onClick={() => setModal('edit')}><img src={asset('edit')} alt="" /></button>}</div>
      <p className="loader-name">{selected ? version ? `${version.loader}${version.loaderVersion ? ` ${version.loaderVersion}` : ''}` : '请重新扫描游戏目录' : '从本地已安装的游戏版本开始'}</p>
      {!selected && <button className="empty-create" onClick={() => setModal('create')}>添加实例</button>}
      {selected && <button className={`launch-status ${state.phase}`} title={state.error || state.message} aria-label="打开详细启动日志" onClick={() => void run(() => api.openLogs(selected.id))}>
        <img src={asset('status')} alt="" /><span role="status" aria-live={busy ? 'off' : 'polite'}>{state.message}</span>
      </button>}
      {state.phase === 'failed' && <button className="error-summary" onClick={() => void run(() => api.openLogs(selected!.id))}>{state.error} · 查看日志</button>}
    </section>
    <button className={`launch-button ${busy ? 'busy' : ''}`} aria-label={state.phase === 'running' ? '实例正在运行' : busy ? '正在启动游戏' : '启动游戏'} title={state.phase === 'running' ? '实例正在运行' : '启动游戏'} disabled={!selected || busy || state.phase === 'running'} onClick={() => selected && void run(() => api.launch(selected.id))}>
      {busy ? <><img className="progress-bg" src={asset('progress-bg')} alt="" /><img className="progress-track" src={asset('progress-track')} alt="" /><span className={`progress-ring ${state.progress === undefined ? 'indeterminate' : ''}`} style={{ '--progress': `${(state.progress || 0) * 360}deg` } as React.CSSProperties} /><span className="progress-number">{state.progress === undefined ? '' : <>{Math.floor(state.progress * 100)}<small>%</small></>}</span></>
        : <img src={asset(state.phase === 'running' ? 'running' : 'play')} alt="" />}
    </button>
    {modal === 'settings' && <SettingsDialog api={api} data={data} saved={d => { setData(d); close(); }} close={close} />}
    {(modal === 'create' || modal === 'edit') && <InstanceDialog api={api} data={data} instance={modal === 'edit' ? selected : undefined} saved={d => { setData(d); close(); }} update={setData} close={close} />}
    {modal === 'account' && <Modal title={data.account ? '微软正版账号' : '登录微软账号'} close={() => { if (loggingIn) void api.cancelLogin(); close(); }} footer={<>
      {data.account ? <button className="danger" onClick={() => void run(async () => { setData(await api.logout()); close(); })}>退出账号</button> : <button className="primary" disabled={loggingIn || !data.settings.clientId} onClick={() => void run(async () => { setLoggingIn(true); try { setData(await api.login()); setDevice(undefined); close(); } finally { setLoggingIn(false); } })}>{loggingIn ? '等待微软授权…' : '在浏览器中登录'}</button>}
      {loggingIn && <button onClick={() => void api.cancelLogin()}>取消登录</button>}<button onClick={close}>关闭</button></>}>
      {data.account ? <div className="account-profile">{data.account.avatar && <img src={data.account.avatar} alt="玩家头像" />}<div><h3>{data.account.name}</h3><p>Minecraft Java Edition</p><small>{data.account.id}</small></div></div> : <><p>使用拥有 Minecraft Java Edition 的 Microsoft 账号登录。授权将在微软官方页面完成。</p>
        {device && <div className="device-code"><p>在浏览器中输入此代码：</p><strong>{device.code}</strong><p>{device.uri}</p><small>授权码会过期，请及时完成登录。</small></div>}
        {!data.settings.clientId && <div className="notice">此开发版本需要配置启动器应用的 Microsoft Client ID。<button onClick={() => setModal('settings')}>打开全局配置</button></div>}
      </>}
    </Modal>}
    {modal === 'error' && <Modal title="操作未完成" close={close} footer={<button className="primary" onClick={close}>知道了</button>}><p className="error-text">{error}</p></Modal>}
  </main>;
}
