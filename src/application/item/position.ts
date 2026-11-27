import type { EntityId } from '@/domain/common/types';

export type ItemPosition =
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'before'; itemId: EntityId }
  | { type: 'after'; itemId: EntityId };
