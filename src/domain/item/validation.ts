import type {
  CustomPayload,
  HotelPayload,
  ItemPayload,
  ItemType,
  TransportMode,
  TransportPayload,
} from './types';

const CUSTOM_ITEM_LABEL_MAX_LENGTH = 20;

const TRANSPORT_MODES: readonly TransportMode[] = [
  'flight',
  'train',
  'bus',
  'ferry',
  'car',
];

const ITEM_TYPES: readonly ItemType[] = [
  'sightseeing',
  'food',
  'hotel',
  'activity',
  'transport',
  'custom',
];

export function assertItemType(type: ItemType) {
  if (!ITEM_TYPES.includes(type)) {
    throw new RangeError(`Invalid Item type: ${type}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadMismatch(type: ItemType): never {
  throw new RangeError(`Item payload does not match type: ${type}`);
}

/** Validates payload ownership and returns the canonical persisted form. */
export function normalizeItemPayload(
  type: ItemType,
  payload: unknown,
): ItemPayload | null {
  assertItemType(type);

  if (payload === null) {
    return null;
  }

  if (!isRecord(payload)) {
    throw new RangeError('Invalid Item payload');
  }

  if (type === 'hotel') {
    /*
     * Stage-02 §11.3: a Hotel is one cross-day Item whose check-in/check-out
     * live in the canonical start/endDateTime fields, so the payload carries
     * no data of its own and only marks the semantic type.
     */
    if (
      payload.kind !== 'hotel'
      || Object.keys(payload).some((key) => key !== 'kind')
    ) {
      return payloadMismatch(type);
    }

    return { kind: 'hotel' } satisfies HotelPayload;
  }

  if (type === 'transport') {
    /*
     * Stage-02 §11.4 + Stage-05 M9: origin/destination stay strings, canonical
     * departure/arrival live in start/endDateTime, and PNR/cabin/seat/fare are
     * deliberately out of V1 scope.
     */
    if (payload.kind !== 'transport') {
      return payloadMismatch(type);
    }
    if (
      Object.keys(payload).some(
        (key) => key !== 'kind'
          && key !== 'mode'
          && key !== 'serviceNumber'
          && key !== 'origin'
          && key !== 'destination',
      )
    ) {
      return payloadMismatch(type);
    }

    const rawMode = payload.mode;
    let normalizedMode: TransportMode | undefined;
    if (rawMode !== undefined) {
      if (typeof rawMode !== 'string' || !TRANSPORT_MODES.includes(rawMode as TransportMode)) {
        return payloadMismatch(type);
      }
      normalizedMode = rawMode as TransportMode;
    }
    const transportText = (value: unknown): string | undefined => {
      if (value === undefined) return undefined;
      if (typeof value !== 'string') {
        return payloadMismatch(type);
      }
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    };
    const serviceNumber = transportText(payload.serviceNumber);
    const origin = transportText(payload.origin);
    const destination = transportText(payload.destination);

    const normalized: TransportPayload = { kind: 'transport' };
    if (normalizedMode !== undefined) normalized.mode = normalizedMode;
    if (serviceNumber !== undefined) normalized.serviceNumber = serviceNumber;
    if (origin !== undefined) normalized.origin = origin;
    if (destination !== undefined) normalized.destination = destination;
    return normalized;
  }

  if (type === 'custom') {
    if (payload.kind !== 'custom') {
      return payloadMismatch(type);
    }

    if (
      typeof payload.label !== 'string'
      || Object.keys(payload).some((key) => key !== 'kind' && key !== 'label')
    ) {
      throw new RangeError('Invalid custom Item payload');
    }

    const label = payload.label.trim();
    if (Array.from(label).length > CUSTOM_ITEM_LABEL_MAX_LENGTH) {
      throw new RangeError(
        `Custom Item label must not exceed ${CUSTOM_ITEM_LABEL_MAX_LENGTH} characters`,
      );
    }
    if (!label) {
      return null;
    }

    return { kind: 'custom', label } satisfies CustomPayload;
  }

  return payloadMismatch(type);
}

export function assertItemPayloadMatchesType(
  type: ItemType,
  payload: ItemPayload | null,
) {
  normalizeItemPayload(type, payload);
}
