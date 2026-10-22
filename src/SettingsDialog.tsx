import { useTranslator, LanguageProvider } from './i18n';
import { useState } from 'react';
import type { Api, JavaInstallation, Settings, Snapshot } from '../shared/types';
import { Modal } from './Modal';
export function SettingsDialog({ api, data, close, saved }: { api: Api; data: Snapshot; close: () => void; saved: (d: Snapshot) => void }) {
  const [form, setForm] = useState<Settings>({ ...data.settings });
  const t = useTranslator(form.language);
  const [password, setPassword] = useState<string>();
  const [error, setError] = useState('');
  const [java, setJava] = useState<JavaInstallation[]>([]);
  const [working, setWorking] = useState(false);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm(current => ({ ...current, [key]: value }));
  const task = async (fn: () => Promise<void>) => { setError(''); setWorking(true); try { await fn(); } catch (e: any) { setError(e.message); } finally { setWorking(false); } };
  const browse = (key: 'javaPath' | 'instancesDir') => task(async () => { const value = await api.choosePath(key === 'javaPath' ? 'java' : 'directory'); if (value) change(key, value); });
  return <LanguageProvider language={form.language}><Modal title={t("全局配置")} close={close} footer={<><button onClick={close}>{t("取消")}</button><button className="primary" disabled={working} onClick={() => void task(async () => saved(await api.saveSettings(form, password)))}>{working ? t("处理中…") : t("确定")}</button></>}>
    <form id="settings-form" className="settings-form" onSubmit={e => e.preventDefault()}>
      <div className="form-row"><label htmlFor="language">{t("界面语言")}</label><select id="language" value={form.language} onChange={e => change('language', e.target.value as Settings['language'])}><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></div>
      <p className="field-help">{t("首次启动时跟随系统语言，保存后使用所选语言。")}</p>
      <div className="form-row"><label htmlFor="java-path">{t("Java路径")}</label><div className="field-with-actions"><input id="java-path" value={form.javaPath} placeholder={t("自动选择符合版本要求的 Java")} onChange={e => change('javaPath', e.target.value)} /><button type="button" className="accent" disabled={working} onClick={() => void task(async () => { const found = await api.detectJava(); setJava(found); if (!found.length) throw new Error(t("未检测到可用 Java，请浏览选择。")); if (!form.javaPath) change('javaPath', found[0].path); })}>{t("自动检测")}</button><button type="button" className="accent" onClick={() => void browse('javaPath')}>{t("浏览")}</button></div></div>
      {!!java.length && <div className="java-results">{java.map(j => <button key={j.path} type="button" className={form.javaPath === j.path ? 'chosen' : ''} onClick={() => change('javaPath', j.path)}>Java {j.version} · {j.arch}<small>{j.path}</small></button>)}</div>}
      <div className="form-row"><label htmlFor="instances-dir">{t("实例目录")}</label><div className="field-with-actions"><input id="instances-dir" value={form.instancesDir} onChange={e => change('instancesDir', e.target.value)} /><button type="button" className="accent" onClick={() => void browse('instancesDir')}>{t("浏览")}</button></div></div>
      <p className="field-help">{t("目录修改只影响之后创建的实例。")}</p>
      <div className="memory-row"><label htmlFor="min-memory">{t("最小内存分配")}</label><div className="unit-input"><input id="min-memory" type="number" min="256" max="65536" step="256" value={form.minMemory} onChange={e => change('minMemory', Number(e.target.value))} /><span>MiB</span></div><label htmlFor="max-memory">{t("最大内存分配")}</label><div className="unit-input"><input id="max-memory" type="number" min="256" max="65536" step="256" value={form.maxMemory} onChange={e => change('maxMemory', Number(e.target.value))} /><span>MiB</span></div></div>
      <div className="form-row"><label htmlFor="jvm-args">{t("JVM参数")}</label><input id="jvm-args" value={form.jvmArgs} placeholder={t("例如 -Dfile.encoding=UTF-8")} onChange={e => change('jvmArgs', e.target.value)} /></div>
      <div className="form-row"><label htmlFor="proxy-address">{t("代理服务器")}</label><div className="proxy-row"><input id="proxy-address" disabled={!['http', 'socks5'].includes(form.proxyMode)} value={form.proxyAddress} placeholder="127.0.0.1:7890" onChange={e => change('proxyAddress', e.target.value)} /><div className="radio-group">{(['system', 'direct', 'http', 'socks5'] as const).map((mode, i) => <label key={mode}><input type="radio" name="proxy-mode" checked={form.proxyMode === mode} onChange={() => change('proxyMode', mode)} /><span className={`radio-art ${form.proxyMode === mode ? 'checked' : ''}`} /><span>{[t("默认"), t("无"), 'HTTP', 'SOCKS5'][i]}</span></label>)}</div></div></div>
      <div className="memory-row"><label htmlFor="proxy-user">{t("代理账号")}</label><input id="proxy-user" autoComplete="off" value={form.proxyUsername} onChange={e => change('proxyUsername', e.target.value)} /><label htmlFor="proxy-pass">{t("代理密码")}</label><input id="proxy-pass" type="password" autoComplete="new-password" placeholder={t("留空保留已存密码")} value={password ?? ''} onChange={e => setPassword(e.target.value)} /></div>
      <p className="field-help">{t("代理用于启动器的登录和资源请求。游戏流量使用 Java 自身网络设置。SOCKS5 暂不支持账号认证。")}</p>
      <details><summary>{t("游戏目录与应用登录配置")}</summary><div className="advanced-settings">
        <label htmlFor="client-id">{t("Microsoft 应用 Client ID")}</label><input id="client-id" value={form.clientId} placeholder={t("启动器应用的注册编号")} onChange={e => change('clientId', e.target.value.trim())} /><p className="muted">{t("应用需允许个人 Microsoft 账号及公共客户端流。此处不是玩家 ID。")}</p>
        <p>{t("已添加的 Minecraft 根目录")}</p>{form.roots.length ? form.roots.map(root => <div className="root-row" key={root}><span title={root}>{root}</span><button type="button" onClick={() => change('roots', form.roots.filter(r => r !== root))}>{t("移除引用")}</button></div>) : <p className="muted">{t("尚未发现游戏目录，可在创建实例时添加。")}</p>}
      </div></details>
      {error && <p className="inline-error" role="alert">{t(error)}</p>}
    </form>
  </Modal></LanguageProvider>;
}
