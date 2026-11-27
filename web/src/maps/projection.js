import { UNSCHEDULED_MARKER_HIDE_THRESHOLD } from '@/application/projections/trip-overview';
import { matchingPlace } from '../utils';
export function itineraryMarkers(items, places, region, view) {
  return items.filter(item=>places[item.placeId]).map((item,index)=>({id:item.id,name:places[item.placeId].name,label:places[item.placeId].name,coordinate:places[item.placeId].coordinate,placeIds:[item.placeId],sourceItemIds:[item.id],ordinal:view==='day'?index+1:undefined,variant:'normal'})).filter(marker=>matchingPlace(places[marker.placeIds[0]],region));
}
export function showUnscheduledMarkers(count, override=null) {return override??count<UNSCHEDULED_MARKER_HIDE_THRESHOLD;}
