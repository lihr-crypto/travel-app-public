import AsyncStorage from '@react-native-async-storage/async-storage';

export const AMAP_PRIVACY_POLICY_VERSION = '1';
export const AMAP_PRIVACY_CONSENT_STORAGE_KEY = '@travel-app/amap-privacy-consent';

interface AmapPrivacyConsentRecord {
  agreed: boolean;
  policyVersion: string;
  agreedAt: string | null;
}

function isAcceptedConsent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Partial<AmapPrivacyConsentRecord>;
  return record.agreed === true
    && record.policyVersion === AMAP_PRIVACY_POLICY_VERSION
    && typeof record.agreedAt === 'string'
    && Number.isFinite(Date.parse(record.agreedAt));
}

export async function hasAcceptedAmapPrivacyConsent(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(AMAP_PRIVACY_CONSENT_STORAGE_KEY);
  if (stored === null) return false;

  try {
    return isAcceptedConsent(JSON.parse(stored) as unknown);
  } catch {
    return false;
  }
}

export async function persistAmapPrivacyConsent(agreed: boolean): Promise<void> {
  const record: AmapPrivacyConsentRecord = {
    agreed,
    policyVersion: AMAP_PRIVACY_POLICY_VERSION,
    agreedAt: agreed ? new Date().toISOString() : null,
  };
  await AsyncStorage.setItem(
    AMAP_PRIVACY_CONSENT_STORAGE_KEY,
    JSON.stringify(record),
  );
}
