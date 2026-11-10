import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

let cfg;
before(async () => {
  cfg = await import("../dist-electron/config.js");
});

describe("normalizeBackendUrl", () => {
  it("accepts loopback, LAN, and https hosts", () => {
    assert.equal(cfg.normalizeBackendUrl("http://localhost:5000"), "http://localhost:5000");
    assert.equal(cfg.normalizeBackendUrl("http://192.168.1.20:5000/"), "http://192.168.1.20:5000");
    assert.equal(cfg.normalizeBackendUrl("https://hsh.example.com"), "https://hsh.example.com");
  });
  it("rejects non-http schemes, credentials, spaces, and empties", () => {
    for (const bad of ["", "  ", "ftp://x/y", "file:///etc/passwd", "http://user:pw@h/x", "http://ho st:5000", "notaurl", "http://"]) {
      assert.throws(() => cfg.normalizeBackendUrl(bad), /./, bad || "(empty)");
    }
  });
});

describe("validateFrontendPort", () => {
  it("accepts 1024..65535", () => {
    assert.equal(cfg.validateFrontendPort(3123), 3123);
    assert.equal(cfg.validateFrontendPort("3123"), 3123);
  });
  it("rejects privileged, huge, fractional, and non-numeric", () => {
    for (const bad of [80, 0, 70000, 3.5, "abc", null, undefined, {}, []]) {
      assert.throws(() => cfg.validateFrontendPort(bad));
    }
  });
});

describe("config persistence (app data only, never business data)", () => {
  it("round-trips and heals corrupt files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hshd-cfg-"));
    const saved = { backendUrl: "http://192.168.1.9:5000", frontendPort: 4000, configuredAt: "t", lastVerifiedAt: "v" };
    cfg.saveConfig(dir, saved);
    assert.deepEqual(cfg.loadConfig(dir), saved);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
    assert.deepEqual(Object.keys(stored).sort(), ["backendUrl", "configuredAt", "frontendPort", "lastVerifiedAt"]);
    fs.writeFileSync(path.join(dir, "config.json"), "{corrupt");
    assert.equal(cfg.loadConfig(dir).backendUrl, "http://localhost:5000");
  });
});

describe("probeBackend against a stub HSH API", () => {
  let base;
  let server;
  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "ok" }));
      } else if (req.url === "/api/ready") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ready: true }));
      } else {
        res.writeHead(404);
        res.end("{}");
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  it("verifies health + ready", async () => {
    const p = await cfg.probeBackend(base, 3000);
    assert.equal(p.reachable, true);
    assert.equal(p.health, true);
    assert.equal(p.ready, true);
  });
  it("reports unreachable hosts without throwing", async () => {
    const p = await cfg.probeBackend("http://127.0.0.1:1", 1500);
    assert.equal(p.reachable, false);
    assert.equal(p.health, false);
  });
  it("rejects non-HSH responders", async () => {
    const other = http.createServer((_q, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    await new Promise((r) => other.listen(0, "127.0.0.1", r));
    const p = await cfg.probeBackend(`http://127.0.0.1:${other.address().port}`, 3000);
    assert.equal(p.health, false);
    other.close();
    server.close();
  });
});
