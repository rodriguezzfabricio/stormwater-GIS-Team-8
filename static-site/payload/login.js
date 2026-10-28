// The website never collects, handles, or stores a UMBC password.
// The ArcGIS OAuth flow must start at the site's registered redirect URL (/).
const signInButton = document.getElementById("login-with-arcgis");
const errorMessage = document.getElementById("login-error");
const LOGIN_INTENT_KEY = "umbc-stormwater.arcgis.signin";

signInButton.addEventListener("click", () => {
  signInButton.disabled = true;
  errorMessage.textContent = "";

  try {
    // Only a boolean intent is stored; no user credential or token.
    sessionStorage.setItem(LOGIN_INTENT_KEY, "1");
    // The existing ArcGIS OAuth app already has this exact root URL registered.
    // map.js will start sign-in there and then load the secured WebMap.
    window.location.assign(new URL("./", window.location.href).href);
  } catch {
    signInButton.disabled = false;
    errorMessage.textContent = "Unable to begin sign-in. Enable session storage and try again.";
  }
});
