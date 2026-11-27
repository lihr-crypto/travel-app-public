import type { Item } from '@/domain/item/types';
import type { AddItemInput } from './add-item';

/** Editable Item fields shared by Place Search, Map Picker, and the Item editor. */
export type ItemDraft = Pick<
  AddItemInput,
  | 'title'
  | 'type'
  | 'timeMode'
  | 'startDateTime'
  | 'endDateTime'
  | 'period'
  | 'note'
  | 'payload'
>;

/** The draft an existing Item starts an editing session from. */
export function itemToDraft(item: Item): ItemDraft {
  return {
    title: item.title,
    type: item.type,
    timeMode: item.timeMode,
    startDateTime: item.startDateTime,
    endDateTime: item.endDateTime,
    period: item.period,
    note: item.note,
    payload: item.payload,
  };
}
