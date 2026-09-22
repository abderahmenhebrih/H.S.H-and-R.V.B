export const RVB_TAG_REGEX = /^[a-z0-9][a-z0-9._]{2,29}$/;
export const RVB_TAG_MIN = 3;
export const RVB_TAG_MAX = 30;

export function normalizeTag(input: string): string {
  let s = (input || "").trim().toLowerCase();
  if (s.startsWith("@")) s = s.slice(1);
  s = s.trim();
  return s;
}

export function isValidTag(tag: string): boolean {
  return RVB_TAG_REGEX.test(tag);
}
