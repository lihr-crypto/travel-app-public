export function fitMarkers(markers, { SDK, map, region }, bottom, maxZoom = 16) {
  if (!markers.length) return;
  if (region === 'china_mainland') {
    const ghosts = markers.map(marker => new SDK.Marker({ position: [marker.coordinate.longitude, marker.coordinate.latitude] }));
    // AMap orders its margins top/bottom/left/right, unlike CSS shorthand.
    map.setFitView(ghosts, true, [64, bottom + 32, 24, 24], maxZoom);
  } else {
    const bounds = new SDK.LatLngBounds(); markers.forEach(marker => bounds.extend({ lat: marker.coordinate.latitude, lng: marker.coordinate.longitude }));
    const padding = { top: 64, right: 24, bottom: bottom + 32, left: 24 };
    map.fitBounds(bounds, padding);
    SDK.event.addListenerOnce(map, 'idle', () => {
      if (map.getZoom() <= maxZoom) return;
      const projection = map.getProjection();
      if (!projection) { map.setZoom(maxZoom); return; }
      // Zooming around the full canvas center would discard the sheet offset.
      const world = projection.fromLatLngToPoint(bounds.getCenter());
      const center = projection.fromPointToLatLng(new SDK.Point(
        world.x, world.y + (padding.bottom - padding.top) / (2 * 2 ** maxZoom),
      ));
      map.moveCamera({ center, zoom: maxZoom });
    });
  }
}
export function activateMarkerGroup(group, instance, bottom, preview) {
  const {marker,members}=group;
  const spread=members.some(member=>Math.abs(member.coordinate.latitude-marker.coordinate.latitude)+Math.abs(member.coordinate.longitude-marker.coordinate.longitude)>0.00002);
  if(members.length>1&&spread&&instance.map.getZoom()<18){fitMarkers(members,instance,bottom,18);return;}
  preview?.(group);
}
