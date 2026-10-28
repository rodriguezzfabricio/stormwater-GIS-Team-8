// Supabase connection for inspection-backend.mjs. Load this BEFORE that module.
// Only the PUBLIC project URL and publishable key belong here; row rules and
// database functions protect the data. Never add a service role key, a client
// secret, a database password or an access token.
window.STORMWATER_SUPABASE = Object.freeze({
  url: "https://fsrsldketzmcjyvjueki.supabase.co",
  publishableKey: "sb_publishable_CHlreM6iIfKeSCvdjVuBJw_-M0hGv8J",
  // Pages Google may return to after sign-in. The first one is "the" sign-in page.
  signInPages: ["login.html", "backend-check.html"]
});
