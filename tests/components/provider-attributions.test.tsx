import { expect, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { ProviderAttributions } from '@/components/provider-attributions';

test('renders provider-supplied attribution text and keeps valid links actionable', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <ProviderAttributions
        metadata={{
          attributions: [
            { text: '© Data provider', url: 'https://example.com/attribution' },
            { text: 'Local source' },
          ],
        }}
      />,
    );
  });

  const link = renderer.root.findByProps({ testID: 'provider-attributions-0' });
  expect(link.props.children).toBe('© Data provider');
  expect(link.props.accessibilityRole).toBe('link');
  expect(typeof link.props.onPress).toBe('function');
  expect(renderer.root.findByProps({ testID: 'provider-attributions-1' }).props.children)
    .toBe('Local source');
  act(() => renderer.unmount());
});

test('omits absent or malformed attribution metadata', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<ProviderAttributions metadata={{ attributions: [null, { text: ' ' }] }} />);
  });
  expect(renderer.root.findAllByProps({ testID: 'provider-attributions' })).toHaveLength(0);
  act(() => renderer.unmount());
});
