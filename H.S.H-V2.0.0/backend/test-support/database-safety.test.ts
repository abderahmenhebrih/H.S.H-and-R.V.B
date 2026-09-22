import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import dns from "node:dns";
import path from "node:path";
import { after, before, test } from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { configureDatabaseDns } from "../src/config/dns";

const backendRoot = path.resolve(__dirname, "..");
let sentinelServer: MongoMemoryServer;
let sentinelClient: MongoClient;
let sentinelUri: string;
const collections = ["rvb_accounts", "rvb_sessions", "workers", "suppliers", "customers"];
const marker = {
  id: "preserve-this-record", tag: "safety.owner", role: "manager",
  status: "active", passwordHash: "dummy-hash-never-print", marker: "unchanged",
};

async function runChild(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", ...args], {
      cwd: backendRoot,
      env: {
        ...process.env,
        MONGODB_URI: sentinelUri,
        NODE_ENV: "test",
        RVB_JWT_ACCESS_SECRET: "safety-access-fixture-do-not-print-32chars",
        RVB_JWT_REFRESH_SECRET: "safety-refresh-fixture-do-not-print-32chars",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => child.kill(), 120000);
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.stderr.on("data", (data) => { output += data.toString(); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
}

async function assertSentinelIntact() {
  for (const name of collections) {
    const records = await sentinelClient.db().collection(name).find({}, { projection: { _id: 0 } }).toArray();
    assert.deepEqual(records, [marker], name + " in the application sentinel changed");
  }
}

before(async () => {
  sentinelServer = await MongoMemoryServer.create({ instance: {
    ip: "127.0.0.1",
    args: process.platform === "win32" ? [] : ["--nounixsocket"],
  } });
  sentinelUri = sentinelServer.getUri("rvb_application_sentinel");
  sentinelClient = await MongoClient.connect(sentinelUri);
  for (const name of collections) {
    await sentinelClient.db().collection(name).insertOne({ ...marker });
  }
});

after(async () => {
  await sentinelClient?.close();
  await sentinelServer?.stop();
});

for (const script of ["test-phase2.ts", "test-phase2-security.ts", "test-rvb-account.ts", "test-rvb-account-isolated.ts"]) {
  test(script + " ignores application MONGODB_URI and preserves all sentinel records", async () => {
    const result = await runChild([script]);
    assert.equal(result.code, 0, result.output.slice(-5000));
    assert.match(result.output, /application URI ignored/);
    assert.doesNotMatch(result.output, /cookies=rvb_refresh_token/);
    await assertSentinelIntact();
    const summary = result.output.match(/(?:FINAL RESULTS|Security tests|RESULTS): [^\r\n]+/);
    if (summary) console.log(script + ": " + summary[0]);
  });
}

test("temporary database startup failure never falls back to the application database", async () => {
  const result = await runChild(["test-phase2-security.ts"], {
    MONGOMS_SYSTEM_BINARY: path.join(backendRoot, "test-support", "missing-mongod-for-safety-test"),
  });
  assert.notEqual(result.code, 0);
  assert.doesNotMatch(result.output, /application URI ignored/);
  await assertSentinelIntact();
});

test("account diagnostic is read-only and does not disclose passwords, hashes, or secrets", async () => {
  const result = await runChild(["scripts/check-rvb-account.ts", "@Safety.Owner"]);
  assert.equal(result.code, 0, result.output);
  const report = JSON.parse(result.output);
  assert.equal(report.database, "rvb_application_sentinel");
  assert.equal(report.found, true);
  assert.equal(report.totalAccounts, 1);
  assert.equal(report.account.hasPassword, true);
  assert.doesNotMatch(result.output, /dummy-hash-never-print|safety-access-fixture|safety-refresh-fixture|mongodb:\/\//);
  await assertSentinelIntact();
});

test("DNS configuration preserves defaults, accepts an explicit override, and rejects invalid entries", () => {
  const originalServers = dns.getServers();
  const originalSetting = process.env.MONGODB_DNS_SERVERS;
  try {
    delete process.env.MONGODB_DNS_SERVERS;
    configureDatabaseDns();
    assert.deepEqual(dns.getServers(), originalServers);
    process.env.MONGODB_DNS_SERVERS = "192.0.2.53, 198.51.100.53";
    configureDatabaseDns();
    assert.deepEqual(dns.getServers(), ["192.0.2.53", "198.51.100.53"]);
    process.env.MONGODB_DNS_SERVERS = "not-an-address";
    assert.throws(configureDatabaseDns, /valid DNS server IP/);
    process.env.MONGODB_DNS_SERVERS = "192.0.2.53,";
    assert.throws(configureDatabaseDns, /empty DNS server/);
  } finally {
    dns.setServers(originalServers);
    if (originalSetting === undefined) delete process.env.MONGODB_DNS_SERVERS;
    else process.env.MONGODB_DNS_SERVERS = originalSetting;
  }
});
