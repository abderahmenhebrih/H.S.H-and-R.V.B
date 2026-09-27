# PBS-BUG-015 Audit

## Target
PBS-BUG-015 — useDbSync stale callback window and listener churn

## Primary Source File
H.S.H-V2.0.0/frontend/src/hooks/useDbSync.ts

## BEFORE — useDbSync.ts

```ts
"use client";

import { useEffect } from "react";

export function useDbSync(callback: () => void | Promise<void>, deps: any[] = []) {
  useEffect(() => {
    const handler = () => {
      try {
        const res = callback();
        if (res instanceof Promise) res.catch(() => {});
      } catch {}
    };
    window.addEventListener("hebrih-db-synced", handler);
    return () => {
      window.removeEventListener("hebrih-db-synced", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
```

## PRE-FIX ANALYSIS

### Current Hook Contract
`(callback, deps = [])` → subscribes `hebrih-db-synced` while mounted, re-subscribing whenever caller `deps` change.

### Callback Capture
Handler closes over the `callback` of the subscribing render; a newer render's callback takes effect only after its effect re-runs (teardown + re-add).

### Dependency-Controlled Subscription
Effect deps = caller array; every dep change = removeEventListener + addEventListener pair.

### Deterministic Listener Churn
Notifications `[filter, search]`: every keystroke re-registers the global listener. Purchases/sales `[selectedDate]`: every date change re-registers. Proven by code shape (17 call sites, all inline closures).

### Narrow Stale-Callback Window
Between a param-changing render and its effect re-run, a sync event invokes the previous render's callback (e.g. loads the previous date/filter). Callers include params in deps, so staleness is bounded to one render — real but narrow, not permanent.

### Current Async/Error Semantics
Sync callbacks: try/catch around invoke; Promise results get `.catch(() => {})` (rejections swallowed); sync throws swallowed. Must be preserved exactly.

### Current Callers
17 sites under `frontend/app` (accounts, customers, expenses, notifications, dashboard, products, purchases, payments, settings, suppliers, sales, workers, reports, vehicles, tasks, tasks/finished, office). All inline closures; most pass param deps; two pass `[]`.

### Notifications Caller
`useDbSync(() => { void load(); }, [filter, search])` — churn per keystroke (038's race itself untouched).

### Date-Filtered Callers
Purchases/sales `useDbSync(() => void loadXForDate(selectedDate), [selectedDate])` — churn per date change; stale window loads previous date.

### Strict Mode Considerations
No `<StrictMode>` in `app/layout.tsx` (verified 014 cycle); dev double-effect only where explicitly wrapped. Counts must distinguish raw add/remove from active listeners regardless.

### PBS-BUG-038 Boundary
038 (purchases dual effects, notifications search race, mark-read refresh) untouched — no page edits this cycle.

## AFTER — useDbSync.ts

```ts
"use client";

import { useEffect, useRef } from "react";
import type { DependencyList } from "react";

export function useDbSync(callback: () => void | Promise<void>, _deps: DependencyList = []) {
  // Compatibility-only: retained so existing useDbSync(callback, [a, b]) call
  // sites keep compiling unchanged. Subscription freshness no longer depends on
  // re-subscribing, so these values are intentionally not used as effect deps.
  void _deps;

  // PBS-BUG-015: mirror the latest callback so the single stable listener below
  // always invokes current logic without teardown/re-add. Assigned in an effect
  // (not during render) to satisfy the project's refs-during-render lint rule;
  // React flushes passive effects before the next dispatched browser/task event,
  // so steady-state delivery is latest-callback. (Render-time assignment would
  // narrow the window marginally further but violates lint; churn elimination —
  // the deterministic defect — is identical either way.)
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const handler = () => {
      try {
        const res = callbackRef.current();
        if (res instanceof Promise) res.catch(() => {});
      } catch {}
    };
    window.addEventListener("hebrih-db-synced", handler);
    return () => {
      window.removeEventListener("hebrih-db-synced", handler);
    };
  }, []);
}
```

## CHANGE EXPLANATION

### Root Cause
Subscription effect depended on caller `deps` while invoking the render-captured `callback`: every param change tore down and re-added the global listener (churn), and the handler served the previous render's callback until the replacement effect ran (narrow stale window).

### Exact Fix
`useDbSync.ts` only: (a) `useRef` mirror updated every render cycle... actually in a passive effect (see below); (b) subscription effect with `[]` deps running once per mount; (c) handler calls `callbackRef.current()` with byte-identical async/error semantics; (d) second parameter kept as compatibility-only `_deps: DependencyList` (+ `void _deps`); (e) `react-hooks/exhaustive-deps` suppression deleted (no longer needed).

### Stable Subscription
One mount → one active listener; rerenders/param changes add/remove nothing (Tests B, E, G: delta 0 across 10+ updates).

### Latest Callback Ref
Mirrored in a passive effect (not during render) to satisfy the project's refs-during-render lint rule; React flushes passive effects before subsequent dispatched events, so steady-state delivery is latest-callback (Tests C–F: latest value observed exactly once). Render-time assignment would narrow the window marginally but violates lint — documented tradeoff, churn fix identical either way.

### Dependency Argument Compatibility
All 17 existing `useDbSync(cb, deps)` call sites compile unchanged (tsc PASS); deps are accepted but no longer drive subscription.

### Async/Error Semantics Preserved
try/catch + `instanceof Promise` + `.catch(() => {})` byte-identical. Tests I (sync), J (resolve), K (reject swallowed, no pageerror) confirm.

### Strict Mode Behavior
Explicit `<StrictMode>` consumer: net +1 active listener (dev double-invoke adds 2/removes 1), one invocation per dispatch, clean -1 on unmount (Test M). Raw lifecycle counts reported separately, not treated as failures.

### PBS-BUG-038 Left Open
Notifications/purchases/sales pages byte-identical (git status clean for those paths). No AbortController/sequence/cancellation, no effect merge, no mark-read change (Tests N/O source checks).

### Files Modified
- `H.S.H-V2.0.0/frontend/src/hooks/useDbSync.ts` (hook only)
- `TEMP-PBS-BUG-015-AUDIT.md` (created: BEFORE + analysis + AFTER + this explanation)

### Files Deleted During Cleanup
- `TEMP-PBS-BUG-014-AUDIT.md` (closed-cycle audit, deleted per Step 1)
- `H.S.H-V2.0.0/frontend/app/tmp-pbs015/page.tsx` (disposable QA page; deleted after passing)
- `H.S.H-V2.0.0/frontend/e2e/tmp-pbs015.spec.ts` (disposable Playwright spec; deleted after passing)
- `H.S.H-V2.0.0/frontend/.next/dev` (stale gitignored dev type-cache referencing the deleted QA page; removed to restore clean tsc)
- `TEMP-splice015.cjs`, `TEMP-splice015b.cjs` (minute-lived exact-capture helpers; deleted immediately after use)
