export function normalizeUnderscoreName(name: string) {
  const normalized = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  return normalized;
}
