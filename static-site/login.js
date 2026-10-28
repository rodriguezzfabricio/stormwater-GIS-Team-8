const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("login-error");

loginForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    errorMessage.textContent = "";

    // Only allow UMBC email addresses
    if (!email.endsWith("@umbc.edu")) {
        errorMessage.textContent = "Please enter a valid @umbc.edu email address.";
        return;
    }

    // Require a password
    if (password.length === 0) {
        errorMessage.textContent = "Please enter your password.";
        return;
    }

    // Temporary login behavior until Supabase authentication is connected
    window.location.href = "index.html";
});