import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { ValidationIssueRowModel } from '@/application/trip/validation-issue-presentation';
import type { ValidationIssue } from '@/domain/validation';
import { ValidationSummary } from '@/components/validation-summary';

function issue(id: string, type: ValidationIssue['type']): ValidationIssue {
  return {
    id,
    tripId: 'trip-1',
    itemId: 'item-1',
    type,
    severity: 'warning',
    message: 'derived',
  };
}

const rows: ValidationIssueRowModel[] = [
  { issue: issue('i-1', 'ITEM_OUTSIDE_TRIP_RANGE'), title: '取车', message: '到达时间已经超出旅行日期' },
  { issue: issue('i-2', 'FIXED_ITEM_TIME_CONFLICT'), title: '林间镇', message: '固定行程时间冲突' },
];

test('renders nothing while the Trip has no warnings', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<ValidationSummary onSelectIssue={jest.fn()} rows={[]} />);
  });

  expect(renderer.root.findAllByProps({ testID: 'validation-summary' }))
    .toHaveLength(0);
  act(() => renderer.unmount());
});

test('shows the collapsed count first and expands into the issue list', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <ValidationSummary onSelectIssue={jest.fn()} rows={rows} />,
    );
  });

  expect(
    renderer.root
      .findByProps({ testID: 'validation-summary-toggle' })
      .findAllByType(Text)
      .map(({ props }) => props.children),
  ).toEqual(['⚠', '2 个行程需要确认', '⌄']);
  expect(renderer.root.findAllByProps({ testID: 'validation-issue-list' }))
    .toHaveLength(0);

  act(() => {
    renderer.root.findByProps({ testID: 'validation-summary-toggle' })
      .props.onPress();
  });
  const list = renderer.root.findByProps({ testID: 'validation-issue-list' });
  const row0 = list.findByProps({ testID: 'validation-issue-row-0' });
  const row1 = list.findByProps({ testID: 'validation-issue-row-1' });
  expect(row0.findAllByType(Text).map(({ props }) => props.children))
    .toEqual(['⚠', '取车', '到达时间已经超出旅行日期', '查看']);
  expect(row1.findAllByType(Text).map(({ props }) => props.children))
    .toEqual(['⚠', '林间镇', '固定行程时间冲突', '查看']);

  act(() => {
    renderer.root.findByProps({ testID: 'validation-summary-toggle' })
      .props.onPress();
  });
  expect(renderer.root.findAllByProps({ testID: 'validation-issue-list' }))
    .toHaveLength(0);

  act(() => renderer.unmount());
});

test('查看 hands the raw issue to the caller, who owns navigation', () => {
  const onSelectIssue = jest.fn<
    (issue: ValidationIssue) => void
  >();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <ValidationSummary onSelectIssue={onSelectIssue} rows={rows} />,
    );
  });
  act(() => {
    renderer.root.findByProps({ testID: 'validation-summary-toggle' })
      .props.onPress();
  });

  const listRows = renderer.root
    .findByProps({ testID: 'validation-issue-list' })
    .findAllByProps({ testID: 'validation-issue-row-1' });
  act(() => listRows[0].props.onPress());
  expect(onSelectIssue).toHaveBeenCalledWith(rows[1].issue);

  act(() => renderer.unmount());
});

test('without a selection intent the rows render no 查看 hint', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<ValidationSummary rows={rows} />);
  });
  act(() => {
    renderer.root.findByProps({ testID: 'validation-summary-toggle' })
      .props.onPress();
  });

  const listRow = renderer.root.findByProps({ testID: 'validation-issue-row-0' });
  expect(listRow.findAllByType(Text).map(({ props }) => props.children)).toEqual([
    '⚠',
    '取车',
    '到达时间已经超出旅行日期',
  ]);

  act(() => renderer.unmount());
});
