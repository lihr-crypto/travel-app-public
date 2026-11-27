import type { EntityId, TravelLocalDateTime } from '@/domain/common/types';
import type { DayPeriod, Item, ItemType } from '@/domain/item/types';
import type { DayViewData } from '@/application/queries/day-view';

export type TimelineTime =
  | { mode: 'none' }
  | { mode: 'period'; period: DayPeriod }
  | {
      mode: 'exact';
      startDateTime: TravelLocalDateTime | null;
      endDateTime: TravelLocalDateTime | null;
    };

export interface TimelineItemModel {
  id: EntityId;
  title: string;
  type: ItemType;
  typeLabel: string;
  time: TimelineTime;
  note: string | null;
  /**
   * The Item's saved Place name, or null when it has none.
   *
   * Day Overview shows one secondary line per row and prefers the Place over the
   * note, so the projection has to carry the Place name itself; the Timeline
   * cannot read `placesById` without owning a second read model.
   */
  placeName: string | null;
}

const itemTypeLabels: Record<ItemType, string> = {
  sightseeing: '景点',
  food: '餐饮',
  hotel: '住宿',
  activity: '活动',
  transport: '交通',
  custom: '其他',
};

function displayTypeLabel(item: Item): string {
  if (item.type === 'custom' && item.payload && 'label' in item.payload) {
    const label = item.payload.label.trim();
    if (label) return label;
  }
  return itemTypeLabels[item.type];
}

export interface TimelineProjection {
  dayId: EntityId;
  items: TimelineItemModel[];
}

function projectTime(item: Item): TimelineTime {
  switch (item.timeMode) {
    case 'none':
      return { mode: 'none' };
    case 'period':
      if (item.period === null) {
        throw new RangeError(`Period Item is missing period: ${item.id}`);
      }
      return { mode: 'period', period: item.period };
    case 'exact':
      if (item.startDateTime === null && item.endDateTime === null) {
        throw new RangeError(
          `Exact-time Item is missing startDateTime and endDateTime: ${item.id}`,
        );
      }
      return {
        mode: 'exact',
        startDateTime: item.startDateTime,
        endDateTime: item.endDateTime,
      };
    default:
      throw new RangeError(`Invalid Item timeMode: ${item.timeMode}`);
  }
}

export function buildTimelineProjection(
  data: DayViewData,
): TimelineProjection {
  return {
    dayId: data.day.id,
    items: data.items.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      typeLabel: displayTypeLabel(item),
      time: projectTime(item),
      note: item.note,
      placeName: item.placeId === null
        ? null
        : data.placesById[item.placeId]?.name ?? null,
    })),
  };
}
