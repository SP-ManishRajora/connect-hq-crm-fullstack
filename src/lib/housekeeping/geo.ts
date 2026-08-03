// Geospatial helpers for geofencing and movement validation.

const EARTH_RADIUS_M = 6_371_000;

// Great-circle distance in metres between two WGS-84 points.
export function haversineM(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Implied speed in km/h between two points over a time gap. Returns null when
// the gap is non-positive (clock skew or same-instant records) so callers don't
// divide by zero and flag a false positive.
export function impliedSpeedKmh(
  distanceM: number,
  seconds: number,
): number | null {
  if (seconds <= 0) return null;
  return (distanceM / seconds) * 3.6;
}

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}
