import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.join(here, "..", "electron", "preload.ts"), "utf8");
// Strip comments: the policy text itself names the forbidden patterns.
const preloadSrc = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("preload self-containment (sandbox cannot require relatives)", () => {
  it("has no relative imports/requires", () => {
    assert.ok(!/from\s+["']\.\//.test(preloadSrc), "relative import found");
    assert.ok(!/require\(\s*["']\.\//.test(preloadSrc), "relative require found");
  });
  it("mirrors the tested IPC allowlist and constants", async () => {
    const ipc = await import("../dist-electron/ipc.js");
    const constants = await import("../dist-electron/constants.js");
    for (const ch of ipc.IPC_CHANNELS) {
      assert.ok(preloadSrc.includes(`"${ch}"`), `channel missing in preload: ${ch}`);
    }
    assert.ok(
      preloadSrc.includes(constants.DESKTOP_API_URL_WINDOW_KEY),
      "window key missing in preload",
    );
  });
});
