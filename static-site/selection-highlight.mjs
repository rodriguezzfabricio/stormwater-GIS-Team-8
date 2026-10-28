/** Persistent native ArcGIS highlight + gold halo around the selected BMP.
 *  This is display-only: it never edits the source WebMap or its features.
 */
export function createBmpHighlighter(mapElement, importGraphic = () => $arcgis.import("@arcgis/core/Graphic.js")) {
  const view = mapElement.view;
  const group = "stormwater-selected-bmp";
  let useNamedGroup = false;
  let selectedHandle = null;
  let selectionRings = [];
  let latestRequest = 0;
  let disposed = false;
  let graphicClassPromise = null;

  // Configure a warm gold highlight instead of the default cyan, which blends
  // in with the original blue BMP markers. Different SDK versions may not
  // support custom groups, so the ordinary highlight remains a fallback.
  try {
    const highlights = view?.highlights || mapElement.highlights;
    if (typeof highlights?.add === "function") {
      highlights.add({name: group, color: "#f7bb32", haloOpacity: 1, fillOpacity: .3}, 0);
      useNamedGroup = true;
    }
  } catch { /* Keep default layer highlight if this SDK lacks named groups. */ }

  function clear() {
    selectedHandle?.remove();
    selectedHandle = null;
    if (selectionRings.length) view?.graphics?.removeMany(selectionRings);
    selectionRings = [];
  }

  async function select(feature, clickPoint = null) {
    const request = ++latestRequest;
    const layer = feature?.layer || feature?.sourceLayer;
    // Use the real feature coordinate for a point, not the pixel the user
    // happened to click within its large rendered teardrop symbol.
    const point = feature?.geometry?.type === "point"
      ? feature.geometry
      : clickPoint?.type === "point" ? clickPoint : null;
    let rings = [];

    if (point && view?.graphics) {
      try {
        graphicClassPromise ||= importGraphic();
        const Graphic = await graphicClassPromise;
        if (request !== latestRequest || disposed) return;
        // Two concentric outlines stay pinned to geographic coordinates while
        // panning/zooming, and visibly contrast against blue ArcGIS markers.
        const symbol = (size, color, width) => ({
          type: "simple-marker", style: "circle", size,
          color: [255, 255, 255, 0], outline: {color, width}
        });
        rings = [
          new Graphic({geometry: point, symbol: symbol(48, [20, 32, 51, 1], 5)}),
          new Graphic({geometry: point, symbol: symbol(42, [255, 194, 43, 1], 4)})
        ];
      } catch {
        // If ArcGIS can't create the marker overlay, still use native highlight.
      }
    }

    if (request !== latestRequest || disposed) return;
    clear();
    if (rings.length) {
      try {
        view.graphics.addMany(rings);
        selectionRings = rings;
      } catch { /* Highlight or the on-map label can still identify the BMP. */ }
    }

    // Native layer highlights work for points AND polygons. The object ID is
    // preferred because a queried graphic might not retain its layer binding.
    if (layer && typeof view?.whenLayerView === "function") {
      try {
        const layerView = await view.whenLayerView(layer);
        if (request !== latestRequest || disposed) return;
        if (typeof layerView.highlight === "function") {
          const objectIdField = layer.objectIdField;
          const id = objectIdField && feature.attributes?.[objectIdField];
          const target = id === undefined || id === null ? feature : id;
          selectedHandle = useNamedGroup
            ? layerView.highlight(target, {name: group})
            : layerView.highlight(target);
        }
      } catch {
        // Some secure service sublayers don't support native highlighting;
        // the gold ring and selected-name pill still remain visible.
      }
    }
  }

  function dispose() {
    disposed = true;
    latestRequest += 1;
    clear();
  }

  return {select, dispose};
}
