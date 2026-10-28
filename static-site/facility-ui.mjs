import {extractFacility, isBmpFeature} from "./facility.mjs";
import {createBmpHighlighter} from "./selection-highlight.mjs";
import {lookupBmpAddress} from "./location-lookup.mjs";
import {loadDrainCatalog, findMatchingDrain, drainOptions} from "./drain-catalog.mjs";

const byId = id => document.getElementById(id);
const selectionMessage = byId("selection-message");
const empty = byId("facility-empty");
const detailBody = byId("facility-selected");
const fieldRows = byId("facility-attributes");
const inspectionFields = byId("inspection-source-fields");
const form = document.querySelector(".inspection-form");
const startButton = byId("start-inspection");
const drainSelect = byId("bmp-drain-select");
const selectedIndicator = byId("selected-bmp-indicator");
const selectedName = byId("selected-bmp-name");
let selectionCounter = 0;
let selectedFacility = null;
let addressRequest = 0;
const nearbyAddress = byId("facility-nearby-address");
const nearbyNote = byId("facility-nearby-note");

// Saving and history go through the Supabase drop-in, which map.js loads and
// passes in (connectInspectionBackend). This file never talks to Supabase itself.
const saveButton = byId("save-inspection");
const clearButton = byId("clear-inspection");
const saveStatus = byId("save-status");
const historyStatus = byId("history-status");
const historyList = byId("history-list");
// Everything the inspector types that a save stores. Locked while a save is in
// flight, and after a save that was not confirmed, so a retry sends the same values.
const SAVED_FIELDS = ["inspection_type", "inspection_result", "observations",
  "verified_campus_location", "nearby_address", "address_kind", "condition_status", "last_inspection"];
const FORM_SECTION_FIELDS = SAVED_FIELDS.slice(3);
let backend = null;
let selectedGraphic = null;
let draft = null;          // One inspection of the selected BMP: backend.startInspection().
let saving = false;        // A save request is in flight.
let unconfirmed = false;   // The last save got no reply; it may already be stored.
let catalogAvailable = false;
let historyRequest = 0;

function renderAddress(value, note) {
  nearbyAddress.textContent = value;
  nearbyNote.textContent = note;
}

/** Keep geocoder results tied to the original selected feature. */
async function updateReadableLocation(facility, request) {
  if (facility.locationKind === "named") {
    facility.nearbyAddress = facility.location;
    facility.addressKind = "Provided by ArcGIS feature";
    renderAddress(facility.location, "Source-provided location. Verify the building and entrance on site.");
    populateInspection(facility);
    return;
  }
  if (!facility.latitude || !facility.longitude) {
    renderAddress("Not available", "ArcGIS returned no usable coordinates for an address lookup.");
    return;
  }
  renderAddress("Finding a nearby address…", "Looking up a nearby place using ArcGIS geocoding. This is not a verified asset address.");
  try {
    const result = await lookupBmpAddress(facility);
    if (request !== addressRequest || selectedFacility !== facility) return;
    if (!result) {
      renderAddress("No precise nearby address found", "Use the project/area and geographic coordinates, or enter a verified campus location in the inspection form.");
      return;
    }
    facility.nearbyAddress = result.display;
    facility.addressKind = result.kind;
    renderAddress(result.display, `${result.kind} · ${result.source}. This may describe a nearby road or building, not the BMP itself.`);
    populateInspection(facility);
  } catch {
    if (request !== addressRequest || selectedFacility !== facility) return;
    renderAddress("Lookup unavailable", "Your ArcGIS account may not have geocoding privileges. The map and coordinates still work. Enter a verified campus location in the inspection form if known.");
  }
}


function text(id, value) { byId(id).textContent = value || "Not provided"; }

function renderAttributes(entries, target) {
  target.replaceChildren();
  for (const entry of entries) {
    const row = document.createElement("div");
    const label = document.createElement("dt");
    const value = document.createElement("dd");
    label.textContent = entry.label;
    label.title = entry.name; // ArcGIS field name can differ from its human-readable alias.
    value.textContent = entry.value;
    row.append(label, value);
    target.append(row);
  }
}

/** UI edits belong to a temporary inspection draft; ArcGIS source objects stay untouched.
 *  A stable source reference is held separately from every editable display field.
 */
const INSPECTION_FIELD_MAP = Object.freeze({
  facility_name: "facilityName",
  asset_tag: "assetTag",
  bmp_type: "bmpType",
  bmp_sequence: "sequence",
  swm_tracking_number: "trackingNumber",
  outfall_point: "outfallPoint",
  drainage_area: "drainageArea",
  location: "location",
  nearby_address: "nearbyAddress",
  address_kind: "addressKind",
  latitude: "latitude",
  longitude: "longitude",
  condition_status: "status",
  last_inspection: "lastInspection"
});
const originalFormValues = new Map();
const editedFormFields = new Set();
const editStatus = byId("inspection-edit-status");
const restoreButton = byId("restore-arcgis-fields");
let formFacilityKey = "";

/** Equal keys mean the same BMP. For BMPs the database accepts this is the
 *  drop-in's own identity (item|layer|object ID), so the form and the draft agree. */
function facilityKey(facility, graphic) {
  const accepted = backend?.checkFeature(graphic);
  if (accepted?.ok) return accepted.key;
  const attrs = facility.rawAttributes || {};
  const objectId = Object.entries(attrs).find(([key]) => /^(?:objectid|fid)$/i.test(key))?.[1];
  return [facility.source, objectId ?? facility.facilityReference ?? "", facility.facilityName,
    facility.latitude, facility.longitude].join("|");
}

function refreshEditStatus() {
  const count = editedFormFields.size;
  editStatus.classList.toggle("has-edits", count > 0);
  editStatus.textContent = !selectedFacility
    ? "Select a BMP to pre-fill the form. Selecting another BMP starts a new draft."
    : count
      ? `${count} editable field${count === 1 ? "" : "s"} changed for this inspection. Locked ArcGIS fields remain unchanged.`
      : "Core facility fields are locked to ArcGIS values. Other inspection fields can be edited. Selecting another BMP starts a new draft.";
  restoreButton.disabled = !selectedFacility || count === 0 || saving || unconfirmed;
}

function markInspectionField(name) {
  if (!originalFormValues.has(name)) return;
  const input = form.elements.namedItem(name);
  if (!input || input.readOnly) return;
  const edited = input.value !== originalFormValues.get(name);
  if (edited) editedFormFields.add(name);
  else editedFormFields.delete(name);
  input.closest("label")?.classList.toggle("field-edited", edited);
  refreshEditStatus();
}

function clearEditMarkers() {
  editedFormFields.clear();
  originalFormValues.clear();
  for (const name of Object.keys(INSPECTION_FIELD_MAP)) {
    form.elements.namedItem(name)?.closest("label")?.classList.remove("field-edited");
  }
  refreshEditStatus();
}

// Delegated listener: fields corrected by an inspector are not overwritten when
// a delayed reverse-geocoding response arrives.
function handleDraftEdit(event) {
  const input = event.target;
  if (input && !input.readOnly && input.name in INSPECTION_FIELD_MAP) markInspectionField(input.name);
}
form.addEventListener("input", handleDraftEdit);
form.addEventListener("change", handleDraftEdit);
restoreButton.addEventListener("click", () => {
  if (!selectedFacility) return;
  populateInspection(selectedFacility, {preserveEdits: false});
});

/** Prefill every known source field and render ALL original ArcGIS attributes.
 *  Inspection questions remain editable; source identifiers remain read-only.
 */
function populateInspection(facility, {preserveEdits = true} = {}) {
  for (const [name, property] of Object.entries(INSPECTION_FIELD_MAP)) {
    const input = form.elements.namedItem(name);
    if (!input) continue;
    // A save in flight or not confirmed keeps the values it sent, even when a late address lookup arrives.
    if (!input.readOnly && (saving || unconfirmed)) continue;
    const original = facility[property] == null ? "" : String(facility[property]);
    originalFormValues.set(name, original);
    if (input.readOnly || !preserveEdits || !editedFormFields.has(name)) input.value = original;
    // Only editable fields can display inspector changes; locked fields always mirror ArcGIS.
    const changed = !input.readOnly && input.value !== original;
    if (changed) editedFormFields.add(name);
    else editedFormFields.delete(name);
    input.closest("label")?.classList.toggle("field-edited", changed);
  }
  form.elements.namedItem("source_layer").value = facility.source || "";
  form.elements.namedItem("facility_reference").value = facility.facilityReference || "";
  form.elements.namedItem("arcgis_layer").value = facility.source || "";
  form.elements.namedItem("arcgis_fields").value = JSON.stringify(facility.rawAttributes);
  // Hide excluded administrative CSV columns in the inspection form only.
  // The facility panel still shows the full source list and arcgis_fields keeps the raw record.
  const omitInInspection = new Set(["project_name", "source_excel_row", "csv_index", "index"]);
  const inspectionEntries = facility.entries.filter(entry =>
    !omitInInspection.has(String(entry.name || "").toLowerCase()) &&
    !omitInInspection.has(String(entry.label || "").toLowerCase().replaceAll(" ", "_")));
  renderAttributes(inspectionEntries, inspectionFields);
  const reference = facility.facilityReference || facility.facilityName || "selected BMP";
  byId("inspection-selected-caption").textContent = `Linked to ${reference} — facility IDs and coordinates locked`;
  byId("inspection-selected-caption").classList.add("connected");
  refreshEditStatus();
}
function showFacility(facility, graphic) {
  const request = ++addressRequest;
  const key = facilityKey(facility, graphic);
  const sameDrain = formFacilityKey && formFacilityKey === key;
  if (!sameDrain) {
    // Inspection observations are specific to one drain, not portable to another.
    // A different BMP also ends an unconfirmed save's lock and starts a new draft.
    unconfirmed = false;
    draft = null;
    for (const name of ["verified_campus_location", "inspection_type", "inspection_result", "observations"]) {
      const input = form.elements.namedItem(name);
      if (input) input.value = "";
    }
    clearEditMarkers();
    showSaveStatus("");
  }
  formFacilityKey = key;
  selectedFacility = facility;
  selectedGraphic = graphic;
  if (!draft) startDraft();  // The same BMP again keeps its draft.
  applyLock();
  const displayName = facility.facilityName || facility.assetTag || "Selected BMP facility";
  selectedName.textContent = displayName;
  selectedIndicator.hidden = false;
  empty.hidden = true;
  detailBody.hidden = false;
  text("facility-title", displayName);
  text("facility-tag", facility.assetTag);
  text("facility-type", facility.bmpType);
  text("facility-sequence", facility.sequence);
  text("facility-tracking", facility.trackingNumber);
  text("facility-project", facility.projectName);
  text("facility-outfall", facility.outfallPoint);
  text("facility-drainage", facility.drainageArea);
  text("facility-location", facility.location);
  renderAddress("Pending lookup", "Automatic address lookup begins when a BMP is selected. Coordinates remain authoritative for the point location.");
  text("facility-latitude", facility.latitude);
  text("facility-longitude", facility.longitude);
  text("facility-source-row", facility.sourceExcelRow);
  text("facility-csv-index", facility.csvIndex);
  text("facility-status", facility.status);
  text("facility-inspected", facility.lastInspection);
  text("facility-source", facility.source);
  const locationNote = byId("facility-location-note");
  locationNote.hidden = facility.locationKind !== "coordinates";
  renderAttributes(facility.entries, fieldRows);
  populateInspection(facility, {preserveEdits: Boolean(sameDrain)});
  selectionMessage.textContent = facility.entries.length
    ? `Selected ${displayName} from ${facility.source}. ${facility.entries.length} source attribute${facility.entries.length === 1 ? "" : "s"} returned (missing values labelled).`
    : "Selected an ArcGIS feature with no returned attributes.";
  const accepted = backend?.checkFeature(graphic);
  if (accepted && !accepted.ok) selectionMessage.textContent = `Selected ${displayName}. ${accepted.message}`;
  startButton.disabled = false;
  void updateReadableLocation(facility, request);
  void loadHistory();
}

function startDraft() {
  draft = backend && selectedGraphic ? backend.startInspection(selectedGraphic) : null;
}

function applyLock() {
  const locked = saving || unconfirmed;
  for (const name of SAVED_FIELDS) {
    const input = form.elements.namedItem(name);
    if (input) input.disabled = locked;
  }
  clearButton.disabled = locked;
  saveButton.disabled = saving;
  drainSelect.disabled = saving || !catalogAvailable;
  refreshEditStatus();
}

/** Messages come from the drop-in and are shown with textContent only. */
function showSaveStatus(message, tone = "", signInLink = false) {
  saveStatus.replaceChildren(message);
  if (tone) saveStatus.dataset.tone = tone;
  else delete saveStatus.dataset.tone;
  if (signInLink) {
    const link = document.createElement("a");
    link.href = "login.html";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open sign-in in a new tab";
    saveStatus.append(" ", link);
  }
}

async function saveInspection() {
  if (saving) return;
  if (!backend) {
    showSaveStatus("Sign-in could not load. Check your connection and reload.", "error");
    return;
  }
  if (!draft) {
    showSaveStatus(backend.checkFeature(null).message, "error");
    return;
  }
  const current = draft;
  const pending = current.save(form);  // Reads the form now; the drop-in sends at most one request.
  saving = true;
  selectionCounter += 1;  // Pending map clicks are dropped while saving.
  applyLock();
  showSaveStatus("Saving…");
  const result = await pending;
  saving = false;
  if (result.ok) {
    // Confirmed (new, already saved, or an earlier attempt that did arrive): next inspection, same BMP.
    unconfirmed = false;
    for (const name of ["inspection_type", "inspection_result", "observations"]) form.elements.namedItem(name).value = "";
    startDraft();
    applyLock();
    showSaveStatus(result.message, "ok");
    void loadHistory();
    return;
  }
  if (result.maybeSaved) unconfirmed = true;  // Same draft: pressing Save again cannot duplicate.
  applyLock();
  showSaveStatus(result.message, "error", result.kind === "signed_out");
}

function fieldLabel(name) {
  const label = form.elements.namedItem(name)?.closest("label");
  return label?.firstChild?.textContent?.trim() || name;
}

function detailRow(list, label, value) {
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  list.append(term, detail);
}

function historyItem(row) {
  const item = document.createElement("li");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = `${row.savedAtText} · ${row.inspectionType} · ${row.outcome === "pass" ? "Pass" : "Fail"}`;
  const body = document.createElement("div");
  body.className = "history-detail";
  const list = document.createElement("dl");
  detailRow(list, fieldLabel("observations"), row.notes || "No notes");
  if (row.form) {
    for (const name of FORM_SECTION_FIELDS) {
      if (name in row.form) detailRow(list, fieldLabel(name), row.form[name] || "Not entered");
    }
  }
  body.append(list);
  if (!row.form) {
    const none = document.createElement("p");
    none.textContent = "No extra fields saved";
    body.append(none);
  }
  details.append(summary, body);
  item.append(details);
  return item;
}

function showHistoryStatus(message, tone = "") {
  historyStatus.textContent = message;
  if (tone) historyStatus.dataset.tone = tone;
  else delete historyStatus.dataset.tone;
}

/** The signed-in inspector's own inspections of the selected BMP. Only the newest request is shown. */
async function loadHistory() {
  const request = ++historyRequest;
  historyList.replaceChildren();
  if (!selectedGraphic) {
    showHistoryStatus("Select a BMP to see your past inspections.");
    return;
  }
  if (!backend) {
    showHistoryStatus("Sign-in could not load. Check your connection and reload.", "error");
    return;
  }
  const accepted = backend.checkFeature(selectedGraphic);
  if (!accepted.ok) {
    showHistoryStatus(accepted.message, "error");  // No request for a BMP the database refuses.
    return;
  }
  showHistoryStatus("Loading…");
  const found = await backend.myInspections(selectedGraphic, 50);
  if (request !== historyRequest) return;  // A newer selection or save replaced this one.
  historyList.replaceChildren(...found.rows.map(historyItem));
  if (!found.ok) showHistoryStatus(found.message, "error");
  else showHistoryStatus(found.rows.length
    ? `${found.rows.length} inspection${found.rows.length === 1 ? "" : "s"}, newest first. Open one to see what was saved.`
    : found.message);
}

/** map.js calls this once the drop-in has loaded. */
export function connectInspectionBackend(dropIn) {
  backend = dropIn;
}
saveButton.addEventListener("click", saveInspection);

/** Both the dropdown and the map click use exactly the same facility renderer. */
export function connectBmpSelection(mapElement, options = {}) {
  const configuredLayerIds = Array.isArray(options.bmpLayerIds) ? options.bmpLayerIds : [];
  const highlighter = createBmpHighlighter(mapElement);
  let catalog = [];
  let disposed = false;
  let lastClickedFeature = null;
  const catalogByKey = new Map();

  drainSelect.disabled = true;
  drainSelect.replaceChildren(new Option("Loading available BMPs…", ""));
  selectionMessage.textContent = "Loading BMP names from the live ArcGIS map…";

  /** Only read operational, authorized ArcGIS layers. Never substitute CSV samples. */
  async function initializeDrainDropdown() {
    try {
      const {drains, errors} = await loadDrainCatalog(mapElement.map, configuredLayerIds);
      if (disposed) return;
      catalog = drains;
      catalogByKey.clear();
      drainSelect.replaceChildren(new Option("Select a campus BMP…", ""));
      drainOptions(drains).forEach(({key, label}) => {
        catalogByKey.set(key, drains.find(item => item.key === key));
        drainSelect.add(new Option(label, key));
      });
      catalogAvailable = drains.length > 0;
      drainSelect.disabled = saving || !catalogAvailable;
      if (lastClickedFeature) {
        drainSelect.value = findMatchingDrain(drains, lastClickedFeature)?.key || "";
      }
      const noun = drains.length === 1 ? "BMP" : "BMPs";
      selectionMessage.textContent = selectedFacility ? selectionMessage.textContent : drains.length
        ? `${drains.length} ${noun} loaded from the UMBC ArcGIS map. Select one here or click a map marker.${errors.length ? ` ${errors.length} layer(s) could not be queried; the list may be incomplete.` : ""}`
        : `No queryable BMP features found. ${errors.length ? "ArcGIS layer queries failed; check layer permissions." : "Check the WebMap's BMP layer and its fields."}`;
    } catch {
      if (disposed) return;
      drainSelect.replaceChildren(new Option("BMP list unavailable", ""));
      catalogAvailable = false;
      drainSelect.disabled = true;
      selectionMessage.textContent = "Unable to load the BMP list from ArcGIS. Map-marker selection is still available.";
    }
  }

  /** Selection from the dropdown centers and highlights the ORIGINAL map feature. */
  async function selectFromDropdown() {
    const key = drainSelect.value;
    if (!key || saving) return;
    const entry = catalogByKey.get(key);
    if (!entry) return;
    const request = ++selectionCounter;
    const feature = entry.graphic;
    try {
      showFacility(extractFacility(feature), feature);
      await highlighter.select(feature);
      if (request !== selectionCounter || disposed) return;
      const target = feature.geometry;
      if (target && typeof mapElement.view?.goTo === "function") {
        // Maintain useful detail even when a previous click left the map zoomed out.
        // This call changes only the camera; it does not modify source features.
        const view = mapElement.view;
        const zoom = target.type === "point" ? Math.max(17, Number(view.zoom) || 0) : undefined;
        await view.goTo(zoom === undefined ? {target} : {target, zoom}, {duration: 650});
      }
    } catch {
      if (request === selectionCounter && !disposed) {
        selectionMessage.textContent = `Selected ${entry.name}; the map could not center on that feature. Facility details are still available.`;
      }
    }
  }

  drainSelect.addEventListener("change", selectFromDropdown);
  void initializeDrainDropdown();

  async function handleClick(event) {
    if (saving) return;  // The selection stays put until the save finishes.
    const request = ++selectionCounter;
    selectionMessage.textContent = "Reading the selected ArcGIS feature…";
    try {
      // Ignore our own selected-marker rings during hit testing, so clicking
      // another BMP (or the same one again) still finds real ArcGIS features.
      const hit = await mapElement.hitTest(
        event.detail,
        mapElement.view?.graphics ? {exclude: mapElement.view.graphics} : undefined
      );
      let match = hit.results.find(result => result.type === "graphic" &&
        isBmpFeature(result.graphic, "auto", configuredLayerIds))?.graphic;

      // A saved WebMap can contain map-service sublayers that are exposed through
      // popup queries rather than the ordinary graphics hit-test.
      if (!match && typeof mapElement.fetchPopupFeatures === "function") {
        const generator = await mapElement.fetchPopupFeatures(event.detail.screenPoint, {
          pointerType: event.detail.pointerType
        });
        for await (const feature of generator) {
          if (isBmpFeature(feature, "auto", configuredLayerIds)) {
            match = feature;
            break;
          }
        }
      }
      if (request !== selectionCounter) return;
      if (!match) {
        selectionMessage.textContent = "No BMP feature was found at this point. Select a BMP by name or click a blue BMP marker.";
        return; // Keep previously selected facility and inspection draft intact.
      }

      // hitTest sometimes contains just the display fields. Query the entire
      // feature's attributes when the source supports OBJECTID queries.
      const layer = match.layer || match.sourceLayer;
      const objectIdName = layer?.objectIdField;
      const objectId = objectIdName ? match.attributes?.[objectIdName] : undefined;
      if (objectId !== undefined && objectId !== null && typeof layer?.queryFeatures === "function") {
        try {
          const full = await layer.queryFeatures({
            objectIds: [objectId], outFields: ["*"], returnGeometry: true
          });
          if (full.features.length) {
            match = full.features[0];
            // queryFeatures graphics might not carry a layer reference.
            if (!match.layer) match.layer = layer;
          }
        } catch {
          // Layer query may be restricted. Keep the real attributes already returned.
        }
      }
      if (request !== selectionCounter) return;
      lastClickedFeature = match;
      showFacility(extractFacility(match, event.detail.mapPoint), match);
      // Keep the named-drain selector in sync when the user clicks a map marker.
      const matching = findMatchingDrain(catalog, match);
      drainSelect.value = matching?.key || "";
      // Native ArcGIS highlighting and a visible gold ring follow the selected
      // point as the map pans/zooms. Previous selections are removed.
      await highlighter.select(match, event.detail.mapPoint);
    } catch {
      if (request === selectionCounter) {
        selectionMessage.textContent = "Couldn't read that feature. Confirm the ArcGIS layer permits viewing/querying features.";
      }
    }
  }

  // Only "Save inspection" saves; a native submit (Enter) does nothing.
  form.addEventListener("submit", event => event.preventDefault());
  // Clearing observations should never silently erase the selected asset identity.
  form.addEventListener("reset", event => {
    event.preventDefault();
    if (saving || unconfirmed) return;  // The button is disabled then too.
    form.elements.namedItem("inspection_type").value = "";
    form.elements.namedItem("inspection_result").value = "";
    form.elements.namedItem("observations").value = "";
    form.elements.namedItem("verified_campus_location").value = "";
    if (selectedFacility) populateInspection(selectedFacility, {preserveEdits: false});
  });
  startButton.addEventListener("click", () => {
    byId("inspection-draft").scrollIntoView({behavior: "smooth", block: "start"});
    form.elements.namedItem("inspection_type").focus({preventScroll: true});
  });
  mapElement.addEventListener("arcgisViewClick", handleClick);
  return () => {
    disposed = true;
    drainSelect.removeEventListener("change", selectFromDropdown);
    mapElement.removeEventListener("arcgisViewClick", handleClick);
    selectionCounter += 1; // Invalidates any pending map queries after cleanup.
    addressRequest += 1;   // Ignore geocoding that finishes after the map unmounts.
    highlighter.dispose();
    selectedIndicator.hidden = true;
  };
}
