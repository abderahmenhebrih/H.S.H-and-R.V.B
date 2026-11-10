// Navigation policy: pure URL classifier, unit-tested without Electron.
//
// - Top-level navigation inside the privileged window: frontend origin only.
// - Popup (window.open) requests: frontend origin only; anything else is either
//   opened in the system browser (http/https) or denied.
// - API/media/subresource traffic to the configured backend is NOT top-level
//   navigation and is unaffected; only frame/window navigation is policed here.

export type NavigationDecision =
  | { action: "allow" }
  | { action: "open-external"; url: string }
  | { action: "deny"; reason: string };

function safeParse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.host === b.host;
}

export function classifyTopNavigation(url: string, frontendOrigin: string): NavigationDecision {
  const target = safeParse(url);
  const home = safeParse(frontendOrigin);
  if (!target || !home) return { action: "deny", reason: "Malformed URL." };
  if (sameOrigin(target, home)) return { action: "allow" };
  if (target.protocol === "http:" || target.protocol === "https:") {
    return { action: "open-external", url: target.toString() };
  }
  return { action: "deny", reason: `Blocked navigation to ${target.protocol}.` };
}

export function classifyPopup(url: string, frontendOrigin: string): NavigationDecision {
  if (url === "" || url === "about:blank") return { action: "deny", reason: "Empty popup." };
  return classifyTopNavigation(url, frontendOrigin);
}

// The backend API origin is allowed as a fetch/XHR/websocket target but must
// never become the top-level document of the privileged window.
export function isBackendDocumentNavigation(url: string, backendUrl: string, frontendOrigin: string): boolean {
  const target = safeParse(url);
  const api = safeParse(backendUrl);
  const home = safeParse(frontendOrigin);
  if (!target || !api || !home) return true;
  return sameOrigin(target, api) && !sameOrigin(target, home);
}
