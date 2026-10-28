/** Approximate, on-demand geocoding for a selected BMP using the existing ArcGIS SDK.
 *  This NEVER changes the original ArcGIS facility attributes or its coordinates.
 *  A matched street/POI is nearby, not a verified on-site location.
 */
const LOCATOR_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer';
const MAX_CACHE = 120;
const cache = new Map();
let arcgisModules;

function coordinate(value, bound) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= bound ? number : null;
}

/** Pure transformation of a REST geocode result; exported for offline testing. */
export function describeNearbyAddress(response) {
  const attrs = response?.attributes || {};
  const kind = String(attrs.Addr_type || attrs.AddrType || '').trim();
  const label = String(attrs.LongLabel || response?.address || attrs.Match_addr || '').trim();
  const place = String(attrs.PlaceName || '').trim();
  const address = String(attrs.Address || '').trim();

  // Postal code, county or entire campus can be returned even when no address
  // is actually near the BMP; avoid falsely presenting these as street addresses.
  if (['Locality','Postal','Subregion','Region','Country','Admin','Territory'].includes(kind)) return null;
  if (kind === 'POI' && place) {
    const detail = (address && !label.toLowerCase().includes(address.toLowerCase())) ? `${place} — ${address}` : label || place;
    return {display: detail, kind: 'Nearby place (approximate)', source: 'ArcGIS World Geocoding Service'};
  }
  if (!label) return null;
  if (kind === 'StreetName') return {display: label, kind: 'Nearby street (approximate)', source: 'ArcGIS World Geocoding Service'};
  if (!kind || ['PointAddress','StreetAddress','StreetInt','Subaddress','DistanceMarker','POI'].includes(kind)) {
    return {display: label, kind: kind === 'POI' ? 'Nearby place (approximate)' : 'Nearby address (approximate)', source: 'ArcGIS World Geocoding Service'};
  }
  return null;
}

/** Reverse-geocode only the source asset coordinates, never the user's click point.
 *  ArcGIS OAuth credentials are handled by the SDK; no token is logged or stored.
 *  Geocoding may be unavailable to an organizational account (permissions/credits).
 */
export async function lookupBmpAddress(facility, importer = () => $arcgis.import([
  '@arcgis/core/rest/locator.js',
  '@arcgis/core/geometry/Point.js'
])) {
  const latitude = coordinate(facility?.latitude, 90);
  const longitude = coordinate(facility?.longitude, 180);
  if (latitude === null || longitude === null) return null;
  const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  if (!arcgisModules && importer) arcgisModules = Promise.resolve().then(importer).catch(error => {
    arcgisModules = null;
    throw error;
  });
  const task = (async () => {
    const [locator, Point] = await arcgisModules;
    const location = new Point({latitude, longitude, spatialReference: {wkid: 4326}});
    const response = await locator.locationToAddress(LOCATOR_URL, {location, outFields:['*']});
    return describeNearbyAddress(response);
  })();
  cache.set(cacheKey, task);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  try { return await task; }
  catch (error) { cache.delete(cacheKey); throw error; }
}
