// Light / dark toggle shared by all pages. Loaded in <head> so the saved
// theme is applied before the page is drawn (no white flash).
(function () {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  if (saved === "dark") root.dataset.theme = "dark";

  document.addEventListener("DOMContentLoaded", function () {
    const button = document.createElement("button");
    button.className = "theme-toggle";
    const label = () => (button.textContent = root.dataset.theme === "dark" ? "☀ Light mode" : "☾ Dark mode");
    label();
    button.addEventListener("click", function () {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      label();
    });
    document.body.appendChild(button);
  });
})();
