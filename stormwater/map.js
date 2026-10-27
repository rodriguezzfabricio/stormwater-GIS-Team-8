// ArcGIS Maps SDK (CDN) integration for the static site. No iframe or backend.
// The SDK owns OAuth and tokens; this app never reads or logs token values.
const settings = window.STORMWATER_CONFIG || {};
const surface = document.getElementById("map-surface");
const placeholder = document.getElementById("map-placeholder");
const title = document.getElementById("map-status-title");
const description = document.getElementById("map-status-body");
const help = document.getElementById("map-status-help");
const signInButton = document.getElementById("arcgis-sign-in");
const accessDescription = document.getElementById("map-access-description");

function showStatus(heading, message, hint = "Open full map in a new tab if you need access now.") {
  title.textContent = heading;
  description.textContent = message;
  help.textContent = hint;
  placeholder.hidden = false;
}

async function start() {
  const clientId = String(settings.arcgisClientId || "").trim();
  if (!clientId) {
    showStatus(
      "One-time ArcGIS setup required",
      "The map is restricted to authorized users. Ask your UMBC ArcGIS administrator for an OAuth application Client ID, then add it to arcgis-config.js.",
      "Register http://localhost:5500/ as an approved redirect URL. Never add a client secret or access token."
    );
    accessDescription.textContent = "Full-tab access works now. The in-page map needs a registered OAuth Client ID.";
    return;
  }

  showStatus("Initializing ArcGIS", "Connecting to the ArcGIS Maps SDK…");
  try {
    // Register OAuth before creating the map component so the first
    // request to the secured WebMap uses the supported user-auth flow.
    const [esriConfig, identityManager, OAuthInfo] = await $arcgis.import([
      "@arcgis/core/config.js",
      "@arcgis/core/identity/IdentityManager.js",
      "@arcgis/core/identity/OAuthInfo.js"
    ]);
    esriConfig.portalUrl = settings.portalUrl || "https://www.arcgis.com";
    const oauth = new OAuthInfo({
      appId: clientId,
      portalUrl: esriConfig.portalUrl,
      popup: false,  // Full-page redirect avoids the iframe popup callback failure.
      flowType: "auto"  // ArcGIS Online uses authorization-code + PKCE.
    });
    identityManager.registerOAuthInfos([oauth]);
    const sharingUrl = `${oauth.portalUrl}/sharing`;

    async function showMap() {
      signInButton.hidden = true;
      showStatus("Loading campus map", "Loading UMBC's original WebMap and its saved layers…");
      const mapElement = document.createElement("arcgis-map");
      mapElement.setAttribute("item-id", settings.webMapId);
      mapElement.setAttribute("popup-component-enabled", "");
      mapElement.addEventListener("arcgisViewReadyError", () => {
        showStatus("ArcGIS map could not finish loading", "The map or an underlying layer may require more access. Confirm ArcGIS item and layer sharing permissions.");
      });
      const search = document.createElement("arcgis-search");
      search.slot = "top-right";
      const legend = document.createElement("arcgis-legend");
      legend.slot = "bottom-left";
      mapElement.append(search, legend);
      surface.append(mapElement);
      try {
        await mapElement.viewOnReady();
        placeholder.hidden = true;
        accessDescription.textContent = "Connected to your UMBC ArcGIS WebMap using the Maps SDK.";
      } catch (error) {
        // Do not log SDK errors indiscriminately: auth redirects could expose tokens.
        showStatus("Unable to display the secured map", "Check the registered OAuth redirect URL, UMBC sharing permissions, and browser developer console.");
      }
    }

    signInButton.addEventListener("click", async () => {
      signInButton.disabled = true;
      showStatus("Opening UMBC sign-in", "You will be redirected to ArcGIS to authenticate, then returned to this page.");
      try {
        await identityManager.getCredential(sharingUrl);
        await showMap();
      } catch {
        showStatus("Sign-in was not completed", "Check that your OAuth Client ID and registered redirect URL match this local site.");
        signInButton.hidden = false;
      } finally {
        signInButton.disabled = false;
      }
    });

    try {
      await identityManager.checkSignInStatus(sharingUrl);
      await showMap();
    } catch {
      showStatus("Sign in to load the UMBC map", "Use the registered ArcGIS organizational sign-in. This login occurs in the full browser tab, not inside a third-party iframe.");
      signInButton.hidden = false;
      accessDescription.textContent = "Authorized sign-in is available; choose Sign in to load the secured WebMap.";
    }
  } catch {
    showStatus("Could not initialize ArcGIS", "Verify your internet connection and that the ArcGIS SDK CDN can load. You can still access the original map above.");
  }
}

start();
