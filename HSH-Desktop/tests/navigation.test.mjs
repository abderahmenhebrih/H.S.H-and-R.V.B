import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let nav;
before(async () => {
  nav = await import("../dist-electron/navigation.js");
});

const FE = "http://localhost:3123";
const BE = "http://192.168.1.9:5000";

describe("top-level navigation", () => {
  it("allows the packaged frontend origin (incl. deep routes)", () => {
    assert.deepEqual(nav.classifyTopNavigation("http://localhost:3123/", FE), { action: "allow" });
    assert.deepEqual(nav.classifyTopNavigation("http://localhost:3123/rvb/chats", FE), { action: "allow" });
  });
  it("sends foreign http(s) to the system browser", () => {
    const d = nav.classifyTopNavigation("https://example.com/x", FE);
    assert.equal(d.action, "open-external");
    const b = nav.classifyTopNavigation(BE + "/api/health", FE);
    assert.equal(b.action, "open-external");
  });
  it("denies non-http schemes and garbage", () => {
    assert.equal(nav.classifyTopNavigation("file:///etc/passwd", FE).action, "deny");
    assert.equal(nav.classifyTopNavigation("javascript:alert(1)", FE).action, "deny");
    assert.equal(nav.classifyTopNavigation(":::", FE).action, "deny");
  });
});

describe("popups", () => {
  it("allows same-origin popups (print previews), denies blank", () => {
    assert.equal(nav.classifyPopup("http://localhost:3123/invoice/print-preview", FE).action, "allow");
    assert.equal(nav.classifyPopup("about:blank", FE).action, "deny");
    assert.equal(nav.classifyPopup("https://ads.example/", FE).action, "open-external");
  });
});

describe("backend document guard", () => {
  it("flags the API origin as never-a-document", () => {
    assert.equal(nav.isBackendDocumentNavigation(BE + "/api/health", BE, FE), true);
    assert.equal(nav.isBackendDocumentNavigation(FE + "/sales", BE, FE), false);
  });
});
