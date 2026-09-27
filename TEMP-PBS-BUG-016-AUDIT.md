# TEMP-PBS-BUG-016-AUDIT -- stale `setForm({ ...form, field })` race verification

Status: **NOT FIXED** (bug NOT reproduced on any real runtime path; permanent source left unchanged).
Bug remains open -- only Giorno can close it.

Date (UTC): 2026-09-27.
Workspace: `C:\Users\islam\OneDrive\Desktop\poultry-business-suite`
Runtime under test: Next `16.3.5`, React/React-DOM `19.2.8`, Playwright `1.63.0` (Desktop Chrome),
against the already-running `next dev` server on `http://localhost:3000` (no backend on `:5000`;
customer data layer is local Dexie/IndexedDB, so the create/edit form opens and edits fully offline).

START-OF-CYCLE CLEANUP (PBS-BUG-015 is CLOSED) -- performed, disposables only:
- Deleted `H.S.H-V2.0.0/frontend/app/tmp-pbs015b/` (1 page file)
- Deleted `H.S.H-V2.0.0/frontend/e2e/tmp-pbs015b.spec.ts`
- Deleted `H.S.H-V2.0.0/frontend/playwright.tmp-pbs015b.config.cjs`
- Deleted `TEMP-PBS-BUG-015-AUDIT.md`
- No production source from PBS-BUG-015 was touched (those files were deletions of
  previously-committed disposable harness artifacts; `git status` shows them as `D`).

---

## 1. Bug definition

PBS-BUG-016 (NEEDS VERIFICATION, unconfirmed): the customer create/edit form in
`H.S.H-V2.0.0/frontend/app/customers/page.tsx` updates form state with captured-spread
setters of the shape `setForm({ ...form, field: value })`. IF two such updates, closing over
the SAME render snapshot of `form`, were queued before React commits, the second spread would
overwrite (discard) the first field edit. The proposed safer pattern is the functional update
`setForm((current) => ({ ...current, field: value }))`, as already used in
`app/products/page.tsx` and in one customer-form handler (type dropdown).

To confirm the bug, a REAL HSH runtime path must be demonstrated in which two form updates
occur before an intervening render/commit and one edit is lost. A code-smell match alone is
not sufficient (strict rules 6-8: reproduce first; only then fix; otherwise leave source
unchanged and report NOT FIXED).

Stale-spread failure signature used throughout this audit (initial `{name:"", phone:""}`):

```ts
setForm({ ...form, name: "Alice" });       // closes over snapshot S
setForm({ ...form, phone: "0555000000" }); // closes over SAME snapshot S, one render
// => { name: "", phone: "0555000000" } -- SECOND wins, first edit lost
```

---

## 2. Static evidence

### 2a. `customers/page.tsx` -- every `setForm` call (23 grep hits total)

Declaration: line 487 `const [form, setForm] = useState<FormState>(EMPTY_FORM);`

Whole-form replacements (NOT field-race surface -- they replace the entire object, they do
not merge one field over a stale snapshot):
- L603 `openCreate`: `setForm({ ...EMPTY_FORM, type: customerTypes[0] ?? "" })` -- spreads a
  constant, not live `form`. Safe.
- L619-636 `openEdit`: builds a complete new object from the `customer` argument. Safe.
- L647 `closeForm`: `setForm(EMPTY_FORM)`. Safe.
- L726 post-save reset: `setForm(EMPTY_FORM)`. Safe.

Already-functional partial updates:
- L612 (effect): `setForm((prev) => (prev.type ? prev : { ...prev, type: customerTypes[0] }))`
  -- auto-populates type when settings arrive after the form opened. Safe.
- L1014 (CustomDropdown type): `setForm((prev) => ({ ...prev, type: value }))`. Safe.

Captured-spread partial field handlers in the create/edit form (15 sites -- the alleged
failure surface; each issues exactly ONE `setForm` per invocation):
- L962 `name`: `setForm({ ...form, name: event.target.value })`
- L987 `phone`: `setForm({ ...form, phone: raw })` (+ phone-format error clearing; orthogonal)
- L1027-1030 `identificationNumber`: `setForm({ ...form, identificationNumber: event.target.value })`
- L1047 `address`: `setForm({ ...form, address: event.target.value })`
- L1065 `email`: `setForm({ ...form, email: event.target.value })`
- L1082 `notes`: `setForm({ ...form, notes: event.target.value })`
- L1096 `invoiceCustomerType` (StyledSelect): `setForm({ ...form, invoiceCustomerType: value as any })`
- L1110 `billingAddress`: `setForm({ ...form, billingAddress: event.target.value })`
- L1131 `legalName`, L1135 `commercialName`, L1139 `legalForm`, L1143 `activity`,
  L1147 `rc`, L1151 `nif`, L1155 `nis`: all `setForm({ ...form, <field>: e.target.value })`

Structural facts that limit reachability (verified by reading L76-260, L480-770, L940-1189
and by grep for `useEffect|setTimeout|setInterval|requestAnimation|startTransition|
useDeferred|autofill|autoComplete|onInput|onBlur|onFocus`):
- No `onInput`/`onBlur`/autofill JS handlers issue extra `setForm` calls. Only one
  autofill-relevant attribute exists: `autoComplete="tel"` on the phone input (L980) -- an
  HTML hint, with no companion JS multi-field fill path.
- The 5 `useEffect`s are: CustomDropdown outside-click/Escape (L94), FilterDropdown
  outside-click/Escape (L206), settings load (L518), initial `load()` (L556), type
  auto-populate (L610, functional). None issues a captured-spread partial field update.
- No `setTimeout`/`setInterval`/promise callbacks write partial form fields.
- Each field handler issues exactly ONE `setForm`; there is NO handler that issues two
  `setForm` calls, and no code path that invokes two field handlers synchronously.
- `saveCustomer` (L654-739) reads the same `form` object the inputs render -- there is no
  second copy of the state that could diverge at submit time.
- No `<StrictMode>` wrapper was found in `app/layout.tsx`.

### 2b. Analogous pages (same grep: `setForm|useEffect|setTimeout|async function (open|save|close)`)

- `suppliers/page.tsx`: 6 captured-spread field handlers (L574 name, L598 phone, L624
  identificationNumber, L641 email, L656 address, L671 notes). Other `setForm`s are
  whole-form open/edit/close/save replacements (L284, L291, L307, L353). One settings
  `useEffect` (L233). No multi-update path.
- `workers/page.tsx`: 9 captured-spread field handlers (L811 name, L820 phone, L827 position,
  L841 employmentDate, L851 birthDate, L859 address, L864 startingSalary, L871 monthlySalary,
  L877 notes). Other `setForm`s are whole-form replacements (L454, L461, L480). Effects at
  L272/L384/L397/L416 do not write partial form fields. No multi-update path.
- `vehicles/page.tsx`: 4 captured-spread field handlers (L769 name, L775 registrationNumber,
  L783 type, L846 notes) + 2 ALREADY-FUNCTIONAL image handlers (L373 FileReader onload,
  L822 clear). Whole-form replacements at L469/L478/L496. No multi-update path.
- `tasks/page.tsx`: 2 captured-spread field handlers (L809 name, L815 deadline).
  Whole-form replacements at L460/L467. `setTimeout`s at L502/L536 clear only the success
  message, never `form`. No multi-update path.
- `products/page.tsx` (reference): all 6 field handlers already functional
  (L806, L836, L866, L894, L923, L939: `setForm((current) => ({ ...current, ... }))`).

Conclusion of Phase A: the code smell is real and widespread (15 sites in customers, 21 more
across suppliers/workers/vehicles/tasks), but in CURRENT code every handler issues a single
`setForm`, and no effect/async/autofill/dropdown path can queue a second partial update
before React commits. The only candidate real-world multi-field-same-tick trigger is
browser autofill / password-manager fill (hence the `autoComplete="tel"` note), which had
to be tested at runtime -- it was, in Phase B, with a faithful DOM-level model.

---

## 3. Exact affected call sites

Primary surface (customers/page.tsx, form section approx L962-1155): the 15 captured-spread
sites listed in section 2a. Representative verbatim samples (the rest are shape-identical):

```tsx
// L961-963
onChange={(event) =>
  setForm({ ...form, name: event.target.value })
}
// L985-991
onChange={(event) => {
  const raw = event.target.value;
  setForm({ ...form, phone: raw });
  ...
}}
```

No call site was modified (see sections 7-9). Snippets are evidence only.

---

## 4. Runtime reproduction procedure

Disposable harness (all files created untracked for this cycle, then REMOVED after evidence
collection -- see section 10; test-results/ output is gitignored):

1. `H.S.H-V2.0.0/frontend/app/tmp-pbs016/page.tsx` -- `"use client"` page with two sections
   under the SAME React 19.2.8 / Next 16.3.5 runtime as the real page:
   - STALE replica: `useState({name:"",phone:""})` with onChange bodies VERBATIM from
     customers/page.tsx L962 and L985-987 (`setForm({ ...form, name: ... })`,
     `setForm({ ...form, phone: raw })`), plus a `stale-burst` button that queues two
     `setForm({...sameSnapshot, ...})` calls from one render snapshot before commit
     (the exact stale-spread execution semantics: same React, same root type, same state
     shape, same updater shapes -- only the trigger differs, and React batches both
     identically into one render).
   - FUNCTIONAL twin: identical except `setForm((current) => ({ ...current, ... }))`
     (products/page.tsx reference pattern).
   - JSON state readouts (`stale-state`, `fixed-state`), reset buttons.
2. `H.S.H-V2.0.0/frontend/e2e/tmp-pbs016.spec.ts` -- T1 (mechanism + determinism, stale
   replica, 6 reps), T2 (functional twin, 6 reps), T3/V1 (same-tick dual `input` events
   against the REAL /customers create form, 6 fresh page loads), T4/V3 (sequential edits,
   real form), T5/V4 (submit path after burst, real form).
3. `H.S.H-V2.0.0/frontend/e2e/tmp-pbs016b.spec.ts` -- T6 (reversed dispatch order, real
   form), T7 (same-tick DOM burst vs functional twin), T8 (same-tick DOM burst vs stale
   replica), T9 (intermediate-commit probe + separate-task completion, real form).
4. `H.S.H-V2.0.0/frontend/playwright.tmp-pbs016.config.cjs` -- baseURL
   `http://localhost:3000`, `testMatch ["**/tmp-pbs016*.spec.ts"]`, 1 worker, no webServer
   (used the already-running dev server).

Real-form access (language-independent): toolbar `section[class*="toolbar"]` ->
`button[class*="primaryButton"]` click; modal located as `section[class*="modal"]`;
inputs `[0]`=name, `[1]`=phone (6 inputs total in create form).

Strongest same-tick trigger used (T3 -- one `page.evaluate`, single JS task, no awaits
between steps; faithful model of browser autofill / password-manager multi-field fill):

```js
setter.call(nameEl, "Alice");
setter.call(phoneEl, "0555000000");
nameEl.dispatchEvent(new Event("input", { bubbles: true }));
phoneEl.dispatchEvent(new Event("input", { bubbles: true }));
```

(`setter` = native `HTMLInputElement.prototype.value` setter, required so React's
controlled-input tracker observes a change -- the standard autofill-simulation technique.
Both native sets happen first, then both React `input` events dispatch back-to-back with
no opportunity for user code to run between them; React itself can only intervene via a
synchronous flush inside `dispatchEvent` -- which is precisely the empirical question.)

Command: from `H.S.H-V2.0.0/frontend`:
`.\node_modules\.bin\playwright test --config=playwright.tmp-pbs016.config.cjs --reporter=list`

---

## 5. Baseline result

V1 -- the stale-spread signature could NOT be produced through the real customer form:

- T3 (REAL /customers create form, same-tick dual input events, 6/6 fresh loads):
  `{count:6, name:"Alice", phone:""}` every round -- intact-rounds 0/6 FOR THE STALE
  SIGNATURE. Critically, the outcome is the OPPOSITE of the stale-spread signature
  `{name:"", phone:"0555000000"}`: the FIRST-dispatched edit survived and the SECOND was
  lost. A shared-snapshot race always lets the LAST update win regardless of order; the
  observed FIRST-wins behavior refutes the shared-snapshot (batching) hypothesis for real
  DOM input events.
- T6 (reversed dispatch order, phone event first): `{count:6, name:"", phone:"0555000000"}`
  -- again FIRST-dispatched wins. Order-dependent first-wins in BOTH orders proves React 19
  commits (synchronous discrete-event flush + re-render) BETWEEN the two dispatches; the
  first commit's re-render resets the sibling controlled input's pre-set native value to
  `""` before its event is processed.
- T9 smoking gun: after pre-setting BOTH native values but dispatching ONLY the name
  event, the phone input's DOM value read SYNCHRONOUSLY in the same task (no awaits) was
  already `""` (`phoneDomSync:""`). React flushed the name update synchronously inside
  `dispatchEvent` and the controlled re-render clobbered the pending phone value. After
  settle: `{name:"Alice", phone:""}`; completing the phone edit in its own task then gave
  `{name:"Alice", phone:"0555000000"}`.
- T8 (same DOM burst vs harness STALE replica): `{"name":"Alice","phone":""}` -- identical
  to the real page, confirming the replica exercises the exact same execution path (and is
  NOT a disconnected toy: same React, same root semantics, same updater shapes).
- T7 (same DOM burst vs FUNCTIONAL twin): `{"name":"Alice","phone":""}` -- IDENTICAL to
  the stale replica. The proposed fix is behaviorally INERT on this trigger: it preserves
  nothing extra, because the loss happens upstream (controlled-input DOM reset on the
  intermediate commit), before either updater shape can matter.

V3 -- ordinary sequential editing works (T4, real form): name edit, 300ms settle (commit),
phone edit, 300ms settle -> `{count:6, name:"Alice", phone:"0555000000"}`. PASS.

V4 -- save integrity (T5, real form): after the same-tick burst the modal showed
`{name:"Alice", phone:""}`; clicking save kept the modal open with the SAME values
(`modalOpen:true, name:"Alice", phone:""`) and no page errors. The submittable record is
exactly the displayed form state -- `saveCustomer` reads the same `form` object the inputs
render (L683-720), so there is no hidden submit-time divergence and no second stale layer.
(T5's strict phone assertion failed precisely because the T3-mechanism loss was present in
the pre-save state -- that failure output IS the V4 evidence: submit consumes displayed
state, nothing more, nothing less.) No customer record was created (validation correctly
blocked on the empty type; test browser contexts are ephemeral IndexedDB anyway).

V5 -- scope: suppliers/workers/vehicles/tasks share only the code smell (section 12);
no reachable multi-update path exists on any of them.

## 6. Determinism result

V2 -- every behavior observed was fully deterministic across repetitions:
- T1 mechanism (direct same-snapshot double `setForm` in one handler -- the pattern's
  intrinsic fragility, NOT DOM-reachable on the real page): 6/6
  `{"name":"","phone":"0555000000"}` -- SECOND wins, first edit lost. This confirms the
  mechanism is real for the updater SHAPE, isolating the question to reachability.
- T2 functional twin (same trigger): 6/6 `{"name":"Alice","phone":"0555000000"}`.
- T3 real form same-tick burst: 6/6 `{name:"Alice", phone:""}` -- FIRST wins.
- T6/T7/T8/T9: single-run mechanism pins, each consistent with the above (order-dependent
  first-wins; functional-identical-to-stale; synchronous DOM reset).
- Zero `pageerror`s in all 9 tests; no flakiness, no console errors.

Net: the ONLY deterministic loss producible through the real DOM path (first-wins via
intermediate commit) is (a) not the stale-spread signature and (b) not fixed by functional
updates (T7 identical to T8). The stale-spread signature itself (second-wins) is
deterministic only via a trigger that does not exist on the real page (two `setForm`s in
one synchronous unit of work).

## 7. Permanent files changed

NONE. Zero permanent production source files were modified in this cycle.

`git diff --name-only` (repo root) shows ONLY the START-OF-CYCLE PBS-BUG-015 disposable
cleanup deletions:

```
H.S.H-V2.0.0/frontend/app/tmp-pbs015b/page.tsx
H.S.H-V2.0.0/frontend/e2e/tmp-pbs015b.spec.ts
H.S.H-V2.0.0/frontend/playwright.tmp-pbs015b.config.cjs
TEMP-PBS-BUG-015-AUDIT.md
```

`git status --short` additionally shows this audit file as the sole untracked file:
`?? TEMP-PBS-BUG-016-AUDIT.md`
(All PBS-BUG-016 disposable harness files were removed after evidence collection.)

Per strict rule 8 (leave permanent source unchanged when not reproduced), the F1-F10
post-fix test battery does NOT apply -- there is no fix to verify.

## 8. FULL BEFORE code for each modified permanent file

Not applicable -- no permanent file was modified. There is therefore no BEFORE/AFTER pair
to present. The exact current (unchanged) handler code is quoted verbatim in sections 2a
and 3 with file/line anchors (customers/page.tsx L962, L987, L1027-1030, L1047, L1065,
L1082, L1096, L1110, L1131, L1135, L1139, L1143, L1147, L1151, L1155; functional sites
L612, L1014; whole-form sites L603, L619-636, L647, L726).

---

## 9. FULL AFTER code for each modified permanent file

Not applicable -- no permanent file was modified. File `customers/page.tsx` is
byte-identical to HEAD (absent from `git status` / `git diff` except for the unrelated
BUG-015 cleanup). No business behavior, validation, schema, UI, or styling was changed.

---

## 10. Verification / test commands

From `H.S.H-V2.0.0/frontend` (dev server already live on `:3000`):

1. `.\node_modules\.bin\playwright test --config=playwright.tmp-pbs016.config.cjs -g "T1|T2" --reporter=list`
   -> 2 passed (T1 6/6 stale-signature outcomes; T2 6/6 intact).
2. `.\node_modules\.bin\playwright test --config=playwright.tmp-pbs016.config.cjs -g "T3|T4|T5" --reporter=list`
   -> T3 passed-observational (0/6 stale-signature; 6/6 first-wins), T4 passed,
      T5 failed its strict phone assertion exactly as designed-to-detect (pre-save
      `{Alice,""}` -> post-save modal still open `{Alice,""}`), which constitutes the V4
      evidence. 1 failed (informative), 2 passed.
3. `.\node_modules\.bin\playwright test --config=playwright.tmp-pbs016.config.cjs -g "T6|T7|T8|T9" --reporter=list`
   -> 4 passed.
4. `.\node_modules\.bin\tsc --noEmit` (from frontend) -> exit 0, no output.
5. `.\node_modules\.bin\eslint app/customers/page.tsx` -> 2 PRE-EXISTING
   `react-hooks/set-state-in-effect` errors (L557 mount `load()`, L612 type auto-populate
   effect). The file is byte-identical to HEAD (not in `git status`), so these findings
   predate this cycle, are unrelated to PBS-BUG-016, and were NOT touched per strict rule 2.
6. `git diff --name-only` (repo root) -> only the 4 BUG-015 cleanup deletions (section 7).
   No unrelated permanent file modified.

---

## 11. Exact outputs / results

- T1 `T1_stale_outcomes`: 6x `{"name":"","phone":"0555000000"}` (2.0s, pass).
- T2 `T2_fixed_outcomes`: 6x `{"name":"Alice","phone":"0555000000"}` (1.6s, pass).
- T3 `T3_real_form_rounds`: 6x `{before:{count:6,name:"",phone:""}, burst:{ok:true},
  after:{count:6,name:"Alice",phone:""}}`; `T3_intact_rounds: 0/6` for the stale signature
  (15.2s, observational pass).
- T4 `T4_sequential_after`: `{count:6, name:"Alice", phone:"0555000000"}` (3.0s, pass).
- T5 `T5_preSave`: `{count:6, name:"Alice", phone:""}`; `T5_postSave`:
  `{modalOpen:true, name:"Alice", phone:"", bodyText:"Hebrih Slaughter House..."}` --
  assertion `phone == "0555000000"` failed with `Received: ""` (3.5s; informative failure).
- T6 `T6_reversed`: `{burst:{ok:true}, after:{count:6, name:"", phone:"0555000000"}}` (pass).
- T7 `T7_functional_dom_burst`: `{"name":"Alice","phone":""}` (pass).
- T8 `T8_stale_dom_burst`: `{"name":"Alice","phone":""}` (pass).
- T9 `T9_probe`: `{ok:true, phoneDomSync:""}`; `T9_afterSettle`: `{count:6, name:"Alice",
  phone:""}`; `T9_final`: `{count:6, name:"Alice", phone:"0555000000"}` (pass).
- All 9 tests: `pageerror` count 0.
- Full Playwright stdout/stderr for runs 1-3 was captured in-session (see transcripts above);
  disposable spec/config/harness files were deleted after the runs; only this audit remains.

---

## 12. Analogous-page findings

suppliers (6 stale field sites), workers (9), vehicles (4 stale + 2 already functional),
tasks (2): each page's field handlers issue exactly ONE captured-spread `setForm` per
invocation; all remaining `setForm`s are whole-form open/edit/close/save replacements;
no effect, timeout, promise, dropdown, or autofill path queues a second partial update
before commit (vehicles image FileReader at L373 is already functional; tasks timeouts at
L502/L536 never touch `form`). They therefore share the code smell but NOT a reachable
failure mechanism: the same React 19 discrete-flush behavior that protects the customer
form protects them identically. Per "do not automatically broaden", NO analogous file was
modified, no harness was built for them, and no fix is recommended for them on this
evidence. If a future handler on any page ever issues two partial `setForm`s in one
synchronous unit of work, T1 shows the second-wins loss WILL occur there -- that future
code should use functional updates (products/page.tsx pattern).

---

## 13. Remaining uncertainty

1. Real browser autofill (Chrome/Edge password-manager fill) was MODELED (native-value set
   + back-to-back `input` dispatches in one task), not driven with a real autofill profile:
   deterministic autofill E2E is not feasible in this environment. The model is faithful at
   the DOM/React level (native setter + trusted-equivalent bubbling `input` events are
   exactly what autofill produces), and both dispatch orders plus the synchronous-reset
   probe converge on the same mechanism, so residual risk that REAL autofill batches
   differently is judged LOW -- and even the worst observed autofill-shaped outcome is
   unaffected by the proposed fix (T7).
2. Production (`next build/start`) vs dev-server batching: React event-priority/flush
   semantics do not differ between dev and prod for this pattern; no StrictMode wrapper
   exists to create a dev/prod divergence. Residual risk LOW.
3. Edit mode (`openEdit`) vs create mode: all runtime tests used create mode. Edit mode
   shares the identical 15 handlers and single-update-per-handler structure; the
   reachability argument (discrete flush between events) is mode-independent. Residual
   risk LOW.
4. Recommendation for Giorno: PBS-BUG-016 may reasonably be REJECTED for current code
   (mechanism refuted on every reachable path + proposed fix proven inert), or kept as a
   stylistic hardening backlog item -- but hardening must NOT be smuggled in as this bug's
   fix without a fresh reproduction, per strict rules 3/6/8.

---

## 14. Final status

NOT FIXED

(Rationale: the stale-`setForm` race was NOT reproduced against current code on any real
runtime path -- V1 negative with order-reversed and synchronous-reset controls, V3/V4
healthy, proposed fix proven behaviorally inert on the only loss-producing trigger. Permanent
source intentionally left unchanged. Bug stays open for Giorno's review/decision.)
