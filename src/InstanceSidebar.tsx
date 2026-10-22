import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Api, Instance, Snapshot } from '../shared/types';
import { useTranslator } from './i18n';

type Gesture = { id: string; pointer: number; x: number; y: number; startX: number; startY: number; active: boolean; order: string[]; timer?: ReturnType<typeof setTimeout> };
type Menu = { id: string; x: number; y: number };
const asset = (name: string) => `./assets/${name}.svg`;

export function InstanceSidebar({ api, data, selectedId, update, failed, edit, remove, create, settings }: {
  api: Api; data: Snapshot; selectedId?: string; update: (data: Snapshot) => void; failed: (error: unknown) => void;
  edit: (id: string) => void; remove: (id: string) => void; create: () => void; settings: () => void;
}) {
  const t = useTranslator();
  const list = useRef<HTMLDivElement>(null);
  const menuElement = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | undefined>(undefined);
  const suppressClickUntil = useRef(0);
  const saving = useRef(false);
  const [hover, setHover] = useState<{ item: Instance; top: number }>();
  const [scroll, setScroll] = useState({ top: false, bottom: false });
  const [menu, setMenu] = useState<Menu>();
  const [order, setOrder] = useState<string[]>();
  const [drag, setDrag] = useState<{ id: string; x: number; y: number }>();
  const instances = order?.map(id => data.instances.find(item => item.id === id)).filter((item): item is Instance => !!item) || data.instances;
  const menuInstance = data.instances.find(item => item.id === menu?.id);
  const menuPhase = menuInstance && data.states[menuInstance.id]?.phase;
  const menuBusy = !!menuPhase && ['checking', 'downloading', 'starting', 'running'].includes(menuPhase);

  function checkScroll() {
    const element = list.current;
    if (element) setScroll({ top: element.scrollTop > 2, bottom: element.scrollTop + element.clientHeight < element.scrollHeight - 2 });
  }
  function focusInstance(id: string) {
    const button = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[data-instance-id]') || []).find(element => element.dataset.instanceId === id);
    button?.focus({ preventScroll: true });
  }
  function dismissMenu(restore = false) {
    if (restore && menu) focusInstance(menu.id);
    setMenu(undefined);
  }
  function cancelGesture() {
    clearTimeout(gesture.current?.timer);
    if (gesture.current?.active) suppressClickUntil.current = Date.now() + 500;
    gesture.current = undefined; setDrag(undefined);
    if (!saving.current) setOrder(undefined);
  }
  async function perform(task: () => Promise<unknown>) {
    try { await task(); } catch (error) { failed(error); }
  }
  function openMenu(id: string, x: number, y: number, button: HTMLElement) {
    if (saving.current) return;
    cancelGesture(); setHover(undefined);
    const box = button.getBoundingClientRect();
    setMenu({ id, x: x || box.right + 8, y: y || box.top });
  }
  function startGesture(event: ReactPointerEvent<HTMLButtonElement>, item: Instance) {
    if (event.button !== 0 || !event.isPrimary || saving.current) return;
    event.stopPropagation(); dismissMenu(); cancelGesture();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pending: Gesture = { id: item.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, active: false, order: data.instances.map(instance => instance.id) };
    pending.timer = setTimeout(() => {
      if (gesture.current !== pending) return;
      pending.active = true; setHover(undefined);
      setOrder(pending.order); setDrag({ id: pending.id, x: pending.x, y: pending.y });
    }, 350);
    gesture.current = pending;
  }
  function moveGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.active) {
      if (Math.hypot(current.x - current.startX, current.y - current.startY) > 8) cancelGesture();
      return;
    }
    event.preventDefault(); setDrag({ id: current.id, x: current.x, y: current.y });
    updateOrder();
  }
  function updateOrder() {
    const current = gesture.current, element = list.current;
    if (!current?.active || !element) return;
    const box = element.getBoundingClientRect();
    if (current.x < box.left - 24 || current.x > box.right + 24 || current.y < box.top - 24 || current.y > box.bottom + 24) return;
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('[data-instance-id]'));
    let target = -1, distance = Infinity;
    buttons.forEach((button, index) => {
      const bounds = button.getBoundingClientRect();
      const delta = Math.abs(current.y - (bounds.top + bounds.height / 2));
      if (delta < distance) { distance = delta; target = index; }
    });
    const from = current.order.indexOf(current.id);
    if (from < 0 || target < 0 || from === target) return;
    const next = [...current.order]; next.splice(from, 1); next.splice(target, 0, current.id);
    current.order = next; setOrder(next);
  }
  function finishGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    clearTimeout(current.timer); gesture.current = undefined;
    if (!current.active) return;
    event.preventDefault(); suppressClickUntil.current = Date.now() + 500;
    setDrag(undefined); setHover(undefined);
    const box = list.current?.getBoundingClientRect();
    const inside = box && event.clientX >= box.left - 24 && event.clientX <= box.right + 24 && event.clientY >= box.top - 24 && event.clientY <= box.bottom + 24;
    if (!inside || current.order.every((id, index) => id === data.instances[index]?.id)) { setOrder(undefined); return; }
    saving.current = true;
    void perform(async () => { update(await api.reorderInstances(current.order)); }).finally(() => { saving.current = false; setOrder(undefined); });
  }
  function menuKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismissMenu(true); return; }
    if (event.key === 'Tab') { dismissMenu(); return; }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menuElement.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    const active = items.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  }

  useEffect(() => {
    checkScroll();
    const observer = new ResizeObserver(checkScroll);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, [data.instances.length]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!menuElement.current?.contains(event.target as Node)) setMenu(undefined); };
    const blur = () => { setMenu(undefined); setHover(undefined); cancelGesture(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelGesture(); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape); window.addEventListener('blur', blur);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('blur', blur); clearTimeout(gesture.current?.timer); };
  }, []);
  useEffect(() => {
    if (!drag) return;
    const timer = setInterval(() => {
      const current = gesture.current, element = list.current;
      if (!current || !element) return;
      const box = element.getBoundingClientRect();
      if (current.x < box.left - 24 || current.x > box.right + 24 || current.y < box.top - 24 || current.y > box.bottom + 24) return;
      const delta = current.y < box.top + 36 ? -12 : current.y > box.bottom - 36 ? 12 : 0;
      if (delta) { element.scrollTop += delta; updateOrder(); }
    }, 40);
    return () => clearInterval(timer);
  }, [!!drag]);
  useLayoutEffect(() => {
    if (!menu || !menuElement.current) return;
    const element = menuElement.current, box = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - box.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [menu]);
  useEffect(() => { if (menu && !menuInstance) setMenu(undefined); }, [menu, menuInstance]);

  const draggedInstance = data.instances.find(item => item.id === drag?.id);
  const icon = (item: Instance) => item.icon || data.versions.find(version => version.key === item.versionKey)?.icon || asset('grass');
  return <>
    <aside className="sidebar" aria-label={t('游戏实例')}>
      <div ref={list} className={`instance-list ${scroll.top ? 'fade-top' : ''} ${scroll.bottom ? 'fade-bottom' : ''} ${drag ? 'sorting' : ''}`} onScroll={() => { checkScroll(); setHover(undefined); setMenu(undefined); }}>
        {instances.map(item => <button key={item.id} data-instance-id={item.id} className={`instance-icon ${selectedId === item.id ? 'selected' : ''} ${drag?.id === item.id ? 'sorting-source' : ''}`} aria-label={item.name} aria-pressed={selectedId === item.id}
          onPointerDown={event => startGesture(event, item)} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={cancelGesture} onLostPointerCapture={() => { if (gesture.current) cancelGesture(); }}
          onClick={() => { if (Date.now() >= suppressClickUntil.current && !gesture.current?.active) void perform(async () => update(await api.select(item.id))); }}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openMenu(item.id, event.clientX, event.clientY, event.currentTarget); }}
          onKeyDown={event => { if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); openMenu(item.id, 0, 0, event.currentTarget); } }}
          onMouseEnter={event => { if (!gesture.current?.active && !menu) setHover({ item, top: event.currentTarget.getBoundingClientRect().top + 9 }); }} onMouseLeave={() => setHover(undefined)}
          onFocus={event => { if (!menu && event.currentTarget.matches(':focus-visible')) setHover({ item, top: event.currentTarget.getBoundingClientRect().top + 9 }); }} onBlur={() => setHover(undefined)}>
          <img src={icon(item)} alt="" draggable={false} />
        </button>)}
      </div>
      <div className="sidebar-actions"><div className="separator" /><button aria-label={t('创建实例')} title={t('创建实例')} className="add-button icon-button" onClick={create}><img src={asset('plus')} alt="" /></button>
        <button aria-label={t('全局配置')} title={t('全局配置')} className="settings-button icon-button" onClick={settings}><img src={asset('settings')} alt="" /></button></div>
    </aside>
    {hover && !menu && !drag && <div className="instance-tooltip" style={{ top: Math.min(hover.top, window.innerHeight - 90) }} role="tooltip"><img src={asset('tooltip')} alt="" /><div><strong>{hover.item.name}</strong><small>{data.versions.find(version => version.key === hover.item.versionKey)?.minecraft || t('版本未找到')} {data.versions.find(version => version.key === hover.item.versionKey)?.loader}</small></div></div>}
    {menu && menuInstance && <div ref={menuElement} className="instance-context-menu" role="menu" aria-label={`${t('实例操作')}: ${menuInstance.name}`} style={{ left: menu.x, top: menu.y }} onPointerDown={event => event.stopPropagation()} onKeyDown={menuKeys}>
      <div role="group"><button role="menuitem" disabled={menuBusy} onClick={() => { dismissMenu(true); void perform(() => api.launch(menuInstance.id)); }}>{t('启动')}</button>
        <button role="menuitem" disabled={menuBusy} onClick={() => { dismissMenu(true); edit(menuInstance.id); }}>{t('编辑')}</button></div>
      <hr role="separator" />
      <button role="menuitem" className="danger" disabled={menuBusy} onClick={() => { dismissMenu(true); remove(menuInstance.id); }}>{t('删除')}</button>
    </div>}
    {drag && draggedInstance && <div className="instance-sort-ghost" style={{ left: drag.x - 40, top: drag.y - 40 }} aria-hidden="true"><img src={icon(draggedInstance)} alt="" /></div>}
    {drag && <span className="sr-only" role="status">{t('正在调整实例顺序')}</span>}
  </>;
}
