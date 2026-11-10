import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let win;
before(async () => {
  win = await import("../dist-electron/windows.js");
});

function get(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

describe("window security invariants", () => {
  for (const name of ["buildMainWindowOptions", "buildSetupWindowOptions"]) {
    it(`${name} locks down the renderer`, () => {
      const opts = win[name]("/preload.js", "http://localhost:5000");
      for (const inv of win.SECURITY_INVARIANTS) {
        assert.equal(get(opts, inv.key), inv.expected, inv.key);
      }
      assert.ok(typeof opts.webPreferences.preload === "string");
      assert.equal(opts.webPreferences.partition, "persist:hsh-desktop");
    });
  }
  it("main window carries the backend override for the sandboxed preload", () => {
    const opts = win.buildMainWindowOptions("/p.js", "http://192.168.1.9:5000");
    assert.ok(opts.webPreferences.additionalArguments.includes("--hsh-backend-url=http://192.168.1.9:5000"));
  });
  it("main window meets the desktop-experience minimums", () => {
    const opts = win.buildMainWindowOptions("/p.js", "http://localhost:5000");
    assert.ok(opts.minWidth >= 1024 && opts.minHeight >= 640);
    assert.ok(opts.width >= opts.minWidth && opts.height >= opts.minHeight);
  });
});
