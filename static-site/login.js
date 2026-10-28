// DEMO ONLY: the form checks email format and that a test password is nonempty.
// It does NOT verify a real password or authenticate the user.
// Official identity verification still happens through ArcGIS OAuth.
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("login-error");
const submitButton = document.getElementById("sign-in-button");
const LOGIN_INTENT_KEY = "umbc-stormwater.arcgis.signin";

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  errorMessage.textContent = "";

  // This is UI validation only. ArcGIS determines the real account identity.
  if (!/^[^@\s]+@umbc\.edu$/i.test(email)) {
    errorMessage.textContent = "Enter an email address ending in @umbc.edu.";
    emailInput.focus();
    return;
  }

  if (passwordInput.value.length === 0) {
    errorMessage.textContent = "Enter any nonempty demo password (not your real UMBC password).";
    passwordInput.focus();
    return;
  }

  // A password is never passed to ArcGIS or stored by this page.
  passwordInput.value = "";
  submitButton.disabled = true;
  submitButton.textContent = "Opening secure sign-in…";
  try {
    // Only a sign-in intent flag is stored. Never store the email or a password.
    sessionStorage.setItem(LOGIN_INTENT_KEY, "1");
    // The app's ArcGIS OAuth callback is already registered at the site root (/).
    // map.js checks this flag and signs in via the ArcGIS IdentityManager.
    window.location.assign(new URL("./", window.location.href).href);
  } catch {
    submitButton.disabled = false;
    submitButton.textContent = "Sign in";
    errorMessage.textContent = "Couldn't open secure sign-in. Enable session storage and try again.";
  }
});
