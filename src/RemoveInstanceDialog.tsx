import { useState } from 'react';
import type { Api, Instance, Snapshot } from '../shared/types';
import { Modal } from './Modal';
import { useTranslator } from './i18n';

export function RemoveInstanceDialog({ api, instance, close, saved }: { api: Api; instance: Instance; close: () => void; saved: (data: Snapshot) => void }) {
  const t = useTranslator();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setWorking(true); setError('');
    try { saved(await api.deleteInstance(instance.id)); } catch (error: any) { setError(error.message); } finally { setWorking(false); }
  }
  return <Modal title={t('删除实例记录')} close={close} footer={<><button onClick={close}>{t('取消')}</button><button className="primary danger" disabled={working} onClick={() => void remove()}>{t('删除记录')}</button></>}>
    <p>{t('确定删除「')}{instance.name}{t('」的启动器记录？')}</p><p>{t('存档、模组、配置和游戏目录会保留。')}</p><p className="path-text">{instance.gameDir}</p>{error && <p className="inline-error">{t(error)}</p>}
  </Modal>;
}
