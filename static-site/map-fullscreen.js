// UMBC Stormwater: fullscreen presentation for the existing ArcGIS map.
// No new WebMap, no navigation, no reauthentication, and no extra layer queries.
const card = document.getElementById("stormwater-map-card");
const exitButton = document.getElementById("exit-map-fullscreen");
const expandButtons = document.querySelectorAll("[data-map-expand]");
let usingFallback = false;
let previousFocus = null;
let wasOpen = false;
let isOpening = false;

function isFullscreen() {
  return document.fullscreenElement === card || usingFallback;
}

// The ArcGIS component responds to container resizing automatically; calling
// view.resize() as a fallback also covers versions that don't observe it.
function resizeExistingMap() {
  requestAnimationFrame(() => {
    const view = card.querySelector("arcgis-map")?.view;
    if (typeof view?.resize === "function") view.resize();
  });
}

function synchronizeUi() {
  const open = isFullscreen();
  document.documentElement.classList.toggle("map-fullscreen-active", open);
  if (wasOpen && !open && previousFocus?.isConnected) {
    previousFocus.focus({preventScroll:true});
  }
  if (!wasOpen && open) exitButton.focus({preventScroll:true});
  wasOpen = open;
  resizeExistingMap();
}

async function openMap() {
  if (isFullscreen() || isOpening) return;
  isOpening = true;
  previousFocus = document.activeElement;
  try {
    if (!card.requestFullscreen) throw new Error("Fullscreen API unavailable");
    await card.requestFullscreen();
  } catch {
    // Safari/iPad or browser-policy fallback: cover the viewport using CSS.
    usingFallback = true;
    card.classList.add("fullscreen-fallback");
  } finally {
    isOpening = false;
    synchronizeUi();
  }
}

async function closeMap() {
  if (document.fullscreenElement === card) {
    try { await document.exitFullscreen(); }
    catch { /* Allow controls to remain usable if the browser refuses. */ }
  }
  if (usingFallback) {
    usingFallback = false;
    card.classList.remove("fullscreen-fallback");
  }
  synchronizeUi();
}

for (const button of expandButtons) {
  button.addEventListener("click", openMap);
}
exitButton.addEventListener("click", closeMap);
document.addEventListener("fullscreenchange", synchronizeUi);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && isFullscreen()) {
    event.preventDefault();
    closeMap();
  }
});
