// STEP 1: Register OAuth 2.0 user-authentication credentials with UMBC ArcGIS.
// STEP 2: Add this exact redirect URL to the app's redirect allowlist:
//         http://localhost:5500/
// STEP 3: Paste ONLY the public Client ID below (never a client secret or token).
// For alternate ports/hosts, register their exact application URLs as well.
window.STORMWATER_CONFIG = Object.freeze({
  arcgisClientId: "Nvy4Fh37gFLvyuq0",  // Example format: "abc123..." — from an approved registered ArcGIS OAuth app.
  portalUrl: "https://www.arcgis.com",
  webMapId: "d59cb5cc77914e6c96631b856c667129"
});
