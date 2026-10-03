export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_RVB_API_URL;
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "EXPO_PUBLIC_RVB_API_URL is not set. Set it to your backend URL, e.g. http://192.168.1.100:5000 or http://localhost:5000 for web dev. See .env.example."
    );
  }
  const trimmed = raw.trim().replace(/\/+$/, "");
  // Basic URL validation
  try {
    const u = new URL(trimmed);
    if (!u.protocol.startsWith("http")) throw new Error("Invalid protocol");
    return trimmed;
  } catch {
    throw new Error(`EXPO_PUBLIC_RVB_API_URL is invalid: "${raw}". Expected http://host:port`);
  }
}

export function getSocketUrl(): string {
  // socket.io client connects to origin, not /api prefix path separately
  const base = getApiBaseUrl();
  try {
    const u = new URL(base);
    return u.origin;
  } catch {
    return base;
  }
}

export function getSocketPath(): string {
  return "/api/rvb/chats/socket";
}

export function isApiUrlConfigured(): boolean {
  try {
    getApiBaseUrl();
    return true;
  } catch {
    return false;
  }
}
