export function formatTag(tag: string): string {
  if (!tag) return "";
  return tag.startsWith("@") ? tag : `@${tag}`;
}

export function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
