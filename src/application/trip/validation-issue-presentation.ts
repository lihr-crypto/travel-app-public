import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { ValidationIssue } from '@/domain/validation';

/**
 * Presentation model for one Stage-03 §6.12 issue row: the ⚠ identifier line
 * (the Item's title, falling back to a neutral label) plus the user-facing
 * message for the issue type.
 */
export interface ValidationIssueRowModel {
  issue: ValidationIssue;
  title: string;
  message: string;
}

/** Stage-03 §6.12 copy; unknown types fall back to a neutral ask-to-review. */
export function describeValidationIssue(issue: ValidationIssue): string {
  switch (issue.type) {
    case 'ITEM_OUTSIDE_TRIP_RANGE':
      return '到达时间已经超出旅行日期';
    case 'END_BEFORE_START':
      return '结束时间早于开始时间';
    case 'FIXED_ITEM_TIME_CONFLICT':
      return '固定行程时间冲突';
    case 'HOTEL_CHECKOUT_BEFORE_CHECKIN':
      return '退房时间早于入住时间';
    default:
      return '行程时间需要确认';
  }
}

/** Builds the Overview summary rows from derived issues and the Trip's Items. */
export function buildValidationIssueRows(
  issues: readonly ValidationIssue[],
  itemsById: ReadonlyMap<EntityId, Item>,
): ValidationIssueRowModel[] {
  return issues.map((issue) => ({
    issue,
    title: (issue.itemId !== null ? itemsById.get(issue.itemId)?.title : undefined)
      ?? '行程项',
    message: describeValidationIssue(issue),
  }));
}
