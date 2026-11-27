import type { EntityId } from './common/types';

export interface ValidationIssue {
  id: EntityId;
  tripId: EntityId;
  itemId: EntityId | null;
  type: string;
  severity: 'warning';
  message: string;
}
