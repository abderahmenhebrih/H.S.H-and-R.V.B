export const RVB_TAG_REGEX = /^[a-z0-9][a-z0-9._]{2,29}$/;

export function normalizeTag(input: string): string {
  let s = (input || "").trim().toLowerCase();
  if (s.startsWith("@")) s = s.slice(1);
  s = s.trim();
  return s;
}

export function isValidTag(tag: string): boolean {
  return RVB_TAG_REGEX.test(tag);
}

export function validateTagInput(raw: string): string | null {
  const normalized = normalizeTag(raw);
  if (!normalized) return "Tag is required";
  if (normalized.length < 3) return "Tag must be at least 3 characters";
  if (normalized.length > 30) return "Tag must be at most 30 characters";
  if (!isValidTag(normalized)) return "Tag must match ^[a-z0-9][a-z0-9._]{2,29}$";
  return null;
}
