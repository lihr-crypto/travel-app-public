import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { TripBottomSheet } from '@/components/trip-bottom-sheet';
import { HomeTripListSheet } from '@/components/home-trip-list-sheet';
import { HomeActiveTripCard } from '@/components/home-active-trip-card';
import { HomeTripPreviewCard } from '@/components/home-trip-preview-card';
import { TRIP_SHEET_SNAP_PERCENTAGES } from '@/state/trip-focus';
import { usePlan } from '../PlanContext';
import { today } from '../utils';
import { CloudStatus } from './CloudTools';
import FootprintMap from '../maps/FootprintMap';
import { webHomeProjection } from '../maps/home-projection';
import { CreateTrip, TripManagement } from './TripForms';
import { useMotionState } from '../motion';

export default function Home({ openTrip, openDay, openSettings }) {
  const { state, syncStatus, mapAuthRequired } = usePlan();
  const [filter, setFilter] = useState('all'), [requestedYear, setRequestedYear] = useState(null), [selectedTripId, setSelectedTripId] = useState(null), [preview, setPreview] = useMotionState(null);
  const [snap, setSnap] = useState('half'), [creating, setCreating] = useMotionState(false), [managedTripId, setManagedTripId] = useMotionState(null);
  const date = today();
  const projection = useMemo(() => webHomeProjection(state, { today: date, filter, year: requestedYear, selectedTripId }), [state, date, filter, requestedYear, selectedTripId]);
  const managedTrip = state.trips.find(trip => trip.id === managedTripId);
  const cameraKey = `home:${filter}:${projection.year ?? 'all'}:${JSON.stringify(projection.cameraRequest?.coordinates || [])}`;
  const chooseMarker = marker => {
    if (marker.variant === 'cluster') {
      const trips = marker.clusterTripIds.map(id => projection.visibleTrips.find(trip => trip.tripId === id)).filter(Boolean);
      setPreview(trips.length ? { kind: 'cluster', label: marker.label, trips } : null);
    } else {
      const trip = projection.visibleTrips.find(trip => trip.tripId === marker.tripId);
      if (trip) { setSelectedTripId(trip.tripId); setPreview({ kind: 'trip', trip }); }
    }
  };
  // The year row is built from the lifecycle filter's Trips, so a year chosen under one filter must not resurface under another.
  const changeFilter = next => { setPreview(null); setRequestedYear(null); setFilter(next); };
  const changeYear = next => { setPreview(null); setRequestedYear(next); };
  const needsAttention = Boolean(state.extras?.outbox?.length || Object.keys(state.extras?.syncIssues || {}).length || ['offline','signin','account-changed','error'].includes(syncStatus?.phase));
  return <main className="home-native" style={{ '--home-sheet-height': `${TRIP_SHEET_SNAP_PERCENTAGES[snap]}%` }}>
    <View style={{ flex: 1, position: 'relative' }}>
      <FootprintMap markers={projection.markers} cameraRequest={projection.cameraRequest} cameraKey={cameraKey} selectedId={selectedTripId} onMarker={chooseMarker} onMapPress={()=>setPreview(null)}/>
      <div className="home-top-controls">
        {projection.activeTrip && <View testID="web-home-active"><HomeActiveTripCard trip={projection.activeTrip} onContinueToday={(tripId, dayId)=>openDay ? openDay(tripId, dayId) : openTrip(tripId)}/></View>}
        {needsAttention && syncStatus?.phase!=='signin' && !mapAuthRequired && <div className="home-sync-alert"><CloudStatus onOpen={openSettings}/></div>}
      </div>
      <TripBottomSheet snap={snap} onSnapChange={setSnap} scrollable testID="web-home-sheet">
        <HomeTripListSheet trips={projection.visibleTrips} filter={filter} isFirstUse={state.trips.length===0} onFilterChange={changeFilter} availableYears={projection.availableYears} year={projection.year} onYearChange={changeYear} recap={projection.recap} onOpenTrip={openTrip} onManageTrip={id=>{setPreview(null);setManagedTripId(id);}} onCreateTrip={()=>setCreating(true)}/>
      </TripBottomSheet>
      {preview && <HomeTripPreviewCard preview={preview} selectedTripId={selectedTripId} onClose={()=>setPreview(null)} onSelectTrip={setSelectedTripId} onEnterTrip={openTrip}/>} 
    </View>
    {creating && <CreateTrip onClose={()=>setCreating(false)} onCreated={openTrip}/>}
    {managedTrip && <TripManagement trip={managedTrip} onClose={()=>setManagedTripId(null)} onOpenSettings={openSettings} onDeleted={()=>{setPreview(null);setSelectedTripId(null);}}/>}
  </main>;
}
