import type { EntityId } from '@/domain/common/types';

export const tripKeys = {
  all: ['trips'] as const,

  detail: (tripId: EntityId) => ['trips', tripId] as const,

  days: (tripId: EntityId) => ['trips', tripId, 'days'] as const,

  overview: (tripId: EntityId) => ['trips', tripId, 'overview'] as const,
};

export const dayKeys = {
  /**
   * Prefix for every Day read. A Trip date-range change renumbers, re-dates and
   * possibly deletes Days, so no single Day key is enough to invalidate.
   */
  all: ['days'] as const,
  view: (dayId: EntityId) => ['days', dayId, 'view'] as const,
};

export const unscheduledKeys = {
  byTrip: (tripId: EntityId) => ['trips', tripId, 'unscheduled'] as const,
};

export const homeKeys = {
  /**
   * One key for the whole Footprint surface. Home is cross-Trip, so it cannot be
   * keyed by Trip; every Trip-level write invalidates this instead.
   */
  map: ['home', 'map'] as const,
};
