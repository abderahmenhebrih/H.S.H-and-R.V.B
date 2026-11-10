import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let ipc;
before(async () => {
  ipc = await import("../dist-electron/ipc.js");
});

describe("IPC allowlist", () => {
  it("exposes exactly the documented channels", () => {
    assert.deepEqual([...ipc.IPC_CHANNELS].sort(), [
      "hsh:frontend-ready",
      "hsh:get-config",
      "hsh:get-versions",
      "hsh:open-external",
      "hsh:print",
      "hsh:select-files",
      "hsh:set-backend-url",
      "hsh:validate-backend",
    ]);
    assert.equal(ipc.isAllowedChannel("hsh:print"), true);
    assert.equal(ipc.isAllowedChannel("ipcRenderer"), false);
    assert.equal(ipc.isAllowedChannel("electron"), false);
  });
  it("rejects oversized/typed-wrong backend URLs", () => {
    assert.throws(() => ipc.validateIpcArgs("hsh:set-backend-url", []));
    assert.throws(() => ipc.validateIpcArgs("hsh:set-backend-url", [42]));
    assert.throws(() => ipc.validateIpcArgs("hsh:set-backend-url", ["x".repeat(3000)]));
    assert.deepEqual(ipc.validateIpcArgs("hsh:set-backend-url", ["http://h:1"]), ["http://h:1"]);
  });
  it("constrains print and file options to known booleans", () => {
    assert.deepEqual(ipc.validateIpcArgs("hsh:print", []), [{}]);
    assert.deepEqual(ipc.validateIpcArgs("hsh:print", [{ silent: true }]), [{ silent: true }]);
    assert.throws(() => ipc.validateIpcArgs("hsh:print", [{ silent: "yes" }]));
    assert.throws(() => ipc.validateIpcArgs("hsh:print", [{ exec: "calc.exe" }]));
    assert.throws(() => ipc.validateIpcArgs("hsh:select-files", [{ multiple: 1 }]));
  });
  it("only opens http(s) externally", () => {
    assert.deepEqual(ipc.validateIpcArgs("hsh:open-external", ["https://a.b/"]), ["https://a.b/"]);
    assert.throws(() => ipc.validateIpcArgs("hsh:open-external", ["file:///c:/x"]));
    assert.throws(() => ipc.validateIpcArgs("hsh:open-external", ["javascript:1"]));
  });
  it("rejects unknown channels", () => {
    assert.throws(() => ipc.validateIpcArgs("whatever", []));
  });
});
