import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let srv;
before(async () => {
  srv = await import("../dist-electron/server.js");
});

// Minimal stand-in for Next's server.js: answers HTTP using PORT/HOSTNAME.
const STUB = `const http=require("http");const s=http.createServer((q,r)=>{r.writeHead(200,{"content-type":"text/html"});r.end("<html>hsh</html>");});s.listen(Number(process.env.PORT||3123),process.env.HOSTNAME||"localhost");`;

describe("frontend runtime lifecycle", () => {
  it("starts, answers, and stops cleanly (no orphan process)", async () => {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "hshd-stage-"));
    fs.mkdirSync(path.join(staging, "frontend-standalone"), { recursive: true });
    fs.writeFileSync(path.join(staging, "frontend-standalone", "server.js"), STUB);
    const port = await srv.findFreePort(41823);
    const rt = await srv.startFrontendRuntime({ stagingDir: staging, port, backendUrl: "http://localhost:5000", timeoutMs: 15000 });
    assert.ok(rt.origin.includes(String(port)));
    const res = await fetch(rt.origin);
    assert.equal(res.status, 200);
    await rt.stop();
  });
  it("refuses to start without a staged runtime", async () => {
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "hshd-empty-"));
    await assert.rejects(() => srv.startFrontendRuntime({ stagingDir: staging, port: 41824, backendUrl: "http://localhost:5000", timeoutMs: 2000 }), /missing/i);
  });
  it("resolveStagingDir keeps on-disk staging outside Electron", () => {
    assert.equal(srv.resolveStagingDir("/x/staging"), "/x/staging");
  });
});
