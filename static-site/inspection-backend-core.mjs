/** Pure helpers behind inspection-backend.mjs. No DOM and no network, so
 *  test-inspection-backend.mjs can check every rule with plain Node.
 *  The rules mirror supabase/CONTRACT.md (Contract-Version 1).
 */

// The only BMP layer the database accepts. The URL is the same layer for
// WebMaps that reference the service directly instead of through its item.
export const BMP_SOURCE = Object.freeze({
  item: "cc6a7a27c267435c8f7ed95a59eb5f24",
  layer: 3,
  serviceUrl: "https://services1.arcgis.com/diQbEFavWah0WAHd/arcgis/rest/services/UMBC_SWM_Tracking_test/FeatureServer"
});
const SNAPSHOT_LIMIT = 15000; // bytes; the database allows 16 KB and formats JSON slightly longer.
const SNAPSHOT_FALLBACK_KEYS = ["Facility_T", "Facility_N", "MDE_SF_Num", "UMBC_PRF"];

/** Which BMP a selected ArcGIS graphic is, in the form the database wants. */
export function featureRef(graphic) {
  const layer = graphic?.layer || graphic?.sourceLayer;
  if (!layer || !graphic?.attributes) {
    return { ok: false, message: "No BMP is selected. Click a BMP on the map first." };
  }
  const url = String(layer.url || "").replace(/\/+$/, "");
  const urlLayer = url.match(/\/(\d+)$/)?.[1];
  const layerId = Number.isInteger(layer.layerId) ? layer.layerId : urlLayer !== undefined ? Number(urlLayer) : NaN;
  const serviceUrl = url.replace(/\/\d+$/, "").toLowerCase();
  // Same service URL means the same features, whichever portal item the WebMap used.
  const sourceItem = serviceUrl === BMP_SOURCE.serviceUrl.toLowerCase()
    ? BMP_SOURCE.item
    : String(layer.portalItem?.id || layer.parent?.portalItem?.id || "");
  if (sourceItem !== BMP_SOURCE.item || layerId !== BMP_SOURCE.layer) {
    return {
      ok: false,
      message: `This feature is from "${layer.title || "an unnamed layer"}" (item ${sourceItem || "unknown"}, layer ${Number.isNaN(layerId) ? "unknown" : layerId}), ` +
        `not the BMP layer the database accepts (item ${BMP_SOURCE.item}, layer ${BMP_SOURCE.layer}).`
    };
  }
  const raw = graphic.attributes[layer.objectIdField];
  const objectId = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isSafeInteger(objectId) || objectId < 1) {
    return { ok: false, message: `This BMP has no object ID (${layer.objectIdField || "objectIdField"} is missing). Query the layer with outFields: ["*"].` };
  }
  return { ok: true, sourceItem, layerId, objectId: String(objectId) };
}

/** The attributes shown on screen, JSON-safe and small enough for the database. */
export function snapshotOf(graphic) {
  const snapshot = {};
  for (const [name, value] of Object.entries(graphic?.attributes || {})) {
    if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) snapshot[name] = null;
    else if (value !== null && typeof value === "object") snapshot[name] = String(value);
    else snapshot[name] = value;
  }
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length <= SNAPSHOT_LIMIT) return snapshot;
  return Object.fromEntries(SNAPSHOT_FALLBACK_KEYS.map(name => [name, snapshot[name] ?? null]));
}

/** Accepts the inspection <form> itself, or { inspectionType, outcome, notes }. */
export function readFields(input) {
  const named = name => input?.elements?.namedItem?.(name)?.value;
  if (typeof input?.elements?.namedItem === "function") {
    return { inspectionType: named("inspection_type"), outcome: named("inspection_result"), notes: named("observations") };
  }
  return { inspectionType: input?.inspectionType, outcome: input?.outcome, notes: input?.notes };
}

export function buildSaveArgs(draftId, ref, fields, snapshot) {
  return {
    p_draft_id: draftId,
    p_source_item: ref.sourceItem,
    p_layer_id: ref.layerId,
    p_object_id: ref.objectId,
    p_inspection_type: String(fields.inspectionType ?? "").trim(),
    p_outcome: String(fields.outcome ?? "").trim().toLowerCase(),
    p_notes: String(fields.notes ?? "").trim(),
    p_displayed_snapshot: snapshot
  };
}

const FIELD_MESSAGES = Object.freeze({
  inspection_type: "Choose an inspection type (120 characters at most).",
  outcome: "Choose Pass or Fail. \"Needs verification\" is not a saved outcome.",
  notes: "Observations are too long. The limit is 4,000 characters.",
  object_id: "This BMP has no valid object ID. Select it on the map again.",
  draft_id: "The page sent a broken request. This is a bug in the page, not your input.",
  displayed_snapshot: "The page sent a broken request. This is a bug in the page, not your input."
});

/** Catch the common mistakes before a network round trip. The database checks again. */
export function checkFields(args) {
  if (!args.p_inspection_type || args.p_inspection_type.length > 120) return fieldProblem("inspection_type");
  if (args.p_outcome !== "pass" && args.p_outcome !== "fail") return fieldProblem("outcome");
  if (args.p_notes.length > 4000) return fieldProblem("notes");
  return null;
}

function fieldProblem(field) {
  return { ok: false, kind: "invalid_input", field, maybeSaved: false, message: FIELD_MESSAGES[field] };
}

/** Plain-English result for a supabase-js error. action is "save" or "load". */
export function explainError(error, status = 0, action = "save") {
  const code = typeof error?.code === "string" ? error.code : "";
  const text = typeof error?.message === "string" ? error.message.trim() : "";
  const result = (kind, message, extra = {}) => ({ ok: false, kind, message, field: "", maybeSaved: false, ...extra });
  if (text.startsWith("invalid_input:")) {
    const field = text.slice("invalid_input:".length).split(/\s/, 1)[0];
    return result("invalid_input", FIELD_MESSAGES[field] || "One of the values was rejected.", { field });
  }
  if (text.startsWith("forbidden_domain")) {
    return result("forbidden_domain", "Only @umbc.edu accounts can do this. Sign out and sign in with your UMBC Google account.");
  }
  if (text.startsWith("unknown_source")) {
    return result("unknown_source", "This feature is not from the BMP layer the database accepts. Select a BMP from the stormwater layer.");
  }
  if (text.startsWith("draft_conflict")) {
    return result("draft_conflict", "This inspection was already saved with different values. Start a new inspection to record changes.");
  }
  if (code === "PGRST301" || code === "PGRST303" || text.startsWith("JWT expired")) {
    return result("signed_out", "Your sign-in expired. Sign in again; what you typed is kept.");
  }
  if (text.startsWith("not_authenticated") || (code === "42501" && text.startsWith("permission denied"))) {
    return result("signed_out", "You are signed out. Sign in again; what you typed is kept.");
  }
  if (action === "load") {
    return result("network", "Could not load past inspections. Check your connection and try again.");
  }
  // No reply (or an unexpected one): the save may have reached the database.
  return result("network", "No reply from the server, so the save is not confirmed. Press Save again; it will not create a duplicate.", { maybeSaved: true });
}

export function savedResult(row, alreadySaved = false) {
  const when = new Date(row.submitted_at).toLocaleString();
  return {
    ok: true,
    recordId: row.id,
    savedAt: row.submitted_at,
    alreadySaved,
    message: alreadySaved ? `Already saved (record ${row.id}, ${when}).` : `Saved at ${when}. Record ${row.id}.`
  };
}

export function historyRow(row) {
  return {
    recordId: row.id,
    savedAt: row.submitted_at,
    savedAtText: new Date(row.submitted_at).toLocaleString(),
    inspectionType: row.inspection_type,
    outcome: row.outcome,
    notes: row.notes ?? ""
  };
}
