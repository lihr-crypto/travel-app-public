import type { EntityId } from '@/domain/common/types';
import type { ValidationIssue } from '@/domain/validation';

export interface CommandResult<T> {
  data: T;
  affectedEntityIds: EntityId[];
  validationIssues: ValidationIssue[];
}
