# TEMP-PBS-BUG-017-AUDIT -- side effects inside the `setSettings` updater

Status: **FIXED -- READY FOR GIORNO REVIEW** (see section 19).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: Next `16.3.5`, React/React-DOM `19.2.8`, Playwright `1.63.0`
(Desktop Chrome), against the already-running `next dev` server on
`http://localhost:3000` (no backend on `:5000`; settings layer is local
Dexie/IndexedDB, fully usable offline).

START-OF-CYCLE CLEANUP (PBS-BUG-016 dispositioned REJECTED -- NOT A BUG):
- Deleted `TEMP-PBS-BUG-016-AUDIT.md` (was committed in 039; now shows as `D`).
- No `tmp-pbs016` harness/spec/config remnants existed (verified by filename search
  and `git ls-files`); nothing else removed.
- No production form code touched for 016 (customer forms byte-identical to HEAD).

---

## 1. Bug definition

PBS-BUG-017 (CONFIRMED contract violation; runtime impact characterized in this cycle):
`updateSettingsPartial` in `H.S.H-V2.0.0/frontend/app/settings/page.tsx` (L632-647)
performed persistent writes, async continuations, DOM writes, and a global event
dispatch INSIDE the function passed to `setSettings(prev => ...)`. React state updaters
must be pure: React may evaluate an updater more than once per committed update
(dispatch-time eager evaluation + render-time replay, StrictMode double-invocation,
discarded-render replay). Every extra evaluation re-executed the external side effects,
producing duplicated Dexie writes, duplicated sync-operations, and duplicated
`hebrih-settings-change` broadcasts (each of which makes ~20 pages re-read settings).

Measured pre-fix impact (normal dev runtime, NO StrictMode -- sections 5-7): EVERY
single partial settings change executed its updater TWICE, causing 2 persistent saves +
2 sync-ops + 2 global events. The symptom was live, not merely conditional.

---

## 2. Exact original code (A1)

`H.S.H-V2.0.0/frontend/app/settings/page.tsx`, lines 632-647, verbatim BEFORE:

```tsx
  function updateSettingsPartial(partial: Partial<AppSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...partial } as AppSettings;
      document.documentElement.lang = next.language;
      document.documentElement.dir = getDirection(next.language);
      settingsService
        .save(next)
        .then(() => {
          window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
        })
        .catch((error) => {
          console.error("Failed to save settings:", error);
        });
      return next;
    });
  }
```

Side effects inside the updater (all forbidden by the purity contract):
1. `settingsService.save(next)` -- persistent Dexie write (+ sync-op enqueue +
   fire-and-forget `triggerSync()` inside the repository).
2. `.then(...)` async continuation ending in `window.dispatchEvent(...SETTINGS_EVENT...)`.
3. `document.documentElement.lang/dir` DOM mutation.
4. `.catch(...)` logging (externally observable).

State declaration (L499): `const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);`
(`useRef` was already imported at L3 but unused for settings.)

## 3. Caller inventory (A2)

All 8 callers are `ListManager.onChange` handlers (4 desktop rows L945/L966/L987/L1008,
4 mobile rows L1143/L1158/L1173/L1188), shape-identical:

```tsx
onChange={(items) => updateSettingsPartial({ customerTypes: items })}
onChange={(items) => updateSettingsPartial({ workerPositions: items })}
onChange={(items) => updateSettingsPartial({ vehicleTypes: items })}
onChange={(items) => updateSettingsPartial({ expenseTypes: items })}
```

Per-caller record (`ListManager` L1517+: `addItem` L1535, `handleSaveEdit`, and the
delete-confirm path each call `onChange` at most once):
- Setting keys changed: exactly one list key per call (`customerTypes`,
  `workerPositions`, `vehicleTypes`, or `expenseTypes`).
- Invocation: synchronous, from discrete user gestures (Add-button click, Enter key in
  the add/edit input, delete-confirm click). One `onChange` per gesture maximum.
- Multiple calls in one JS task: not producible through the UI (each gesture is its own
  discrete task and flushes synchronously); rapid successive gestures are separate
  tasks. The same-task double call was still TESTED (harness rapid buttons) to lock
  the concurrency contract the fix must preserve.
- Overlap before a render: only via back-to-back gestures; the functional updater
  chained them correctly pre-fix, and the fix preserves chaining via the ref mirror.
- Persistence expectation: immediate -- list edits have no Save button; every change
  must be persisted and broadcast (this expectation is preserved: 1 call = 1 save +
  1 event post-fix).

NOT callers (verified by grep): `updateSettings (full-object, L614)` has ZERO callers
(dead code, left untouched); `handleConfirmPending` (language/currency modal,
L674-694) uses its own save-then-set path, not `updateSettingsPartial`; `loadSettings`
(L540-554) uses direct `setSettings`.

## 4. StrictMode determination (A4) + init paths (A5) + save/event semantics (A3)

StrictMode -- determined from ACTUAL configuration, not defaults:
- `app/layout.tsx` (32 lines, read in full): NO `<StrictMode>` wrapper. Providers are
  `RvbAuthProvider` + `SyncInitializer` only.
- `next.config.ts`: empty config object; no `reactStrictMode`, no compiler flags.
- Repo-wide grep for `StrictMode|reactStrictMode` over frontend source: ZERO matches
  (outside node_modules). `app/settings/page.tsx` root is `<Suspense>` only (L1317-1321).
- Versions: React/Next per package.json (`react 19.2.8`, `next 16.3.5`); installed and
  verified identical via node (`next=16.3.5 react=19.2.8 react-dom=19.2.8`).
- Conclusion: StrictMode is NOT active anywhere in this project. The measured duplicate
  evaluation (sections 5-7) therefore does NOT come from StrictMode -- it is React's
  normal per-commit updater evaluation behavior in this runtime (dispatch-time eager
  evaluation + render-time replay; renders==2 in B1 proves a single commit render
  served both evaluations).

Init/effect paths (A5): `updateSettingsPartial` is NEVER called during initial settings
load (`loadSettings` uses direct `setSettings`), language initialization
(`handleLanguageSelect` only stages `pendingChange`), or any effect. It fires from
normal user list-edit gestures only. Consequence for fix design: a persistence
mechanism keyed off explicit calls (not a state-change effect) cannot introduce
initial-load writes -- verified at runtime in F8.

Save/event semantics (A3):
- `settingsService.save(s)` (`src/services/settings.service.ts` L10-12) awaits
  `settingsRepository.save` (`src/repositories/settings.repository.ts` L16-66): Dexie
  `db.settings.put` + `db.syncOperations.add` in one `db.transaction`, then
  fire-and-forget `triggerSync()`. Resolves `void`; rejects on storage errors. Saves
  are NOT serialized by the service -- concurrency order was the caller's
  responsibility (now the chain's -- section 11).
- `SETTINGS_EVENT = "hebrih-settings-change"` (`src/lib/settings.ts` L3), dispatched
  as `CustomEvent` with `detail = next settings`.
- Listeners: ~20 pages (customers, products, suppliers, workers, vehicles, tasks,
  purchases(+entry), sales(+entry), payments, expenses, accounts, invoice(+print),
  reports(+print), office, app/page, tasks/finished) plus `AppShell` -- each re-reads
  settings on the event. A duplicated dispatch therefore causes a duplicated
  app-wide settings re-read storm.

## 5. Baseline runtime evidence (Phase B, pre-fix)

Disposable harness: `app/tmp-pbs017/page.tsx` (verbatim replica of the L632-647 updater
body + test counters; instrumented fake save with identical call/return semantics:
async save, `.then` dispatch, `.catch` record; `manual` mode with controllable
deferreds; `fail` mode) in two sections (plain + `<StrictMode>`), driven by
`e2e/tmp-pbs017.spec.ts` (B1-B5) via `playwright.tmp-pbs017.config.cjs` (baseURL
`:3000`, 1 worker). All harness files removed after the cycle.

- B1 NORMAL, one `updateSettingsPartial({customerTypes:["Retail"]})`:
  `updaterCalls=2, renders=2, saves=[P,P] (identical payload twice), events delta=2,
  errors=0`, state correct. renders==2 (mount + ONE commit) proves BOTH evaluations
  served a SINGLE commit -- React evaluates this updater twice per committed update
  in the normal dev runtime, no StrictMode involved.
- B2 STRICT, same call: `updaterCalls=2, renders=2, saves=[P,P], events delta=2`.
  Identical to normal -- StrictMode adds no further duplication beyond the 2 already
  present; the double evaluation is baseline React behavior here, not a StrictMode
  artifact.
- B3 RAPID DISTINCT (`{language:"fr"}` + `{customerTypes:["Retail"]}` in one task):
  `updaterCalls=4, renders=2 (single batched commit), saves=[{fr},{fr},{fr+Retail},
  {fr+Retail}], events delta=4`, final state correct (chained `prev` works, but every
  intermediate payload is persisted twice and broadcast twice).
- B4 RAPID SAME-KEY (`fr` then `ar`): `updaterCalls=4, saves=[{fr},{fr},{ar},{ar}],
  events delta=4`, final `ar` (last-wins correct).
- B5 SAVE REJECTS: `updaterCalls=2, saves=[P,P] (both attempted), events delta=0,
  errors=2 (both handled, recorded), state STILL updated`, zero `pageerror`s
  (no unhandled rejection). Pre-fix error semantics: state applies, no event, logged.
- All 5 baseline tests passed as characterization (asserting the measured values);
  zero `pageerror`s throughout.

## 6. Normal-mode counts

One legitimate call: updater evaluated 2x, persistent saves 2x (identical payload),
SETTINGS_EVENT dispatches 2x, committed React state correct. Duplication factor 2x
on every settings change in normal runtime.

## 7. StrictMode counts

Identical to normal mode: 2 evaluations, 2 saves, 2 events per call. StrictMode
neither causes nor worsens the symptom in this runtime -- the updater is evaluated
twice regardless. (Post-fix, StrictMode also yields exactly 1 save + 1 event -- F3.)

## 8. Rapid-update behavior

Pre-fix, two same-task partials batch into ONE commit render (renders==2) while the
updater runs 4x; the `prev` chain keeps the final state correct (both fields present,
same-key last-wins), but persistence/event traffic is 4 saves + 4 events for 2 logical
changes. The fix must preserve the state semantics while collapsing traffic to 2+2
(done: F4/F5).

## 9. Save ordering analysis

Pre-fix saves were fired concurrently from inside each updater evaluation with no
serialization at the service layer (`settingsService.save` awaits one Dexie
transaction; overlapping same-table Dexie transactions queue FIFO in practice, but no
ordering is contractually guaranteed, and duplicate evaluations already doubled the
traffic). Post-fix, `saveChainRef` executes each snapshot's save strictly in request
order -- the next save does not START until the previous resolves -- so an older save
cannot complete after (or clobber) a newer one BY CONSTRUCTION. F6 proves this with
manually-deferred saves: while save #1 is pending, save #2 has not started
(`saves.length==1`); after releasing #1, #2 runs with the final snapshot; events
dispatch in request order; the UI shows the final state immediately without waiting
for persistence.

## 10. Root cause

Impure React state updater (L632-647): persistence, DOM mutation, async continuation,
and global event dispatch executed inside `setSettings(prev => ...)`, combined with
React evaluating that updater twice per committed update in this runtime (measured:
dispatch-time eager evaluation + render-time replay; single commit render in B1/B3).
Every evaluation re-ran all side effects: 2x Dexie writes, 2x sync-ops (+2x
fire-and-forget sync triggers), 2x app-wide event storms per user change.

## 11. Fix design and why it is concurrency-safe

Chosen design: synchronous latest-state ref mirror + serialized persistence chain
(adjacent mechanism, no broad refactor, no persistence effect, no stale spread).

```tsx
const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);      // latest-state mirror
const saveChainRef = useRef<Promise<void>>(Promise.resolve());  // FIFO save chain

useEffect(() => { settingsRef.current = settings; });           // backstop (ref only)

async function persistSettingsSnapshot(next: AppSettings) {     // one snapshot:
  await settingsService.save(next);                             //   save, then
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next })); // notify
}

function queueSettingsPersistence(next: AppSettings): void {    // FIFO chaining:
  const previous = saveChainRef.current.catch(() => {});        //   never stuck,
  const current = previous.then(() => persistSettingsSnapshot(next));
  saveChainRef.current = current.catch(() => {});               //   failures logged
  current.catch((error) => { console.error("Failed to save settings:", error); });
}

function updateSettingsPartial(partial: Partial<AppSettings>) {
  const next = { ...settingsRef.current, ...partial } as AppSettings; // compute
  settingsRef.current = next;                                   // advance mirror
  setSettings(next);                                            // PLAIN set: updater is gone
  document.documentElement.lang = next.language;                // sync DOM (as before)
  document.documentElement.dir = getDirection(next.language);
  queueSettingsPersistence(next);                               // persist in order
}
```

Plus one mirror-sync line at each other `setSettings` site (`loadSettings` L567,
`handleConfirmPending` L723). The dead `updateSettings` (no callers) and the 018
first-run branch are untouched.

Why each Phase-C invariant holds:
1. Updater purity: there IS no functional updater anymore -- `setSettings(next)` takes
   a plain value. Nothing React can re-invoke contains a side effect. Proven by F1
   (re-renders persist nothing) and F3 (StrictMode: 1 save + 1 event).
2. No stale-state regression (rule 8): the ref is advanced synchronously inside every
   `updateSettingsPartial` call, synced synchronously at every other `setSettings`
   site, and re-synced by a passive effect after each commit; React flushes passive
   effects before the next discrete event, so no ListManager gesture can ever read a
   stale mirror. Rapid same-task partials chain through the ref (F4/F5: no field lost,
   same-key last-wins). A plain `{...settings, ...partial}` closure spread was
   deliberately NOT used.
3. Each committed change persisted as intended: one call = one queued snapshot save
   (F2/F3: exactly 1; F4/F5: exactly 2 for two calls, payloads chained).
4. Event semantics: exactly one dispatch per SUCCESSFUL save, in request order (F2-F6);
   failed saves dispatch nothing and log once, as before (F7/B5).
5. No initial-load write: persistence is queued ONLY by explicit
   `updateSettingsPartial` calls, never by an effect observing state; the mirror
   effect writes a ref only. Proven on the real page (F8: 0 events across two loads).
6. No PBS-BUG-018 change: first-run `else { await settingsService.save(DEFAULT_SETTINGS); }`
   branch byte-identical (section 17 + diff).
7. No broad refactor: +54/-15 lines in one file, no signature/behavior changes to
   callers, services, Dexie, sync, notifications, defaults, language flow, or UI.

Rejected alternative (rule 9): a `useEffect`-on-`settings` persistence layer would need
to distinguish `loadSettings` sets from user partials to avoid saving on
initialization -- fragile discrimination with real regression risk; the explicit queue
avoids it entirely.

## 12. Permanent files changed

Exactly ONE permanent production file:
- `H.S.H-V2.0.0/frontend/app/settings/page.tsx` (+54/-15; `git diff --stat` verified).
No other permanent file changed: customer forms (016), `useDbSync` hook (015), sync
manager/services (012/013/014), settings service/repository/lib, Dexie schema,
notifications, defaults, or UI are absent from `git diff --name-only` (section 15).

## 13. FULL BEFORE code for every modified permanent file

Only `app/settings/page.tsx` was modified. The five changed regions below are quoted
in FULL (complete enclosing blocks); together with the embedded complete unified diff
in section 14 they account for 100% of the changed bytes -- every other line of the
2688-line file is byte-identical (proven by `git diff`, which lists no other hunk).

BEFORE Region 1 -- state declaration (L499):
```tsx
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
```

BEFORE Region 2 -- `loadSettings` (L540-554, complete function):
```tsx
  const loadSettings = async () => {
    const stored = await settingsService.get();
    if (stored) {
      const normalized: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...stored,
        expenseTypes: stored.expenseTypes ?? [],
      };
      setSettings(normalized);
      document.documentElement.lang = normalized.language;
      document.documentElement.dir = getDirection(normalized.language);
    } else {
      await settingsService.save(DEFAULT_SETTINGS);
    }
  };
```

BEFORE Region 3 -- `updateSettingsPartial` (L632-647, complete function):
```tsx
  function updateSettingsPartial(partial: Partial<AppSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...partial } as AppSettings;
      document.documentElement.lang = next.language;
      document.documentElement.dir = getDirection(next.language);
      settingsService
        .save(next)
        .then(() => {
          window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
        })
        .catch((error) => {
          console.error("Failed to save settings:", error);
        });
      return next;
    });
  }
```

BEFORE Region 4 -- `handleConfirmPending` save/set (L682-686, complete lines):
```tsx
      await settingsService.save(nextSettings);
      setSettings(nextSettings);
      document.documentElement.lang = nextSettings.language;
```

BEFORE Region 5 -- no mirror effect existed (the block after
`const t = TRANSLATIONS[settings.language];` (L525) went directly to the theme
`useEffect`; `settingsRef`/`saveChainRef`/`persistSettingsSnapshot`/
`queueSettingsPersistence` did not exist anywhere in the file).

## 14. FULL AFTER code for every modified permanent file + complete unified diff

AFTER Region 1 -- state declaration + refs (new L499-509):
```tsx
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  // PBS-BUG-017: synchronous mirror of the latest settings for concurrency-safe
  // partial updates. Written synchronously wherever `settings` state is set and
  // re-synced after every commit by the mirror effect below, so
  // `updateSettingsPartial` never needs an impure state updater and never reads
  // a stale render closure. This ref is never persisted and never dispatches.
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  // PBS-BUG-017: serialization chain for settings persistence. Each queued
  // snapshot is saved strictly in request order, so an older save can never
  // complete after (and clobber) a newer one.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
```

AFTER Region 2 -- mirror backstop effect (new, after `const t = ...`):
```tsx
  // PBS-BUG-017: backstop mirror sync. Writes the ref only -- never persists,
  // never dispatches -- so the ref always matches the latest committed state
  // before any discrete user event handler (which flushes passive effects first)
  // can call `updateSettingsPartial`.
  useEffect(() => {
    settingsRef.current = settings;
  });
```

AFTER Region 3 -- `loadSettings` (one added mirror line; first-run else-branch identical):
```tsx
      setSettings(normalized);
      settingsRef.current = normalized;
```

AFTER Region 4 -- persistence helpers + fixed `updateSettingsPartial` (complete):
```tsx
  // PBS-BUG-017: persists one committed settings snapshot, then notifies the app.
  // Runs exclusively on the serialization chain (see `queueSettingsPersistence`),
  // never inside a React state updater.
  async function persistSettingsSnapshot(nextSettings: AppSettings): Promise<void> {
    await settingsService.save(nextSettings);
    window.dispatchEvent(
      new CustomEvent(SETTINGS_EVENT, {
        detail: nextSettings,
      })
    );
  }

  // PBS-BUG-017: queues a snapshot for persistence strictly in request order.
  // The chain never stays rejected, so one failed save cannot block later ones;
  // each failure is logged exactly once and (as before) dispatches no event.
  function queueSettingsPersistence(nextSettings: AppSettings): void {
    const previous = saveChainRef.current.catch(() => {});
    const current = previous.then(() => persistSettingsSnapshot(nextSettings));
    saveChainRef.current = current.catch(() => {});
    current.catch((error) => {
      console.error("Failed to save settings:", error);
    });
  }

  function updateSettingsPartial(partial: Partial<AppSettings>) {
    // PBS-BUG-017: pure state update -- no save, no dispatch, no DOM write inside
    // an updater. `settingsRef` is synchronously advanced here (and mirrors the
    // latest committed state everywhere else), so rapid successive partials chain
    // without loss and without a stale render closure.
    const next = { ...settingsRef.current, ...partial } as AppSettings;
    settingsRef.current = next;
    setSettings(next);
    document.documentElement.lang = next.language;
    document.documentElement.dir = getDirection(next.language);
    queueSettingsPersistence(next);
  }
```

AFTER Region 5 -- `handleConfirmPending` (one added mirror line; all else identical):
```tsx
      await settingsService.save(nextSettings);
      setSettings(nextSettings);
      settingsRef.current = nextSettings;
```

COMPLETE unified diff (`git diff H.S.H-V2.0.0/frontend/app/settings/page.tsx`), the
machine-verifiable record from which the AFTER file reconstructs byte-exactly
(`git show HEAD:<path>` + apply):
(See the five hunks: `+settingsRef/+saveChainRef` decls; `+mirror useEffect`;
`+settingsRef.current = normalized` in loadSettings; `-impure updater` replaced by
`+persistSettingsSnapshot/+queueSettingsPersistence/+pure updateSettingsPartial`;
`+settingsRef.current = nextSettings` in handleConfirmPending. Full hunk text was
verified in-session via `git diff`; `git diff --stat` = 1 file, +54/-15.)

COMPLETE unified diff (literal, from `git diff`):

```diff
diff --git a/H.S.H-V2.0.0/frontend/app/settings/page.tsx b/H.S.H-V2.0.0/frontend/app/settings/page.tsx
index 2293887..946b12e 100644
--- a/H.S.H-V2.0.0/frontend/app/settings/page.tsx
+++ b/H.S.H-V2.0.0/frontend/app/settings/page.tsx
@@ -497,6 +497,16 @@ function SettingsPageInner() {
   const pathname = usePathname();

   const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
+  // PBS-BUG-017: synchronous mirror of the latest settings for concurrency-safe
+  // partial updates. Written synchronously wherever `settings` state is set and
+  // re-synced after every commit by the mirror effect below, so
+  // `updateSettingsPartial` never needs an impure state updater and never reads
+  // a stale render closure. This ref is never persisted and never dispatches.
+  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
+  // PBS-BUG-017: serialization chain for settings persistence. Each queued
+  // snapshot is saved strictly in request order, so an older save can never
+  // complete after (and clobber) a newer one.
+  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
   const [dark, setDark] = useState(() => {
     try {
       if (typeof window !== "undefined") return getSavedTheme() === "dark";
@@ -524,6 +534,14 @@ function SettingsPageInner() {

   const t = TRANSLATIONS[settings.language];

+  // PBS-BUG-017: backstop mirror sync. Writes the ref only -- never persists,
+  // never dispatches -- so the ref always matches the latest committed state
+  // before any discrete user event handler (which flushes passive effects first)
+  // can call `updateSettingsPartial`.
+  useEffect(() => {
+    settingsRef.current = settings;
+  });
+
   useEffect(() => {
     const readTheme = () => {
@@ -546,6 +564,7 @@ function SettingsPageInner() {
         expenseTypes: stored.expenseTypes ?? [],
       };
       setSettings(normalized);
+      settingsRef.current = normalized;
       document.documentElement.lang = normalized.language;
       document.documentElement.dir = getDirection(normalized.language);
     } else {
@@ -629,23 +648,43 @@ function SettingsPageInner() {
       });
   }

-  function updateSettingsPartial(partial: Partial<AppSettings>) {
-    setSettings((prev) => {
-      const next = { ...prev, ...partial } as AppSettings;
-      document.documentElement.lang = next.language;
-      document.documentElement.dir = getDirection(next.language);
-      settingsService
-        .save(next)
-        .then(() => {
-          window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
-        })
-        .catch((error) => {
-          console.error("Failed to save settings:", error);
-        });
-      return next;
+  // PBS-BUG-017: persists one committed settings snapshot, then notifies the app.
+  // Runs exclusively on the serialization chain (see `queueSettingsPersistence`),
+  // never inside a React state updater.
+  async function persistSettingsSnapshot(nextSettings: AppSettings): Promise<void> {
+    await settingsService.save(nextSettings);
+    window.dispatchEvent(
+      new CustomEvent(SETTINGS_EVENT, {
+        detail: nextSettings,
+      })
+    );
+  }
+
+  // PBS-BUG-017: queues a snapshot for persistence strictly in request order.
+  // The chain never stays rejected, so one failed save cannot block later ones;
+  // each failure is logged exactly once and (as before) dispatches no event.
+  function queueSettingsPersistence(nextSettings: AppSettings): void {
+    const previous = saveChainRef.current.catch(() => {});
+    const current = previous.then(() => persistSettingsSnapshot(nextSettings));
+    saveChainRef.current = current.catch(() => {});
+    current.catch((error) => {
+      console.error("Failed to save settings:", error);
     });
   }

+  function updateSettingsPartial(partial: Partial<AppSettings>) {
+    // PBS-BUG-017: pure state update -- no save, no dispatch, no DOM write inside
+    // an updater. `settingsRef` is synchronously advanced here (and mirrors the
+    // latest committed state everywhere else), so rapid successive partials chain
+    // without loss and without a stale render closure.
+    const next = { ...settingsRef.current, ...partial } as AppSettings;
+    settingsRef.current = next;
+    setSettings(next);
+    document.documentElement.lang = next.language;
+    document.documentElement.dir = getDirection(next.language);
+    queueSettingsPersistence(next);
+  }
+
   function toggleRow(key: string) {
     setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
   }
@@ -681,6 +720,7 @@ function SettingsPageInner() {
           : { ...settings, currency: pendingChange.newValue };
       await settingsService.save(nextSettings);
       setSettings(nextSettings);
+      settingsRef.current = nextSettings;
       document.documentElement.lang = nextSettings.language;
       document.documentElement.dir = getDirection(nextSettings.language);
       window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: nextSettings }));
```

Format note: the full region quotes above plus this complete diff cover 100% of
changed bytes; all other lines are byte-identical to HEAD. Full 2x2688-line dumps are
omitted as pure redundancy -- AFTER reconstructs byte-exactly via
`git show HEAD:<path>` + this diff.

## 15. Verification commands

From `H.S.H-V2.0.0/frontend` (dev server live on `:3000`):

1. Baseline (pre-fix replica):
   `.\node_modules\.bin\playwright test --config=playwright.tmp-pbs017.config.cjs --reporter=list`
   -> 5 passed (B1-B5 characterization).
2. Post-fix replica (F1-F7):
   `.\node_modules\.bin\playwright test --config=playwright.tmp-pbs017.config.cjs -g "F1|F2|F3|F4|F5|F6|F7" --reporter=list`
   -> 7 passed.
3. Post-fix real page (F8):
   `.\node_modules\.bin\playwright test --config=playwright.tmp-pbs017.config.cjs -g "F8" --reporter=list`
   -> 1 passed.
4. F10: `.\node_modules\.bin\tsc --noEmit` -> exit 0, no output.
5. F11: `.\node_modules\.bin\eslint app/settings/page.tsx` -> 39 errors + 16 warnings,
   IDENTICAL counts at HEAD (verified via `git stash` + rerun: same 55 problems) --
   all pre-existing (`react-hooks/set-state-in-effect` at mount/section effects,
   `no-explicit-any`/unused imports elsewhere); zero findings inside the 017 hunks;
   nothing fixed silently, nothing introduced.
6. F12: `git diff --name-only` -> `H.S.H-V2.0.0/frontend/app/settings/page.tsx` plus
   the START-OF-CYCLE `TEMP-PBS-BUG-016-AUDIT.md` deletion only.

## 16. Exact test outputs

- B1: `updaterCalls=2, renders=2, saves=[P,P], events+2, errors=0`, state correct.
- B2: identical to B1 under StrictMode.
- B3: `updaterCalls=4, renders=2, saves=[{fr},{fr},{fr+Retail},{fr+Retail}], events+4`.
- B4: `updaterCalls=4, saves=[{fr},{fr},{ar},{ar}], events+4`, final `ar`.
- B5: `updaterCalls=2, saves=[P,P], events+0, errors=2 (handled)`, state applied.
- F1: `persistStarts=1, saves=1, events+1`; after 2 unrelated re-renders: unchanged.
- F2: state correct, `saves=1, persistStarts=1, events+1, errors=0`.
- F3 (StrictMode): `saves=1, persistStarts=1, events+1`, state correct.
- F4: `saves=[{fr},{fr+Retail}], persistStarts=2, events+2`, both fields present.
- F5: `saves=[{fr},{ar}], events+2`, final `ar`.
- F6: while save#1 pending `saves.length=1`, UI already final; after releases
  `saves=[P1,P1+P2] (request order), events+2, pending=0`.
- F7: fail then success: `saves=2, events+1, errors=1`, chain alive.
- F8 (real page): `load_events=0`; after list add `=1` with item visible; after reload
  item persists, `=0` new events. Zero `pageerror`s in all 13 tests.
- Full Playwright stdout captured in-session; disposable harness/spec/config files
  removed afterwards (this audit is the remaining record).

## 17. PBS-BUG-018 boundary proof

- The first-run/default-state branch is byte-identical:
  `} else { await settingsService.save(DEFAULT_SETTINGS); }` appears in neither the
  `-` nor `+` lines of the complete diff (section 14) -- only the `if (stored)` path
  gained the one mirror line.
- `loadSettings` behavior otherwise unchanged (same get/normalize/set/DOM-sync flow);
  F8 proves load works with zero added persistence/events across two loads.
- Language/currency confirm flow (`handleConfirmPending`) behavior unchanged apart
  from the mirror line; its save-then-set-then-dispatch order is preserved verbatim.
- No defaults, validation, schemas, Dexie structures, or notification behavior touched
  (`git diff --name-only` contains no such files).

## 18. Remaining uncertainty

1. Production-build evaluation count: measured 2x per commit in `next dev`; whether a
   production build evaluates once or twice no longer matters -- the fixed path has no
   updater to re-invoke, so behavior is identical either way. Residual risk NONE.
2. Real Dexie FIFO vs chain: the chain makes completion order deterministic regardless
   of storage-layer queueing; even if Dexie ever reordered, snapshots execute in
   request order by construction. Residual risk LOW.
3. Cross-tab concurrent edits to Dexie settings could still last-write-win at the
   storage layer (pre-existing, out of 017 scope; single-tab semantics fully verified).
4. `updateSettings` (full-object, zero callers) left as dead code intentionally --
   deleting it would be out-of-scope diff noise.

## 19. Final status

FIXED -- READY FOR GIORNO REVIEW
