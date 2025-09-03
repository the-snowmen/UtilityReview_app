export async function getApiBase() {
  if (window.backend?.apiBase) return await window.backend.apiBase();
  return "http://localhost:5178"; // dev default
}

export async function apiGet(path) {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, { headers: { "accept":"application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const health = () => apiGet("/health");
