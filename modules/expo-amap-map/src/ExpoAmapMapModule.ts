import { requireNativeModule } from 'expo';

interface NativeAmapMapModule {
  setPrivacyStatusAsync(
    shown: boolean,
    includesAmap: boolean,
    agreed: boolean,
  ): Promise<boolean>;
}

/** Call only after recording the user's actual privacy choice. */
export function setAmapPrivacyStatus(input: {
  shown: boolean;
  includesAmap: boolean;
  agreed: boolean;
}): Promise<boolean> {
  const native = requireNativeModule<NativeAmapMapModule>('ExpoAmapMap');
  return native.setPrivacyStatusAsync(
    input.shown,
    input.includesAmap,
    input.agreed,
  );
}
