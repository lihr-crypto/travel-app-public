import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { InitializationGate } from '@/components/initialization-gate';

test('holds the app behind a loading boundary until initialization completes', async () => {
  let resolveInitialization!: () => void;
  const initialize = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveInitialization = resolve;
      }),
  );

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <InitializationGate initialize={initialize}>
        <Text testID="initialized-content">Ready</Text>
      </InitializationGate>,
    );
  });

  expect(initialize).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({ testID: 'initialization-loading' })).toBeDefined();

  await act(async () => {
    resolveInitialization();
  });

  expect(renderer.root.findByProps({ testID: 'initialized-content' })).toBeDefined();
});

test('shows a development-visible error and can retry initialization', async () => {
  const initialize = jest
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('database failed'))
    .mockResolvedValueOnce(undefined);

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <InitializationGate initialize={initialize}>
        <Text testID="initialized-content">Ready</Text>
      </InitializationGate>,
    );
  });

  expect(renderer.root.findByProps({ testID: 'initialization-error' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('database failed');

  await act(async () => {
    renderer.root.findByProps({ testID: 'initialization-retry' }).props.onPress();
  });

  expect(initialize).toHaveBeenCalledTimes(2);
  expect(renderer.root.findByProps({ testID: 'initialized-content' })).toBeDefined();
});
