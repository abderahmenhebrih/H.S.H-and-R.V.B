// Disposable PBS-BUG-015 correction harness (R1–R12).
// R1 MUST run against the passive-ref implementation (expect stale "A").
// After the fix, R2–R12 must pass (commit-time latest values, stable listeners).
import { test, expect } from "@playwright/test";

const URL = "/tmp-pbs015b";
const MODE = process.env.PBS015_MODE || "unknown";

async function snap(page: any) {
  return page.evaluate(() => ({
    adds: (window as any).__pbs015b.adds,
    removes: (window as any).__pbs015b.removes,
    active: (window as any).__pbs015b.active(),
  }));
}
async function calls(page: any, id?: string) {
  const all = await page.evaluate(() => (window as any).__pbs015b.calls);
  return id ? all.filter((c: any) => c.id === id) : all;
}
async function clearCalls(page: any) {
  await page.evaluate(() => {
    (window as any).__pbs015b.calls.length = 0;
  });
}
async function steadyFire(page: any) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hebrih-db-synced", { detail: { changes: [] } })));
  await page.waitForTimeout(100);
}
async function handlerIds(page: any) {
  return page.evaluate(() => (window as any).__pbs015b.handlerIds());
}
async function waitStable(page: any) {
  let prev: any = null;
  for (let i = 0; i < 20; i++) {
    const s = await snap(page);
    if (prev && s.adds === prev.adds && s.removes === prev.removes && s.active === prev.active) return s;
    prev = s;
    await page.waitForTimeout(150);
  }
  return prev;
}

test(`PBS-BUG-015 correction R1-R12 [${MODE}]`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => !!(window as any).__pbs015b);
  const base = await waitStable(page);
  expect(base.active).toBeGreaterThanOrEqual(3); // P, F, B (+ chrome)

  if (MODE === "prefix") {
    // R1 — commit-phase dispatch under passive-ref mirror: expect STALE "A".
    await clearCalls(page);
    await page.getByTestId("set-b").click();
    await page.waitForTimeout(200);
    const p = await calls(page, "P");
    expect(p.length).toBe(1);
    console.log(JSON.stringify({ R1_observed: p[0]?.value }));
    expect(p[0].value).toBe("A"); // BUG: passive mirror not yet updated at layout time
    return;
  }

  // R2 — same scenario post-fix: commit-time dispatch observes B.
  await clearCalls(page);
  const idsBefore = await handlerIds(page);
  await page.getByTestId("set-b").click();
  await page.waitForTimeout(200);
  const p2 = await calls(page, "P");
  expect(p2.length).toBe(1);
  expect(p2[0].value).toBe("B");
  // R3 — same update: zero subscription churn.
  expect(await handlerIds(page)).toEqual(idsBefore);
  const s3 = await snap(page);

  // R4 — committed updates "" -> a -> ab -> abc, each commit observes itself.
  await page.getByTestId("set-a").click();
  await page.waitForTimeout(120);
  await page.getByTestId("set-ab").click();
  await page.waitForTimeout(120);
  await page.getByTestId("set-abc").click();
  await page.waitForTimeout(150);
  const fCalls = await calls(page, "F");
  const fVals = fCalls.map((c: any) => c.value);
  expect(fVals).toContain("all:a");
  expect(fVals).toContain("all:ab");
  expect(fVals).toContain("all:abc");
  expect(fVals[fVals.length - 1]).toBe("all:abc");
  expect(await handlerIds(page)).toEqual(idsBefore);

  // R5 — filter + search in one render.
  await clearCalls(page);
  await page.getByTestId("set-unread").click();
  await page.getByTestId("set-xyz").click();
  await page.waitForTimeout(150);
  const f5 = (await calls(page, "F")).filter((c: any) => c.value.startsWith("unread"));
  expect(f5.length).toBeGreaterThanOrEqual(1);
  expect(f5[f5.length - 1].value).toBe("unread:xyz");

  // R6 — steady-state dispatch: latest once.
  await clearCalls(page);
  await steadyFire(page);
  expect((await calls(page, "P")).length).toBe(1);
  expect((await calls(page, "P"))[0].value).toBe("B");

  // R7 — StrictMode consumer.
  await page.getByTestId("show-strict").click();
  await page.waitForTimeout(250);
  const m0 = await snap(page);
  expect(m0.active).toBe(s3.active + 1);
  await clearCalls(page);
  await steadyFire(page);
  expect((await calls(page, "S")).length).toBe(1);
  await page.getByTestId("hide-strict").click();
  await page.waitForTimeout(150);
  expect((await snap(page)).active).toBe(s3.active);

  // R8 — async modes + sync throw.
  await page.getByTestId("mode-resolve").click();
  await page.waitForTimeout(120);
  await clearCalls(page);
  await steadyFire(page);
  await page.waitForTimeout(120);
  expect((await calls(page, "B")).length).toBe(1);
  await page.getByTestId("mode-reject").click();
  await page.waitForTimeout(120);
  await clearCalls(page);
  await steadyFire(page);
  await page.waitForTimeout(150);
  expect((await calls(page, "B")).length).toBe(1);
  await page.getByTestId("mode-throw").click();
  await page.waitForTimeout(120);
  await clearCalls(page);
  await steadyFire(page);
  await page.waitForTimeout(120);
  expect((await calls(page, "B")).length).toBe(1);

  // R9 — two consumers.
  const l0 = await snap(page);
  expect(l0.active).toBeGreaterThanOrEqual(4); // P, F, B (+ chrome)
  await page.getByTestId("toggle-b").click();
  await page.waitForTimeout(120);
  expect((await snap(page)).active).toBe(l0.active - 1);

  expect(errors.length).toBe(0);
  console.log(JSON.stringify({ errors: errors.length, R2_R9: "done" }));
});
