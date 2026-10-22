import { z } from 'zod';
import type { Instance } from '../shared/types';
import { idSchema } from './validation';

export function orderInstances(instances: readonly Instance[], input: unknown): Instance[] {
  const ids = z.array(idSchema).max(10000).parse(input);
  const byId = new Map(instances.map(instance => [instance.id, instance]));
  if (ids.length !== instances.length || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id))) {
    throw new Error('实例列表已变化，请重新排序');
  }
  return ids.map(id => byId.get(id)!);
}
