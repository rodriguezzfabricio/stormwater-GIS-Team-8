/** Pure helpers behind inspection-backend.mjs. No DOM and no network, so
 *  test-inspection-backend.mjs can check every rule with plain Node.
 *  The rules mirror supabase/CONTRACT.md (Contract-Version 2).
 */

// The only BMP layer the database accepts: UMBC_BMP_ArcGIS_Import, the layer
// the WebMap shows. Identified by portal item and layer ID only.
export const BMP_SOURCE = Object.freeze({
  item: "5d70e438bb6045d6b3af05aee061e3cd",
  layer: 0
});
const SNAPSHOT_LIMIT = 15000; // bytes; the database allows 16 KB and formats JSON slightly longer.
// If every attribute would not fit, keep only the fields that identify the BMP.
const SNAPSHOT_FALLBACK_KEYS = ["bmp_name", "bmp_sequence", "ms4_bmp_id", "bmp_type"];
// The editable form fields saved with each inspection, by input name.
export const FORM_FIELDS = Object.freeze(["verified_campus_location", "nearby_address", "address_kind", "condition_status", "last_inspection"]);
const FORM_VALUE_LIMIT = 500;

export const NON_UMBC_MESSAGE = "Only @umbc.edu accounts can use this app.";

/** Cuts to at most `limit` characters as the database counts them (code points),
 *  so an emoji is never split into half a character. */
function cutText(value, limit) {
  const text = String(value ?? "").trim();
  return text.length <= limit ? text : Array.from(text).slice(0, limit).join("");
}

function byteSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** True only for an address ending in @umbc.edu (any letter case). */
export function isUmbcEmail(email) {
  return typeof email === "string" && /^[^@\s]+@umbc\.edu$/i.test(email.trim());
}

/** Which BMP a selected ArcGIS graphic is, in the form the database wants. */
export function featureRef(graphic) {
  const layer = graphic?.layer || graphic?.sourceLayer;
  if (!layer || !graphic?.attributes) {
    return { ok: false, message: "No BMP is selected. Click a BMP on the map first." };
  }
  const url = String(layer.url || "").replace(/\/+$/, "");
  const urlLayer = url.match(/\/(\d+)$/)?.[1];
  const layerId = Number.isInteger(layer.layerId) ? layer.layerId : urlLayer !== undefined ? Number(urlLayer) : NaN;
  const sourceItem = String(layer.portalItem?.id || layer.parent?.portalItem?.id || "");
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

/** The feature's attributes, JSON-safe. Taken when the inspection starts. */
export function attributesOf(graphic) {
  const attributes = {};
  for (const [name, value] of Object.entries(graphic?.attributes || {})) {
    if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) attributes[name] = null;
    else if (value !== null && typeof value === "object") attributes[name] = String(value);
    else attributes[name] = value;
  }
  return attributes;
}

/** The five editable form fields as shown at Save, each cut to 500 characters.
 *  Accepts the inspection <form> itself, or a plain object keyed by input name. */
export function readFormSection(input) {
  const named = typeof input?.elements?.namedItem === "function";
  return Object.fromEntries(FORM_FIELDS.map(name => {
    const value = named ? input.elements.namedItem(name)?.value : input?.[name];
    return [name, cutText(value, FORM_VALUE_LIMIT)];
  }));
}

/** { arcgis, form }, small enough for the database. */
export function snapshotOf(attributes, form = {}) {
  const snapshot = { arcgis: attributes || {}, form };
  if (byteSize(snapshot) <= SNAPSHOT_LIMIT) return snapshot;
  const arcgis = Object.fromEntries(SNAPSHOT_FALLBACK_KEYS.map(name => [name, snapshot.arcgis[name] ?? null]));
  if (byteSize({ arcgis, form }) <= SNAPSHOT_LIMIT) return { arcgis, form };
  // Still too big (very long or heavily escaped text): shorten every value so the save can go through.
  const short = values => Object.fromEntries(Object.entries(values).map(([name, value]) =>
    [name, typeof value === "string" ? cutText(value, 100) : value]));
  return { arcgis: short(arcgis), form: short(form) };
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
  if (Array.from(args.p_notes).length > 4000) return fieldProblem("notes");  // Code points, like the database.
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
  if (code === "PGRST301" || code === "PGRST303" || text.startsWith("JWT expired") ||
      text.startsWith("not_authenticated") || (code === "42501" && text.startsWith("permission denied"))) {
    return result("signed_out", action === "load"
      ? "You are signed out. Sign in again in a new tab, then select the BMP again."
      : "You are signed out. Sign in again in a new tab, then press Save again here.");
  }
  if (action === "load") {
    return result("network", "Could not load past inspections. Check your connection and try again.");
  }
  // A 4xx reply is a definite refusal: nothing was stored, so the form stays editable.
  if (status >= 400 && status < 500) {
    return result("rejected", `The server refused this save${code ? ` (code ${code})` : ""}. Nothing was saved. ` +
      "Check the values and press Save again; if it keeps happening, tell Fabricio.");
  }
  // No reply, a server error or an unexpected one: the save may have reached the database.
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

/** One history row. form is the saved form section ({ inputName: text }), or null when the record has none. */
export function historyRow(row) {
  const saved = row.displayed_snapshot?.form;
  const form = saved && typeof saved === "object" && !Array.isArray(saved)
    ? Object.fromEntries(FORM_FIELDS.filter(name => name in saved).map(name => [name, String(saved[name] ?? "")]))
    : null;
  return {
    recordId: row.id,
    savedAt: row.submitted_at,
    savedAtText: new Date(row.submitted_at).toLocaleString(),
    inspectionType: row.inspection_type,
    outcome: row.outcome,
    notes: row.notes ?? "",
    form
  };
}
