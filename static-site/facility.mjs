/** Transform REAL ArcGIS feature attributes into a consistent read-only BMP profile.
 *  Keep this independent of the DOM so field mapping is easy to test and migrate.
 *  Values are never taken from a separate CSV or synthesized into the live map.
 */
const ALIASES = Object.freeze({
  facilityName: ["bmp_name", "facility_name", "asset_name", "site_name", "facility", "name"],
  assetTag: ["ms4_bmp_id", "bmp_tag", "bmp_tag_id", "bmptag", "bmp_id", "asset_tag", "asset_id", "facility_id", "facility_number", "structure_id", "tag_number", "tag_no", "asset_number", "id_tag", "tag"],
  bmpType: ["bmp_type", "type_of_bmp", "bmp_category", "bmp_classification", "facility_type", "asset_type", "practice_type", "stormwater_type", "bmp", "type"],
  sequence: ["bmp_sequence", "bmp_seq", "sequence"],
  trackingNumber: ["swm_tracking_number", "swm_tracking_no", "swm_number", "tracking_number", "tracking_no", "permit_number"],
  projectName: ["project_name", "project", "development_name"],
  outfallPoint: ["outfall_point", "outfall", "outfall_id"],
  drainageArea: ["drainage_area", "drainage_basin", "watershed"],
  sourceExcelRow: ["source_excel_row", "excel_row", "source_row"],
  csvIndex: ["index", "csv_index", "source_index"],
  latitude: ["latitude", "lat", "y_coord", "y_coordinate"],
  longitude: ["longitude", "lon", "long", "x_coord", "x_coordinate"],
  location: ["campus_location", "facility_location", "bmp_location", "asset_location", "site_location", "nearest_building", "building", "address", "location", "area"],
  status: ["facility_status", "asset_status", "bmp_status", "status", "condition"],
  lastInspection: ["last_inspection_date", "last_inspected", "last_inspection", "inspection_date", "date_last_inspected"]
});
const BMP_TEXT = /\bbmp\b|storm[ _-]?water|storm[ _-]?drain|bioretention|rain[ _-]?garden|detention|retention|infiltration|bioswale|swale|drainage|outfall|catch[ _-]?basin/i;

export function normalizeKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valuePresent(value) {
  return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
}

export function isBmpFeature(graphic, selectedLayer = "auto", configuredLayerIds = []) {
  const layer = graphic?.layer || graphic?.sourceLayer;
  if (!layer || !graphic?.attributes) return false;
  const owner = layer.parent || layer;
  const ids = [layer.id, owner.id, layer.url, owner.url].map(v => String(v ?? ""));
  if (selectedLayer !== "auto") return Boolean(selectedLayer) && ids.includes(selectedLayer);
  if (configuredLayerIds.length) return configuredLayerIds.some(id => ids.includes(String(id)));
  const names = [layer.title, owner.title, layer.id, owner.id].join(" ");
  const fields = Object.keys(graphic.attributes).join(" ");
  return BMP_TEXT.test(names.replace(/[_-]/g, " ")) || /bmptag|bmptype|bmpid|ms4bmpid|stormwater|stormdrain/i.test(normalizeKey(fields));
}

function formatValue(value, field) {
  if (!valuePresent(value)) return "";
  const coded = field?.domain?.codedValues?.find(entry => String(entry.code) === String(value));
  if (coded) return String(coded.name);
  if ((field?.type === "date" || field?.type === "date-only") && typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function findFieldValue(attributes, fields, aliases) {
  for (const alias of aliases) {
    const name = Object.keys(attributes).find(key => normalizeKey(key) === normalizeKey(alias)) ||
      Object.keys(attributes).find(key => normalizeKey(fields.find(field => field.name === key)?.alias) === normalizeKey(alias));
    if (name && valuePresent(attributes[name])) {
      return formatValue(attributes[name], fields.find(field => field.name === name));
    }
  }
  return "";
}

function validCoordinate(value, max) {
  if (value === "" || value === null || value === undefined) return false;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= max;
}

export function extractFacility(graphic, clickPoint = null) {
  const attributes = graphic?.attributes || {};
  const layer = graphic?.layer || graphic?.sourceLayer;
  const fields = layer?.fields?.toArray?.() || layer?.fields || [];

  // Include EVERY returned attribute, even nulls, instead of hiding missing source fields.
  const entries = Object.entries(attributes).map(([name, raw]) => {
    const field = fields.find(item => item.name === name);
    return { name, label: field?.alias || name, value: formatValue(raw, field) || "Not provided" };
  });
  const values = Object.fromEntries(
    Object.entries(ALIASES).map(([key, aliases]) => [key, findFieldValue(attributes, fields, aliases)])
  );

  // Geographic coordinates come from the source Latitude / Longitude fields first.
  // Geometry is a fallback; the clicked *pixel* is never treated as the asset location.
  const geometry = graphic?.geometry?.type === "point" ? graphic.geometry : null;
  const lat = validCoordinate(values.latitude, 90) ? values.latitude :
    validCoordinate(geometry?.latitude, 90) ? Number(geometry.latitude).toFixed(6) : "";
  const lon = validCoordinate(values.longitude, 180) ? values.longitude :
    validCoordinate(geometry?.longitude, 180) ? Number(geometry.longitude).toFixed(6) : "";
  const coordinates = lat && lon ? `${lat}, ${lon}` : "";
  const locationFromText = values.location;

  return {
    ...values,
    latitude: lat,
    longitude: lon,
    coordinates,
    location: locationFromText || coordinates,
    locationKind: locationFromText ? "named" : coordinates ? "coordinates" : "missing",
    // The MS4 identifier may be shared by multiple facilities; prefer their tracking number
    // for an individual facility's reference, then combine ID + sequence as a fallback.
    facilityReference: values.trackingNumber ||
      ([values.assetTag, values.sequence].filter(Boolean).join(" / ")) || "",
    source: String(layer?.title || layer?.parent?.title || "Unnamed ArcGIS layer"),
    entries,
    rawAttributes: { ...attributes }
  };
}
