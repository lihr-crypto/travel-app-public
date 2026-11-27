import { expect, test } from '@jest/globals';

import {
  describeDeleteFailure,
  describeUndoFailure,
} from '@/application/item/delete-feedback';

test('describes a delete failure as already-gone or retryable', () => {
  expect(describeDeleteFailure(new Error('Item not found: item-1'))).toBe(
    '该行程已不存在。',
  );
  expect(describeDeleteFailure(new Error('forced sqlite failure'))).toBe(
    '删除失败，请重试。',
  );
  expect(describeDeleteFailure('non-error rejection')).toBe(
    '删除失败，请重试。',
  );
});

test('marks a deleted-Day undo as hopeless so the snapshot is dropped', () => {
  expect(
    describeUndoFailure(new Error('Target Day no longer exists: day-1')),
  ).toEqual({ message: '无法恢复：该日程已被删除。', retryable: false });
});

test('marks an already-restored undo as hopeless', () => {
  expect(
    describeUndoFailure(new Error('Item already exists: item-1')),
  ).toEqual({ message: '该行程已恢复。', retryable: false });
});

test('marks any other undo failure as retryable', () => {
  expect(describeUndoFailure(new Error('forced sqlite failure'))).toEqual({
    message: '撤销失败，请重试。',
    retryable: true,
  });
  expect(describeUndoFailure('non-error rejection')).toEqual({
    message: '撤销失败，请重试。',
    retryable: true,
  });
});
