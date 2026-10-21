// Applies the saved theme before first paint so a forced theme doesn't flash the system one.
// The full theme logic (toggle, theme-color tags) lives in src/main.ts. Key matches STORAGE_KEYS.theme.
try {
  var theme = JSON.parse(localStorage.getItem("lazymicrowave:v1:theme"));
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (e) {}
