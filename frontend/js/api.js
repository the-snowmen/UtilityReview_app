// Optional: a tiny wrapper your UI can import instead of touching window.backend directly
export const backend = window.backend;

// handy helpers
export async function importVectorViaDialog() {
  const pick = await backend.selectFiles();
  if (!pick.ok || !pick.files?.length) return null;
  const first = pick.files[0];
  return backend.ingestFile(first, null, null); // { ok, layer }
}
