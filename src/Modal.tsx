import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({ title, close, children, footer }: { title: string; close: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!; dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={e => { e.preventDefault(); close(); }}>
    <header><h2>{title}</h2><button type="button" className="modal-close" aria-label="关闭弹窗" onClick={close}><img src="./assets/modal-close.svg" alt="" /></button></header>
    <div className="modal-body">{children}</div>
    {footer && <footer>{footer}</footer>}
  </dialog>;
}
