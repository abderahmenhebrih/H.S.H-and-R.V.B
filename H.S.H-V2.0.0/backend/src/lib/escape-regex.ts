/**
 * Escape a user string for safe embedding in a MongoDB $regex.
 * Single canonical implementation (previously copy-pasted in 6 places).
 */
export function escapeRegex(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
