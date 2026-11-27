# Travel App

This context names the itinerary concepts used consistently across Trip, Day, Item, Timeline, and map projections.

## Language

**DayPeriod**:
An approximate part of a Day used to place an Item when no exact clock time is known: morning, noon, afternoon, or night.
_Avoid_: evening as a canonical value; 昼/傍晚 as separate values.

**Custom Item Type**:
The Item category shown as “其他”; its optional custom label describes the kind of activity separately from the Item title.
_Avoid_: using the title itself as the custom category.
