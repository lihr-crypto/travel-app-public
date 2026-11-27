/**
 * User-facing copy for the delete/undo failure paths (M11-T6). The commands
 * throw English invariant messages; the Day surface maps the reachable ones to
 * actionable copy and marks whether tapping 撤销 again can still succeed.
 */

export interface UndoFailureFeedback {
  message: string;
  /**
   * False when retrying 撤销 cannot succeed — the Day the snapshot points at is
   * gone, or the Item is already back — so the workspace drops the snapshot
   * instead of keeping a dead undo alive for the rest of the snackbar window.
   */
  retryable: boolean;
}

export function describeDeleteFailure(cause: unknown): string {
  if (cause instanceof Error && cause.message.startsWith('Item not found')) {
    return '该行程已不存在。';
  }

  return '删除失败，请重试。';
}

export function describeUndoFailure(cause: unknown): UndoFailureFeedback {
  if (
    cause instanceof Error
    && cause.message.startsWith('Target Day no longer exists')
  ) {
    return { message: '无法恢复：该日程已被删除。', retryable: false };
  }

  if (cause instanceof Error && cause.message.startsWith('Item already exists')) {
    return { message: '该行程已恢复。', retryable: false };
  }

  return { message: '撤销失败，请重试。', retryable: true };
}
