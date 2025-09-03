// frontend/js/features/search.js
// Minimal placeholder. You can expand this later.

export function initSearch() {
  // If you already have a coordinate search UI, wire it here.
  // For now, this is a no-op so the app doesn’t break if the element isn’t present.
  const el = document.querySelector("#coord-search");
  if (!el) return;

  const input = el.querySelector("input[type=text]");
  const btn = el.querySelector("button");

  const go = () => {
    if (!input?.value) return;
    console.log("Search requested:", input.value);
    // TODO: parse coordinates and pan the map
  };

  btn?.addEventListener("click", go);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
}
