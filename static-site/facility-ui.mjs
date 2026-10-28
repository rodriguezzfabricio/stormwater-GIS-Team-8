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

/** Prefill every known source field and render ALL original ArcGIS attributes.
 *  Inspection questions remain editable; source identifiers remain read-only.
 */
function populateInspection(facility) {
  const values = {
    facility_name: facility.facilityName,
    asset_tag: facility.assetTag,
    bmp_type: facility.bmpType,
    bmp_sequence: facility.sequence,
    swm_tracking_number: facility.trackingNumber,
    project_name: facility.projectName,
    outfall_point: facility.outfallPoint,
    drainage_area: facility.drainageArea,
    location: facility.location,
    nearby_address: facility.nearbyAddress,
    address_kind: facility.addressKind,
    latitude: facility.latitude,
    longitude: facility.longitude,
    source_excel_row: facility.sourceExcelRow,
    csv_index: facility.csvIndex,
    condition_status: facility.status,
    last_inspection: facility.lastInspection,
    source_layer: facility.source
  };
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (input) input.value = value || "Not provided by ArcGIS";
  }
  // Preserve the raw, unmodified source attribute snapshot for a future backend.
  // The tracking number distinguishes multiple facilities that share an MS4 ID.
  form.elements.namedItem("facility_reference").value = facility.facilityReference;
  form.elements.namedItem("arcgis_layer").value = facility.source;
  form.elements.namedItem("arcgis_fields").value = JSON.stringify(facility.rawAttributes);
  renderAttributes(facility.entries, inspectionFields);
  const reference = facility.facilityReference || facility.facilityName || "selected BMP";
  byId("inspection-selected-caption").textContent = `Linked to ${reference} — ArcGIS source data`;
  byId("inspection-selected-caption").classList.add("connected");
}

function showFacility(facility) {
  const request = ++addressRequest;
  selectedFacility = facility;
  const verifiedLocation = form.elements.namedItem("verified_campus_location");
  if (verifiedLocation) verifiedLocation.value = "";
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
  populateInspection(facility);
  selectionMessage.textContent = facility.entries.length
    ? `Selected ${displayName} from ${facility.source}. ${facility.entries.length} source attribute${facility.entries.length === 1 ? "" : "s"} returned (missing values labelled).`
    : "Selected an ArcGIS feature with no returned attributes.";
  startButton.disabled = false;
  void updateReadableLocation(facility, request);
}

/** Both the dropdown and the map click use exactly the same facility renderer. */
export function connectBmpSelection(mapElement, options = {}) {
  const configuredLayerIds = Array.isArray(options.bmpLayerIds) ? options.bmpLayerIds : [];
  const highlighter = createBmpHighlighter(mapElement);
  let catalog = [];
  let disposed = false;
  let lastClickedFeature = null;
  const catalogByKey = new Map();

  drainSelect.disabled = true;
  drainSelect.replaceChildren(new Option("Loading available drains…", ""));
  selectionMessage.textContent = "Loading BMP names from the live ArcGIS map…";

  /** Only read operational, authorized ArcGIS layers. Never substitute CSV samples. */
  async function initializeDrainDropdown() {
    try {
      const {drains, errors} = await loadDrainCatalog(mapElement.map, configuredLayerIds);
      if (disposed) return;
      catalog = drains;
      catalogByKey.clear();
      drainSelect.replaceChildren(new Option("Select a campus drain…", ""));
      drainOptions(drains).forEach(({key, label}) => {
        catalogByKey.set(key, drains.find(item => item.key === key));
        drainSelect.add(new Option(label, key));
      });
      drainSelect.disabled = drains.length === 0;
      if (lastClickedFeature) {
        drainSelect.value = findMatchingDrain(drains, lastClickedFeature)?.key || "";
      }
      const noun = drains.length === 1 ? "drain" : "drains";
      selectionMessage.textContent = selectedFacility ? selectionMessage.textContent : drains.length
        ? `${drains.length} ${noun} loaded from the UMBC ArcGIS map. Select one here or click a map marker.${errors.length ? ` ${errors.length} layer(s) could not be queried; the list may be incomplete.` : ""}`
        : `No queryable BMP features found. ${errors.length ? "ArcGIS layer queries failed; check layer permissions." : "Check the WebMap's BMP layer and its fields."}`;
    } catch {
      if (disposed) return;
      drainSelect.replaceChildren(new Option("Drain list unavailable", ""));
      drainSelect.disabled = true;
      selectionMessage.textContent = "Unable to load the drain list from ArcGIS. Map-marker selection is still available.";
    }
  }

  /** Selection from the dropdown centers and highlights the ORIGINAL map feature. */
  async function selectFromDropdown() {
    const key = drainSelect.value;
    if (!key) return;
    const entry = catalogByKey.get(key);
    if (!entry) return;
    const request = ++selectionCounter;
    const feature = entry.graphic;
    try {
      showFacility(extractFacility(feature));
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
        selectionMessage.textContent = "No BMP feature was found at this point. Select a drain by name or click a blue BMP marker.";
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
      showFacility(extractFacility(match, event.detail.mapPoint));
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

  // Frontend preview must never submit data to a server.
  form.addEventListener("submit", event => event.preventDefault());
  // Clearing observations should never silently erase the selected asset identity.
  form.addEventListener("reset", event => {
    event.preventDefault();
    form.elements.namedItem("inspection_type").value = "";
    form.elements.namedItem("inspection_result").value = "";
    form.elements.namedItem("observations").value = "";
    form.elements.namedItem("verified_campus_location").value = "";
    form.elements.namedItem("photos").value = "";
    if (selectedFacility) populateInspection(selectedFacility);
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
