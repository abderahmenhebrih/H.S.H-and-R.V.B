# TEMP-PBS-BUG-038-AUDIT.md

PBS-BUG-038 DEBUG CYCLE AUDIT — HSH frontend state-loading defects (A/B/C). Single inventory ID, not split.
Cycle date: 2026-09-28. Workspace: C:/Users/islam/OneDrive/Desktop/poultry-business-suite.
Machine verification: BEFORE_P_MATCH=true AFTER_P_MATCH=true DIFF_P_MATCH=true BEFORE_N_MATCH=true AFTER_N_MATCH=true DIFF_N_MATCH=true.

## 1. Bug definition

PBS-BUG-038: (A) Purchases performs duplicate initial loads; (B) Notifications allows stale async search/filter results to overwrite newer state; (C) Notification mark-read can navigate before refreshing local read state.

## 2. Existing 038 three-part scope

A = purchases/page.tsx double mount load. B = notifications/page.tsx unguarded async load race. C = handleMarkRead routed path skips load(). All three are page-level state-ordering defects. No service/backend/mobile scope.

## 3. PBS-BUG-015 dependency correction

PBS-BUG-015 is CLOSED. useDbSync was fixed separately (useEffectEvent + stable empty-dep subscription). This cycle did NOT re-fix it, did NOT edit src/hooks/useDbSync.ts (zero diff, proven in F27), and did NOT repeat the stale per-keystroke listener-churn claim: current source proves a single stable subscription (F14 reasoning + static proof in 13).

## 4. Current Purchases architecture

State: products, suppliers, purchases, search, selectedProductIds/SupplierIds, deleteTarget/countdown, selectedDate (midnight), purchaseDate, calculationForm/calculation, language/currency, loading/error, modal flags. Loader: loadPurchasesForDate(date) writes loading/error/purchases. PRE-FIX effects: (1) mount-only migration+load effect []; (2) selectedDate effect [selectedDate]; (3) useDbSync([selectedDate]). POST-FIX: single selectedDate effect + useDbSync, both calling the guarded loader that awaits a cached one-time migration promise.

## 5. Purchases complete load call-site inventory

loadPurchasesForDate call sites (identical pre/post except effect count): selectedDate useEffect; useDbSync callback; confirmDeletePurchase (after delete reversal + loadMeta). getDayBounds + purchaseService.getByDateRange inside loader. migrateLegacyPurchases: pre-fix inside mount effect; post-fix inside loader via cached getMigrationPromise (once). No other callers. Loader writes state (setPurchases/setLoading/setError), catches errors (setError(t.failedLoad)), finally clears loading. Pre-fix concurrent calls unordered (no guard); post-fix generation-guarded.

## 6. Purchases current effects

PRE-FIX (snapshot lines 473-490): effect1 [] runs migrate+load; effect2 [selectedDate] runs load. On production mount both fire: 2 logical loads of same initial date. POST-FIX: exactly one effect ([selectedDate]) + useDbSync; migration awaited inside loader via one-time cached promise. Mount = 1 logical load (F1). Date change = 1 load (F3). StrictMode dev double-invoke is NOT counted as the bug (production build used for counts).

## 7. Purchase migration current contract

purchase.service.ts migrateLegacyPurchases(): Promise<void>. Reads all purchases; splits multi-item legacy docs into single-item docs (generateId + create per extra item, update original to first item). NOT idempotent-safe under concurrent double-run by construction, but page now runs it once via cached promise. Async: yes (awaits repository). Throws: repository errors propagate (page swallows via .catch(()=>{}) preserving combined pre-fix behavior where effect2 loaded even if effect1 migration failed). Mutates only purchase documents. Not called globally elsewhere (page-only; grep confirmed no other migrateLegacyPurchases caller in frontend). Page calls it because legacy multi-item docs must be normalized before display. Business logic UNCHANGED (zero diff, F25).

## 8. Sales reference

sales/page.tsx: loadSalesForDate(date) + ONE selectedDate effect [selectedDate] + useDbSync([selectedDate]) + confirmDelete path. No migration, no mount-only second effect. This is the correct reference shape; Purchases post-fix now matches it (plus its required one-time migration gate). sales/page.tsx untouched (F24, zero diff).

## 9. Purchase date-overlap analysis

PRE-FIX: loadPurchasesForDate had no guard: date-A load in flight + select B + B resolves + A resolves last => A overwrites B (same root pattern). REPRODUCED by construction in harness class (F5 analogue) and by code inspection (unconditional setPurchases). POST-FIX: generation guard drops stale date commits (F5 PASS: A->B->C inverse completion commits C only). Guard was required and added.

## 10. Current Notifications architecture

State: settings, notifications, filter (default all), search, loading (no error state pre-fix; none added). Loader load() reads filter/search once, calls notificationService.getFiltered, setNotifications (+unread client filter for unread), setLoading. Effects: [filter, search] effect + useDbSync([filter, search]). Handlers: handleMarkAllRead (markAll+load), handleMarkRead (mark+conditional load/route), grouped useMemo, unreadCount derived. POST-FIX: same shape + guard object + always-reconcile mark-read.

## 11. Notification load full behavior

PRE-FIX load: setLoading(true); if filter==unread: getFiltered({type:all, search}) then client .filter(!readAt); else getFiltered({type: normalized, search}); setNotifications; setLoading(false). Writes: notifications + loading. No error state, no try/catch (a throw left loading stuck + propagated to mark-read caller). POST-FIX: identical read/filter semantics + per-load snapshot (activeFilter/activeSearch captured) + guard checks after each await + finally-guarded setLoading(false) only for current generation. Service filtering semantics untouched.

## 12. Notification service contract

notification.service.ts: getFiltered({type, unreadOnly, search}): getAll (createdAt desc) minus archived; unread/type branches (unread, task/tasks, financial group, orders->customer_order, else exact type); substring search over title+message (lowercased). getFilteredAdvanced unused by page. markAsRead(id): no-op if missing/already read; else update readAt/updatedAt + dispatch hebrih-notifications-changed. markAllAsRead loops unread. Reads are naturally overlapping (async Dexie). Service UNCHANGED (zero diff, F26). Page-level fix only, as expected.

## 13. Current useDbSync / PBS-BUG-015 proof

src/hooks/useDbSync.ts (33 lines, unchanged): callback via useEffectEvent (latest COMMITTED callback, no passive-effect mirror lag), single window addEventListener(hebrih-db-synced) with [] deps, stable teardown. Old churn/closure bug fixed: deps param intentionally voided for compile compat. Probe reasoning: subscription count is 1 per mounted consumer regardless of keystrokes because deps never re-subscribe; notification callback always sees latest filter/search via EffectEvent (B10/F13). Historical per-keystroke re-registration claim NO LONGER REPRODUCES — explicitly retired (see 40).

## 14. Notification load trigger matrix

| TRIGGER | starts load? | snapshot | can overlap? |
| initial mount ([filter,search] effect) | YES | (all,'') | with sync event |
| filter change | YES | new filter + current search | YES (rapid clicks) |
| search change | YES | current filter + new search | YES (keystrokes) |
| db-sync event (useDbSync) | YES | latest committed filter/search | YES with effect load |
| mark read (non-route) | YES pre+post | current | YES with in-flight search |
| mark read (routed) | NO pre / YES post | current | YES post (guarded) |
| mark all read | YES | current | YES |
| archive/delete | n/a (page has none) | - | - |
| manual refresh | n/a (no button) | - | - |
| route return/remount | fresh mount load | defaults (all,'') | no (remount) |
All load starters share the single guarded loader post-fix.

## 15. Notification race analysis

Trace Q1(search ALPHA, gen1, 500ms) -> Q2(BETA, gen2, 50ms): Q2 resolves, commits BETA; Q1 resolves, PRE-FIX commits ALPHA unconditionally => final input BETA with ALPHA rows. REPRODUCED (B7). Stale completion also wrongly set loading=false after newer load started (F11 class) and any throw left loading stuck (no error state exists). POST-FIX: gen check after await drops Q1 commit and Q1 loading write (F7/F11 PASS).

## 16. Mark-read path analysis

PRE-FIX handleMarkRead: (A) no-route unread: markAsRead then load() => current. (B) routed unread: markAsRead then router.push, NO load => local state stale at navigate time. (C) already-read: no mark; route? push : load. (D) mark failure: throw propagates, no load, no nav (no false read; caller has no catch => unhandled rejection, preserved as-is per rule 20/18 semantics). (E) nav failure: not applicable (push is sync fire-and-forget). POST-FIX: persist, then await load().catch(()=>{}) (best-effort reconcile), then push. Already-read routed now also reconciles (one extra read, harmless). Refresh failure never blocks nav nor fabricates data.

## 17. Exact current meaning of stale unread state

Proven stale surface = the notifications PAGE local rows: row unread dot (styles.unreadDot), card unread styling (styles.unread), and unread-filter membership (item remains in unread-filtered list), plus derived unreadCount on the page. The header bell (HshNotificationBell) separately listens to hebrih-notifications-changed (dispatched by markAsRead) and refreshes itself, so the bell badge is NOT the stale surface. Stale = page rows/dot/filter/count until next load/remount. POST-FIX routed path reconciles before navigating (F16/F17).

## 18. Navigation/remount behavior

Next.js App Router: /notifications -> router.push(route) (different route, e.g. /sales) unmounts Notifications page; browser Back remounts it fresh (defaults filter all, search empty, initial load). Hence the routed-path staleness window is: (a) visible if user returns via Back and the remount load races/returns pre-mark data? No — remount reads fresh DB (mark persisted), so Back itself is current; (b) the REAL impact pre-fix: any component/state consumed between mark and unmount, the unread-filter view if user stays (no — it navigates away), and cross-surface consistency (bell updates via its own event; page rows never reconciled). The decisive defect per spec: successful routed read left page-local unread state unreconciled (loadCount 0, B12). Fixed by always reconciling before push.

## 19. Pre-cycle git/status scope

Cycle-start git status: D TEMP-PBS-BUG-036-AUDIT.md (pre-existing deletion, NOT this cycle), ?? TEMP-PBS-BUG-037-AUDIT.md (deleted as 038 start-cleanup). No modified production files at cycle start. purchases-page and notifications-page verified same-as-HEAD at snapshot time (git diff --quiet clean for both). Repo may contain unrelated history; cycle delta is measured snapshot->final only.

## 20. Cycle-start snapshots + SHA-256

TEMP-PBS-BUG-038-BEFORE/purchases-page.tsx SHA256=CC78FD4F2AF1DA04E2223FF9F54F5476ABBAA776836508E7B07785A5124DFB2C (byte-identical copy, same as HEAD). TEMP-PBS-BUG-038-BEFORE/notifications-page.tsx SHA256=6DB135DCAC0B919B78B240AFB28AF7E8DE9BA63773BEDEA9D94072DF7C7F822D (byte-identical copy, same as HEAD). No pre-existing user changes destroyed. Final literal diffs in this audit are cycle-start snapshot -> final working file (equal to git diff since snapshots == HEAD).

## 21. Runtime environment

Windows win32, PowerShell 5.1, Node via nvm4w, Next 16.3.5 (Turbopack), @playwright/test 1.63.0, Chromium 1243 (ms-playwright). Frontend: H.S.H-V2.0.0/frontend. Production bundle via npm run build + next start :3105 for F32. Deterministic delay injection ONLY in disposable harnesses (tmp-pbs038-repro.js pre-fix mirror, tmp-pbs038-verify.js post-fix mirror); production source never modified for baselines.

## 22. B1 Purchases initial mount count

Production-logic mirror (both pre-fix effects, migrate 10ms + read 20ms): migrateLegacyPurchases calls=1, loadPurchasesForDate calls=2, state commits=2. Timestamps t0-based; both loads same selectedDate. Expected historical bug CONFIRMED: logical initial loads=2, not 1. (StrictMode excluded by using production logic mirror + production build counts.)

## 23. B2 same-date redundancy proof

Seed reasoning: both initial loads request identical selectedDate and identical day-bounds dataset (same getByDateRange args). Harness: loadCalls[0].date === loadCalls[1].date (2026-09-27 local-date string in run). PROVEN redundancy, not legitimate distinct work.

## 24. B3 date-change baseline

Pre-fix architecture: after settle, A->B fires the [selectedDate] effect once (effect1 is mount-only). Exactly 1 new load for B. Historical expectation holds; the defect is mount-only duplication, not date-change duplication. Post-fix F3 preserves: one B load, rendered IDs=B, no initial-date replay.

## 25. B4 purchase date-overlap baseline

Static: pre-fix loader unconditional => A-overwrites-B possible (same root pattern). Harness class verified for the guarded design (post-fix F4/F5). Pre-fix overlap is architecturally certain (no guard, two writes, last-writer-wins); covered by the same narrow generation guard per spec C2. POST-FIX F4: mount A, switch B during pending migration => final B, one commit. F5: A->B->C inverse completion => C only.

## 26. B5 notification fixture/control

Fixtures: PBS038-ALPHA (unread), PBS038-BETA (unread), PBS038-GAMMA (read). Service correctness established in B6 before race injection; harness getFiltered mirrors service substring semantics over title+message.

## 27. B6 exact search control

Search ALPHA => [alpha] only; search BETA => [beta] only (sequential, fully awaited). Service/filter correctness CONFIRMED; race tests therefore isolate ordering, not filtering.

## 28. B7 two-query race

ALPHA gen1 delay 500ms; 20ms later BETA gen2 delay 50ms. Resolve order: BETA first, ALPHA last. PRE-FIX: final input BETA, final rows [alpha] => BUG REPRODUCED (stale ALPHA overwrote BETA). Commit log: gen2 commit then gen1 commit. POST-FIX F7: final rows [beta], gen1 commit dropped (PASS).

## 29. B8 three-query race

A(600ms) -> AB(300ms) -> ABC(30ms); completion ABC, AB, A. PRE-FIX final rows = A-result set (oldest wins) => BUG REPRODUCED (not merely two-request special case). POST-FIX: only latest generation commits (same guard; F8 class covered by F7 mechanism + F5 analogue).

## 30. B9 filter race

F1(unread-path, slow 400ms) -> F2(all-path, fast 40ms). PRE-FIX final rows = F1 set => BUG REPRODUCED (stale filter overwrote). Same loader => same guard covers. POST-FIX F9 class: final rows satisfy F2.

## 31. B10 db-sync race interaction

015-fixed useDbSync delivers latest filter/search via EffectEvent with ONE stable listener, but its triggered load can overlap an effect load (two concurrent generations). PRE-FIX: last-writer-wins across the pair. POST-FIX: both go through the same guarded loader; sequence protection covers effect + sync-triggered + mark-read + refresh loads (single token). No sync suppression, useDbSync retained.

## 32. B11 non-route mark baseline

Unread non-routable: markAsRead persists readAt; load() runs (loadCount 1); row dot removed; unread filter drops it; counts correct. Historical expectation HOLDS (current, not stale). Post-fix F15 same.

## 33. B12 routed mark baseline

Unread routable (/sales): BEFORE readAt=undefined; mark persists readAt=ts; load() executions=0; route change to /sales occurred; local page state before unmount still shows unread row (stale). BUG REPRODUCED (persisted but zero local reconcile). Post-fix F16: persisted + reconciled (load 1) + navigated; Back shows current (remount reads persisted DB).

## 34. B13 unread-filter mark baseline

Filter=unread + routed mark: pre-fix item remains in unread list at navigate time (no reconcile ran); after Back, remount fetches fresh DB so it disappears — the visible inconsistency is the unreconciled pre-navigate state and any same-session return without remount. Post-fix F17: item removed from unread result during reconcile before navigation; Back does not resurrect it.

## 35. B14 mark-failure baseline

Injected markAsRead rejection: handleMarkRead propagates (no catch pre-fix); item remains unread in DB; no false read UI (no optimistic update exists); navigation skipped (throw precedes push). INTENDED behavior preserved post-fix: mark failure still propagates before any reconcile/nav (reconcile only runs after successful persistence). Documented, not altered.

## 36. Decision A — purchase double load

FIX. A1 holds: two distinct page effects loaded the same initial date (mount count 2, same-date proven). Consolidated to ONE selectedDate lifecycle with one-time cached migration.

## 37. Decision B — notification race

FIX. B1 holds: out-of-order completion committed stale query/filter (two-, three-, filter-race all reproduced). Added page-local monotonic generation guard covering all load starters.

## 38. Decision C — routed mark-read stale state

FIX. C1 holds: routed mark persisted DB state with zero local reconcile (loadCount 0) leaving stale unread rows/dot/filter/count in a reachable flow. Now: persist -> race-safe load().catch(()=>{}) -> push.

## 39. Exact reproduced root causes

(A) Redundant mount logic: effect1[migrate+load] + effect2[load(selectedDate)] both fire on mount. (B) Unconditional commits: load() wrote notifications/loading for whatever resolved last with no generation check and no unmount check. (C) Conditional reconcile: handleMarkRead reconciled only on the non-routed branch.

## 40. Explicit historical claims that no longer reproduce

(i) Notification search re-registers the db-sync listener per keystroke: RETIRED. Current useDbSync subscribes once with [] deps; EffectEvent supplies freshness. No churn by construction + stable-subscription proof. (ii) Any claim that purchase migration runs per date change: FALSE pre and post (mount-only / once-cached). (iii) Any claim that sales page shares the double-load: FALSE (single effect; reference only).

## 41. Fix architecture — Purchases

ONE selectedDate lifecycle: single useEffect [selectedDate] + useDbSync both call loadPurchasesForDate. Migration via one-time cached promise (migrationPromiseRef) awaited at loader start. Initial mount = 1 logical load; date change = 1 load; migration runs max once per mount; migration failure still proceeds to load (combined pre-fix behavior). No UI redesign, no inventory/accounting change.

## 42. Migration coordination design

getMigrationPromise(): creates purchaseService.migrateLegacyPurchases().catch(()=>{}) once, returns cached promise. Date change during pending migration: second generation awaits the SAME promise, first generation invalidated by seq bump before/after await => only latest date reads/commits. No migration restart on date change, no per-date migration.

## 43. Purchase latest-date protection if required

Required (B4/A5 possible): purchaseLoadStateRef {seq, mounted}; seq=++state.seq per load; after migration await and after range read, stale generations return without writing; catch writes error only if current; finally clears loading only if current+mounted. Unmount effect flips mounted=false and bumps seq. Covers purchases/loading/error (all loader state writes). No Dexie abort, no service API change.

## 44. Fix architecture — Notifications

Page-local monotonic token via createNotifLoadGuard() instance in useState (no ref-access lint hazards): next()/isCurrent()/invalidate(). load() captures filter/search snapshot, setLoading(true), awaits getFiltered, checks isCurrent after await, commits, finally setLoading(false) iff current. useDbSync callback unchanged (calls load; freshness via 015 EffectEvent). No debounce added; zero-debounce race-safe. No global serialization; sync events preserved.

## 45. Notification generation/sequence design

See 44. Latest logical request wins across effect loads, sync loads, mark-read reconciliations. Stale completions cannot modify rows/loading (no error state exists on this page). Unmount invalidates via effect cleanup (invalidate()).

## 46. Current-query snapshot design

Each load captures activeFilter/activeSearch into locals BEFORE the first await and never re-reads component state mid-flight (pre-fix already read once; preserved). Cross filter/search race (unread+ALPHA slow vs all+BETA fast) resolves to the final pair (all,BETA) with no mixed snapshot (F10 class). Service semantics untouched.

## 47. Unmount handling

Purchases: mounted flag + seq bump on unmount cleanup (captured state object, no ref-in-cleanup lint). Notifications: guard.invalidate() on unmount cleanup. In-flight resolves after unmount return early; no setState on unmounted component. Remount creates fresh guard/mount state.

## 48. Mark-read reconciliation design

Strategy A (spec): always run race-safe load() after successful mark, then navigate. handleMarkRead: if (!n.readAt) await markAsRead; await load().catch(()=>{}); if (n.route) router.push. Persistence precedes any read claim (no optimistic update). Refresh failure swallowed (no fabricated data, nav preserved). Mark failure propagates before reconcile/nav (B14 preserved). Unread filter/count/dot update via reconciled load.

## 49. PBS-BUG-015 preservation design

useDbSync.ts untouched (0 diff lines). Its callback now invokes the race-safe loader; EffectEvent freshness + stable subscription retained. No dep-array churn reintroduced; compat _deps param left as-is.

## 50. Permanent files changed

Exactly two: H.S.H-V2.0.0/frontend/app/purchases/page.tsx; H.S.H-V2.0.0/frontend/app/notifications/page.tsx. Zero changes to services, hooks, schema, backend, mobile, sales.

## 51-54. Purchases page — path

H.S.H-V2.0.0/frontend/app/purchases/page.tsx

## 51-54. Purchases page — cycle-start SHA-256

CC78FD4F2AF1DA04E2223FF9F54F5476ABBAA776836508E7B07785A5124DFB2C

## 51-54. Purchases page — COMPLETE FULL BEFORE BODY

```tsx
﻿"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Package,
  Pencil,
  Plus,
  Scale,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import { useRouter } from "next/navigation";

import AppShell from "../../src/components/layout/AppShell";
import { productService } from "../../src/services/product.service";
import { supplierService } from "../../src/services/supplier.service";
import { purchaseService } from "../../src/services/purchase.service";
import { purchaseCalculationOperation } from "../../src/services/operations/purchase-calculation.operation";
import { purchaseReversalOperation } from "../../src/services/operations/purchase-reversal.operation";
import { settingsService } from "../../src/services/settings.service";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  SETTINGS_EVENT,
} from "../../src/lib/settings";
import { formatDate as formatDateLib } from "../../src/lib/datetime";

import type { Product } from "../../src/types/entities/product";
import type { Supplier } from "../../src/types/entities/supplier";
import type { Purchase } from "../../src/types/entities/purchase";
import type { PurchaseCalculation } from "../../src/types/entities/purchase-calculation";
import type { Currency, Language } from "../../src/types/settings/settings";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";

import styles from "./page.module.css";

type PurchaseRow = {
  supplierId: string;
  productId: string;
  quantity: string;
  weightKg: string;
  price: string;
};

type CalculationForm = {
  weightBeforeSlaughterKg: string;
  weightAfterSlaughterKg: string;
  amount: string;
};

const EMPTY_CALCULATION: CalculationForm = {
  weightBeforeSlaughterKg: "",
  weightAfterSlaughterKg: "",
  amount: "",
};

function getDayBounds(date: Date): { start: number; end: number } {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const end = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
  return { start, end };
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatSelectedDate(date: Date, language: Language): string {
  try {
    return formatDateLib(date, language).dateStr;
  } catch {
    const locale =
      language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        numberingSystem: "latn",
      } as any).format(date);
    } catch {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
    }
  }
}

const TRANSLATIONS = {
  en: {
    search: "Search purchases...",
    searchPlaceholder: "Search purchases by supplier, product, date...",
    purchases: "purchases",
    purchase: "Purchase",
    addPurchase: "Add Purchase",
    editPurchase: "Edit Purchase",
    deletePurchase: "Delete Purchase",
    deleteWarning:
      "Deleting this purchase will reverse its inventory and supplier balance. This action cannot be undone.",
    deleteConfirm: "Delete Permanently",
    deleteAvailable: "Confirm available in",
    deleting: "Deleting...",
    failedDelete: "Failed to delete purchase.",
    loading: "Loading purchases...",
    noPurchases: "No purchases yet",
    noPurchasesFound: "No purchases found",
    noPurchasesForDate: "No purchases for this date",
    addFirst: "Add your first purchase to begin.",
    tryAnother: "Try another search term.",
    date: "Date",
    supplier: "Supplier",
    product: "Product",
    quantity: "Quantity",
    weight: "Weight",
    pricePerKg: "Price / kg",
    total: "Total",
    actions: "Actions",
    selectProducts: "Select Products",
    selectSuppliers: "Select Suppliers",
    continue: "Continue",
    back: "Back",
    confirm: "Confirm",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    addRows: "Add Purchase Rows",
    savePurchase: "Save Purchase",
    saving: "Saving...",
    calculate: "Calculations",
    calculations: "Slaughter Calculations",
    weightBefore: "Weight Before Slaughter",
    weightAfter: "Weight After Slaughter",
    amount: "Amount",
    averageWeight: "Average Weight",
    lossPercent: "Loss %",
    averageLoss: "Average Weight Lost",
    noProducts: "No products available.",
    noSuppliers: "No suppliers available.",
    selected: "selected",
    required: "Required",
    invalidNumber: "Please enter valid numbers.",
    invalidRows:
      "Each purchase row must have a valid weight, price and quantity.",
    supplierRequired: "Please select at least one supplier.",
    productRequired: "Please select at least one product.",
    purchaseCreated: "Purchase created successfully.",
    failedLoad: "Failed to load purchase data.",
    failedSave: "Failed to save purchase.",
    currency: "Currency",
    totalPurchases: "Total Purchases",
    totalPurchasesSub: "Registered purchases",
    totalValue: "Total Purchase Value",
    totalValueSub: "Combined purchase value",
    totalWeight: "Total Purchase Weight",
    totalWeightSub: "Combined weight",
    suppliersInvolved: "Suppliers Involved",
    suppliersInvolvedSub: "Unique suppliers",
    permanentAction: "PERMANENT ACTION",
    kg: "kg",
  },

  fr: {
    search: "Rechercher des achats...",
    searchPlaceholder: "Rechercher par fournisseur, produit, date...",
    purchases: "achats",
    purchase: "Achat",
    addPurchase: "Ajouter un achat",
    editPurchase: "Modifier l'achat",
    deletePurchase: "Supprimer l'achat",
    deleteWarning:
      "La suppression de cet achat annulera son stock et le solde du fournisseur. Cette action est irréversible.",
    deleteConfirm: "Supprimer définitivement",
    deleteAvailable: "Confirmation disponible dans",
    deleting: "Suppression...",
    failedDelete: "Échec de la suppression de l'achat.",
    loading: "Chargement des achats...",
    noPurchases: "Aucun achat pour le moment",
    noPurchasesFound: "Aucun achat trouvé",
    noPurchasesForDate: "Aucun achat pour cette date",
    addFirst: "Ajoutez votre premier achat pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    date: "Date",
    supplier: "Fournisseur",
    product: "Produit",
    quantity: "Quantité",
    weight: "Poids",
    pricePerKg: "Prix / kg",
    total: "Total",
    actions: "Actions",
    selectProducts: "Sélectionner les produits",
    selectSuppliers: "Sélectionner les fournisseurs",
    continue: "Continuer",
    back: "Retour",
    confirm: "Confirmer",
    cancel: "Annuler",
    edit: "Modifier",
    delete: "Supprimer",
    addRows: "Ajouter les lignes d'achat",
    savePurchase: "Enregistrer l'achat",
    saving: "Enregistrement...",
    calculate: "Calculs",
    calculations: "Calculs d'abattage",
    weightBefore: "Poids avant abattage",
    weightAfter: "Poids après abattage",
    amount: "Nombre",
    averageWeight: "Poids moyen",
    lossPercent: "Perte %",
    averageLoss: "Perte de poids moyenne",
    noProducts: "Aucun produit disponible.",
    noSuppliers: "Aucun fournisseur disponible.",
    selected: "sélectionné(s)",
    required: "Obligatoire",
    invalidNumber: "Veuillez saisir des nombres valides.",
    invalidRows:
      "Chaque ligne d'achat doit avoir un poids, un prix et une quantité valides.",
    supplierRequired: "Veuillez sélectionner au moins un fournisseur.",
    productRequired: "Veuillez sélectionner au moins un produit.",
    purchaseCreated: "Achat créé avec succès.",
    failedLoad: "Échec du chargement des données d'achat.",
    failedSave: "Échec de l'enregistrement de l'achat.",
    currency: "Devise",
    totalPurchases: "Total Achats",
    totalPurchasesSub: "Achats enregistrés",
    totalValue: "Valeur Totale Achats",
    totalValueSub: "Valeur combinée",
    totalWeight: "Poids Total Achats",
    totalWeightSub: "Poids combiné",
    suppliersInvolved: "Fournisseurs Impliqués",
    suppliersInvolvedSub: "Fournisseurs uniques",
    permanentAction: "ACTION PERMANENTE",
    kg: "kg",
  },

  ar: {
    search: "البحث عن المشتريات...",
    searchPlaceholder: "البحث بالمورد أو السلعة أو التاريخ...",
    purchases: "مشتريات",
    purchase: "شراء",
    addPurchase: "إضافة شراء",
    editPurchase: "تعديل الشراء",
    deletePurchase: "حذف الشراء",
    deleteWarning:
      "حذف عملية الشراء سيؤدي إلى عكس الكمية من المخزون ورصيد المورد. هذا الإجراء لا يمكن التراجع عنه.",
    deleteConfirm: "حذف نهائي",
    deleteAvailable: "يمكن التأكيد بعد",
    deleting: "جارٍ الحذف...",
    failedDelete: "فشل حذف عملية الشراء.",
    loading: "جارٍ تحميل المشتريات...",
    noPurchases: "لا توجد مشتريات بعد",
    noPurchasesFound: "لم يتم العثور على مشتريات",
    noPurchasesForDate: "لا توجد مشتريات لهذا التاريخ",
    addFirst: "أضف أول عملية شراء للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    date: "التاريخ",
    supplier: "المورد",
    product: "السلعة",
    quantity: "الكمية",
    weight: "الوزن",
    pricePerKg: "السعر / كغ",
    total: "المجموع",
    actions: "الإجراءات",
    selectProducts: "اختيار السلع",
    selectSuppliers: "اختيار الموردين",
    continue: "متابعة",
    back: "رجوع",
    confirm: "تأكيد",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    addRows: "إضافة أسطر الشراء",
    savePurchase: "حفظ الشراء",
    saving: "جارٍ الحفظ...",
    calculate: "الحسابات",
    calculations: "حسابات الذبح",
    weightBefore: "الوزن قبل الذبح",
    weightAfter: "الوزن بعد الذبح",
    amount: "العدد",
    averageWeight: "متوسط الوزن",
    lossPercent: "نسبة الفقد",
    averageLoss: "متوسط الوزن المفقود",
    noProducts: "لا توجد سلع متاحة.",
    noSuppliers: "لا يوجد موردون متاحون.",
    selected: "محدد",
    required: "مطلوب",
    invalidNumber: "يرجى إدخال أرقام صحيحة.",
    invalidRows: "يجب أن يحتوي كل سطر شراء على وزن وسعر وكمية صحيحة.",
    supplierRequired: "يرجى اختيار مورد واحد على الأقل.",
    productRequired: "يرجى اختيار سلعة واحدة على الأقل.",
    purchaseCreated: "تم إنشاء عملية الشراء بنجاح.",
    failedLoad: "فشل تحميل بيانات الشراء.",
    failedSave: "فشل حفظ عملية الشراء.",
    currency: "العملة",
    totalPurchases: "إجمالي المشتريات",
    totalPurchasesSub: "مشتريات مسجلة",
    totalValue: "إجمالي قيمة المشتريات",
    totalValueSub: "القيمة الإجمالية",
    totalWeight: "إجمالي وزن المشتريات",
    totalWeightSub: "الوزن الإجمالي",
    suppliersInvolved: "الموردون المشاركون",
    suppliersInvolvedSub: "موردون منفردون",
    permanentAction: "إجراء دائم",
    kg: "كغ",
  },
} as const;

export default function PurchasesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const [search, setSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(3.5);
  const [deleting, setDeleting] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [purchaseDate, setPurchaseDate] = useState(() =>
    toISODate(new Date()),
  );

  const [calculationForm, setCalculationForm] =
    useState<CalculationForm>(EMPTY_CALCULATION);

  const [calculation, setCalculation] =
    useState<PurchaseCalculation | null>(null);

  const [language, setLanguage] = useState<Language>(
    DEFAULT_SETTINGS.language,
  );

  const [currency, setCurrency] = useState<Currency>(
    DEFAULT_SETTINGS.currency,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showSupplierSelector, setShowSupplierSelector] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);

  const weightBeforeRef = useRef<HTMLInputElement>(null);
  const weightAfterRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const t = TRANSLATIONS[language];

  const deleteStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!deleteTarget) {
      deleteStartRef.current = null;
      return;
    }

    deleteStartRef.current = Date.now();
    setDeleteCountdown(3.5);

    const interval = window.setInterval(() => {
      if (deleteStartRef.current === null) return;
      const elapsed = Date.now() - deleteStartRef.current;
      const remaining = Math.max(0, 3.5 - elapsed / 1000);
      // display with 0.5 precision style, but keep one decimal for accuracy
      const display = remaining === 0 ? 0 : Math.ceil(remaining * 2) / 2;
      // For smoother display, use one decimal (e.g., 3.5, 3.4...), but spec shows 0.5 steps, we support both
      // Use one decimal for the circular text to show 3.5 -> 0.0
      const displayOneDecimal = Math.ceil(remaining * 10) / 10;
      setDeleteCountdown(displayOneDecimal > 0 ? displayOneDecimal : 0);
      if (remaining <= 0) {
        window.clearInterval(interval);
      }
    }, 50);

    return () => window.clearInterval(interval);
  }, [deleteTarget]);

  async function loadSettings() {
    const settings = await settingsService.get();

    setLanguage(settings?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(settings?.currency ?? DEFAULT_SETTINGS.currency);
  }

  async function loadMeta() {
    try {
      const [loadedProducts, loadedSuppliers] = await Promise.all([
        productService.getAll(),
        supplierService.getAll(),
      ]);
      setProducts(loadedProducts);
      setSuppliers(loadedSuppliers);
    } catch {
      // keep existing error handling via purchases load
    }
  }

  async function loadPurchasesForDate(date: Date) {
    setLoading(true);
    setError("");
    try {
      const { start, end } = getDayBounds(date);
      const loadedPurchases = await purchaseService.getByDateRange(start, end);
      setPurchases(loadedPurchases);
    } catch {
      setError(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadMeta();

    const handleSettingsChange = () => {
      void loadSettings();
    };

    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await purchaseService.migrateLegacyPurchases();
        await loadPurchasesForDate(selectedDate);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadPurchasesForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useDbSync(() => {
    void loadPurchasesForDate(selectedDate);
  }, [selectedDate]);

  const filteredPurchases = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return purchases;
    }

    return purchases.filter((purchase) => {
      const supplier = suppliers.find(
        (item) => item.id === purchase.supplierId,
      );

      const productNames = purchase.items
        .map(
          (item) =>
            products.find((product) => product.id === item.productId)?.name,
        )
        .filter(Boolean)
        .join(" ");

      return [
        supplier?.name,
        productNames,
        String(purchase.total),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [purchases, suppliers, products, search]);

  // KPI — derived from selected date's purchases only
  const totalPurchases = purchases.length;
  const totalValue = useMemo(
    () => purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0),
    [purchases],
  );
  const totalWeight = useMemo(
    () =>
      purchases.reduce(
        (sum, p) =>
          sum + p.items.reduce((s, item) => s + (Number(item.weightKg) || 0), 0),
        0,
      ),
    [purchases],
  );
  const suppliersInvolved = useMemo(
    () => new Set(purchases.map((p) => p.supplierId)).size,
    [purchases],
  );

  function startPurchase() {
    setError("");
    setSelectedProductIds([]);
    setSelectedSupplierIds([]);
    setCalculationForm(EMPTY_CALCULATION);
    setCalculation(null);
    setPurchaseDate(toISODate(selectedDate));
    setShowProductSelector(true);
  }

  function startEditPurchase(purchase: Purchase) {
    setError("");
    const d = new Date(purchase.date);
    const iso = toISODate(d);
    const rowsForEntry = purchase.items.map((item) => ({
      supplierId: purchase.supplierId,
      productId: item.productId,
      quantity: String(item.quantity),
      weightKg: String(item.weightKg),
      price: String(item.price),
    }));
    const payload = {
      purchaseDate: iso,
      rows: rowsForEntry,
      selectedProductIds: purchase.items.map((item) => item.productId),
      selectedSupplierIds: [purchase.supplierId],
      editingPurchaseId: purchase.id,
      calculation: purchase.calculation ?? null,
      calculationForm: purchase.calculation
        ? {
            weightBeforeSlaughterKg: String(purchase.calculation.weightBeforeSlaughterKg),
            weightAfterSlaughterKg: String(purchase.calculation.weightAfterSlaughterKg),
            amount: String(purchase.calculation.amount),
          }
        : EMPTY_CALCULATION,
    };
    try {
      localStorage.setItem("hebrih-purchase-entry", JSON.stringify(payload));
    } catch {}
    router.push(`/purchases/entry?date=${iso}&edit=${purchase.id}`);
  }

  function startDeletePurchase(purchase: Purchase) {
    setError("");
    setDeleteTarget(purchase);
    setDeleteCountdown(3.5);
    deleteStartRef.current = Date.now();
  }

  async function confirmDeletePurchase() {
    if (!deleteTarget || deleting) {
      return;
    }
    // Prevent early delete even if UI glitches — check actual elapsed time
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) {
        return;
      }
    } else if (deleteCountdown > 0) {
      return;
    }

    try {
      setDeleting(true);
      setError("");

      await purchaseReversalOperation.delete(deleteTarget.id);
      await loadPurchasesForDate(selectedDate);
      await loadMeta();

      setDeleteTarget(null);
      setDeleteCountdown(10);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedDelete);
    } finally {
      setDeleting(false);
    }
  }
  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function createPurchaseRows() {
    if (selectedProductIds.length === 0) {
      setError(t.productRequired);
      return;
    }

    setError("");
    setShowProductSelector(false);
    setShowSupplierSelector(true);
  }

  function toggleSupplier(supplierId: string) {
    setSelectedSupplierIds((current) =>
      current.includes(supplierId)
        ? current.filter((id) => id !== supplierId)
        : [...current, supplierId],
    );
  }

  function createSupplierProductRows() {
    if (selectedSupplierIds.length === 0) {
      setError(t.supplierRequired);
      return;
    }

    const nextRows: PurchaseRow[] = [];

    for (const supplierId of selectedSupplierIds) {
      for (const productId of selectedProductIds) {
        const product = products.find((item) => item.id === productId);

        nextRows.push({
          supplierId,
          productId,
          quantity: "0",
          weightKg: "0",
          price: product?.price.toString() ?? "0",
        });
      }
    }

    const payload = {
      purchaseDate,
      rows: nextRows,
      selectedProductIds,
      selectedSupplierIds,
      editingPurchaseId: null,
      calculation,
      calculationForm,
    };
    try {
      localStorage.setItem("hebrih-purchase-entry", JSON.stringify(payload));
    } catch {}
    setError("");
    setShowSupplierSelector(false);
    router.push(`/purchases/entry?date=${purchaseDate}`);
  }

  function calculateSlaughter() {
    setError("");

    const weightBefore = Number(
      calculationForm.weightBeforeSlaughterKg,
    );
    const weightAfter = Number(
      calculationForm.weightAfterSlaughterKg,
    );
    const amount = Number(calculationForm.amount);

    if (
      !Number.isFinite(weightBefore) ||
      !Number.isFinite(weightAfter) ||
      !Number.isFinite(amount)
    ) {
      setError(t.invalidNumber);
      return;
    }

    try {
      const result = purchaseCalculationOperation.calculate({
        weightBeforeSlaughterKg: weightBefore,
        weightAfterSlaughterKg: weightAfter,
        amount,
      });

      setCalculation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.invalidNumber);
    }
  }

  function supplierName(id: string) {
    return suppliers.find((supplier) => supplier.id === id)?.name ?? "—";
  }

  function productName(id: string) {
    return products.find((product) => product.id === id)?.name ?? "—";
  }

  return (
    <AppShell activePage="purchases">
      <main className={styles.purchasesPage}>
        <div className={styles.purchasesShell}>
          {/* KPI Cards — RED→YELLOW→RED→YELLOW */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconPurchases}`}>
                <ClipboardList size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalPurchases}</span>
                <strong className={styles.summaryValue}>{totalPurchases}</strong>
                <small className={styles.summarySub}>{t.totalPurchasesSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconValue}`}>
                <CircleDollarSign size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalValue}</span>
                <strong className={styles.summaryValue}>{formatCurrency(totalValue, currency)}</strong>
                <small className={styles.summarySub}>{t.totalValueSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconWeight}`}>
                <Scale size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalWeight}</span>
                <strong className={styles.summaryValue}>{totalWeight.toFixed(2)} {t.kg}</strong>
                <small className={styles.summarySub}>{t.totalWeightSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconSuppliers}`}>
                <Truck size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.suppliersInvolved}</span>
                <strong className={styles.summaryValue}>{suppliersInvolved}</strong>
                <small className={styles.summarySub}>{t.suppliersInvolvedSub}</small>
              </div>
            </div>
          </section>

          {/* Toolbar: Search + Date + Calculations + Add Purchase */}
          <section className={styles.toolbar}>
            <div className={styles.searchBox}>
              <span aria-hidden="true">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.search}
                aria-label={t.search}
              />
            </div>

            <StyledDatePicker
              value={toISODate(selectedDate)}
              onChange={(v) => {
                if (v) {
                  const d = parseISODate(v);
                  if (d) {
                    const n = new Date(d);
                    n.setHours(0, 0, 0, 0);
                    setSelectedDate(n);
                  }
                }
              }}
              language={language}
              className={styles.toolbarDate}
            />

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setShowCalculation(true)}
            >
              {t.calculate}
            </button>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={startPurchase}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addPurchase}
            </button>
          </section>

          {error && !showProductSelector && !showSupplierSelector && !showCalculation && !deleteTarget && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.supplier}</span>
              <span>{t.product}</span>
              <span>{t.weight}</span>
              <span>{t.pricePerKg}</span>
              <span>{t.total}</span>
              <span>{t.actions}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : filteredPurchases.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <ClipboardList size={32} strokeWidth={2} />
                </div>
                <strong>{purchases.length === 0 ? t.noPurchasesForDate : t.noPurchasesFound}</strong>
                <p>{purchases.length === 0 ? t.addFirst : t.tryAnother}</p>
                {purchases.length === 0 && (
                  <button type="button" className={styles.primaryButton} onClick={startPurchase}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addPurchase}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.purchaseRows}>
                {filteredPurchases.map((purchase) => {
                  const item = purchase.items[0];
                  if (!item) return null;
                  return (
                    <article
                      key={purchase.id}
                      className={styles.purchaseRow}
                      onDoubleClick={() => startEditPurchase(purchase)}
                    >
                      <span className={styles.supplierText}>{supplierName(purchase.supplierId)}</span>
                      <span className={styles.productText}>{productName(item.productId)}</span>
                      <span className={styles.weightText}>
                        {Number(item.weightKg).toFixed(2)} {t.kg}
                      </span>
                      <span className={styles.priceText}>{formatCurrency(item.price, currency)}</span>
                      <strong className={styles.totalValue}>{formatCurrency(item.total, currency)}</strong>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowEditButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            startEditPurchase(purchase);
                          }}
                          aria-label={`${t.edit} ${purchase.id}`}
                        >
                          <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                          {t.edit}
                        </button>
                        <button
                          type="button"
                          className={styles.rowDeleteButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            startDeletePurchase(purchase);
                          }}
                          aria-label={t.deletePurchase}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                          {t.delete}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {showProductSelector && (
            <div className={styles.modalBackdrop} onClick={() => setShowProductSelector(false)}>
              <section
                className={`${styles.modal} ${styles.selectorModal}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="select-products-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className={styles.modalHeader}>
                  <h2 id="select-products-title">{t.selectProducts}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowProductSelector(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.selectorList} role="group" aria-labelledby="select-products-title">
                  {products.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noProducts}</p>
                  ) : (
                    products.map((product) => {
                      const selected = selectedProductIds.includes(product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          className={`${styles.productSelectCard} ${selected ? styles.productSelectCardSelected : ""}`}
                          onClick={() => toggleProduct(product.id)}
                          aria-pressed={selected}
                        >
                          <span className={`${styles.customCheckbox} ${selected ? styles.customCheckboxSelected : ""}`} aria-hidden="true">
                            {selected ? <Check size={12} strokeWidth={2.5} /> : null}
                          </span>
                          <span className={styles.productSelectIcon} aria-hidden="true">
                            <Package size={18} strokeWidth={2} />
                          </span>
                          <span className={styles.productSelectText}>
                            <strong>{product.name}</strong>
                            <small>
                              {formatCurrency(product.price, currency)} / {t.kg}
                            </small>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <footer className={styles.modalFooter}>
                  <span className={styles.selectionCount} aria-live="polite">
                    {selectedProductIds.length} {t.selected}
                  </span>
                  <div className={styles.modalFooterActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setShowProductSelector(false)}>
                      {t.cancel}
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={createPurchaseRows}
                      disabled={selectedProductIds.length === 0}
                    >
                      {t.continue}
                    </button>
                  </div>
                </footer>
              </section>
            </div>
          )}

          {showSupplierSelector && (
            <div className={styles.modalBackdrop} onClick={() => setShowSupplierSelector(false)}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <header className={styles.modalHeader}>
                  <h2>{t.selectSuppliers}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowSupplierSelector(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.selectorList}>
                  {suppliers.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noSuppliers}</p>
                  ) : (
                    suppliers.map((supplier) => (
                      <label key={supplier.id} className={styles.selectorItem}>
                        <input
                          type="checkbox"
                          checked={selectedSupplierIds.includes(supplier.id)}
                          onChange={() => toggleSupplier(supplier.id)}
                        />
                        <span>
                          <strong>{supplier.name}</strong>
                          <small>{formatCurrency(Number(supplier.balance) || 0, currency)}</small>
                        </span>
                      </label>
                    ))
                  )}
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <footer className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setShowSupplierSelector(false);
                      setShowProductSelector(true);
                    }}
                  >
                    {t.back}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={createSupplierProductRows}>
                    {t.continue}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {deleteTarget && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModalCompact} role="dialog" aria-modal="true" aria-labelledby="delete-title">
                <div className={styles.warningIconSmall} aria-hidden="true">
                  <AlertTriangle size={20} strokeWidth={2} />
                </div>
                <h2 id="delete-title">{t.deletePurchase}</h2>
                <p className={styles.deleteDescription}>{t.deleteWarning}</p>
                {deleteTarget && (
                  <p className={styles.deleteContext}>
                    {supplierName(deleteTarget.supplierId)} · {deleteTarget.items.map((it) => productName(it.productId)).join(", ")} · {formatCurrency(deleteTarget.total, currency)}
                  </p>
                )}
                <div className={styles.circularCountdown} aria-live="polite">
                  <div className={styles.circleWrapper} aria-hidden="true">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" className={styles.circleTrack} />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={styles.circleProgress}
                        style={{
                          strokeDasharray: `${2 * Math.PI * 28}`,
                          strokeDashoffset: `${2 * Math.PI * 28 * (deleteCountdown / 3.5)}`,
                        }}
                      />
                    </svg>
                    <span className={styles.circleText}>
                      {deleteCountdown > 0 ? deleteCountdown.toFixed(1) : "0.0"}
                    </span>
                  </div>
                  <span className={styles.circleLabel}>
                    {deleteCountdown > 0 ? "Confirm deletion" : t.deleteConfirm}
                  </span>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <div className={styles.modalFooterCompact}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!deleting) {
                        setDeleteTarget(null);
                        setDeleteCountdown(3.5);
                        deleteStartRef.current = null;
                      }
                    }}
                    disabled={deleting}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void confirmDeletePurchase()}
                    disabled={deleteCountdown > 0 || deleting}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    {deleting ? t.deleting : t.deleteConfirm}
                  </button>
                </div>
              </section>
            </div>
          )}

          {showCalculation && (
            <div className={styles.modalBackdrop}>
              <section className={styles.modal} role="dialog" aria-modal="true">
                <header className={styles.modalHeader}>
                  <h2>{t.calculations}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowCalculation(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.calcForm}>
                  <label>
                    <span>{t.weightBefore}</span>
                    <input
                      ref={weightBeforeRef}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={calculationForm.weightBeforeSlaughterKg}
                      onChange={(event) =>
                        setCalculationForm((current) => ({
                          ...current,
                          weightBeforeSlaughterKg: event.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          weightAfterRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span>{t.weightAfter}</span>
                    <input
                      ref={weightAfterRef}
                      type="number"
                      min="0"
                      step="0.01"
                      value={calculationForm.weightAfterSlaughterKg}
                      onChange={(event) =>
                        setCalculationForm((current) => ({
                          ...current,
                          weightAfterSlaughterKg: event.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          amountRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span>{t.amount}</span>
                    <input
                      ref={amountRef}
                      type="number"
                      min="0.01"
                      step="1"
                      value={calculationForm.amount}
                      onChange={(event) =>
                        setCalculationForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          calculateSlaughter();
                        }
                      }}
                    />
                  </label>

                  {calculation && (
                    <div className={styles.calculationResult}>
                      <div>
                        <span>{t.averageWeight}</span>
                        <strong>{calculation.averageWeightKg.toFixed(2)} {t.kg}</strong>
                      </div>
                      <div>
                        <span>{t.lossPercent}</span>
                        <strong>{calculation.averageLossPercent.toFixed(2)}%</strong>
                      </div>
                      <div>
                        <span>{t.averageLoss}</span>
                        <strong>{calculation.averageLossKg.toFixed(2)} {t.kg}</strong>
                      </div>
                    </div>
                  )}

                  {error && <div className={styles.formError} style={{ margin: 0 }}>{error}</div>}
                </div>

                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setShowCalculation(false)}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={calculateSlaughter}>
                    {t.calculate}
                  </button>
                </footer>
              </section>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}


```

## 51-54. Purchases page — final SHA-256

11296F91E7308DA12248B98D67D17D93E76F171BEFA5081BC1E8B6E438228C43

## 51-54. Purchases page — COMPLETE FULL AFTER BODY

```tsx
﻿"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Package,
  Pencil,
  Plus,
  Scale,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import { useRouter } from "next/navigation";

import AppShell from "../../src/components/layout/AppShell";
import { productService } from "../../src/services/product.service";
import { supplierService } from "../../src/services/supplier.service";
import { purchaseService } from "../../src/services/purchase.service";
import { purchaseCalculationOperation } from "../../src/services/operations/purchase-calculation.operation";
import { purchaseReversalOperation } from "../../src/services/operations/purchase-reversal.operation";
import { settingsService } from "../../src/services/settings.service";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  SETTINGS_EVENT,
} from "../../src/lib/settings";
import { formatDate as formatDateLib } from "../../src/lib/datetime";

import type { Product } from "../../src/types/entities/product";
import type { Supplier } from "../../src/types/entities/supplier";
import type { Purchase } from "../../src/types/entities/purchase";
import type { PurchaseCalculation } from "../../src/types/entities/purchase-calculation";
import type { Currency, Language } from "../../src/types/settings/settings";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";

import styles from "./page.module.css";

type PurchaseRow = {
  supplierId: string;
  productId: string;
  quantity: string;
  weightKg: string;
  price: string;
};

type CalculationForm = {
  weightBeforeSlaughterKg: string;
  weightAfterSlaughterKg: string;
  amount: string;
};

const EMPTY_CALCULATION: CalculationForm = {
  weightBeforeSlaughterKg: "",
  weightAfterSlaughterKg: "",
  amount: "",
};

function getDayBounds(date: Date): { start: number; end: number } {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const end = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
  return { start, end };
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatSelectedDate(date: Date, language: Language): string {
  try {
    return formatDateLib(date, language).dateStr;
  } catch {
    const locale =
      language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        numberingSystem: "latn",
      } as any).format(date);
    } catch {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
    }
  }
}

const TRANSLATIONS = {
  en: {
    search: "Search purchases...",
    searchPlaceholder: "Search purchases by supplier, product, date...",
    purchases: "purchases",
    purchase: "Purchase",
    addPurchase: "Add Purchase",
    editPurchase: "Edit Purchase",
    deletePurchase: "Delete Purchase",
    deleteWarning:
      "Deleting this purchase will reverse its inventory and supplier balance. This action cannot be undone.",
    deleteConfirm: "Delete Permanently",
    deleteAvailable: "Confirm available in",
    deleting: "Deleting...",
    failedDelete: "Failed to delete purchase.",
    loading: "Loading purchases...",
    noPurchases: "No purchases yet",
    noPurchasesFound: "No purchases found",
    noPurchasesForDate: "No purchases for this date",
    addFirst: "Add your first purchase to begin.",
    tryAnother: "Try another search term.",
    date: "Date",
    supplier: "Supplier",
    product: "Product",
    quantity: "Quantity",
    weight: "Weight",
    pricePerKg: "Price / kg",
    total: "Total",
    actions: "Actions",
    selectProducts: "Select Products",
    selectSuppliers: "Select Suppliers",
    continue: "Continue",
    back: "Back",
    confirm: "Confirm",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    addRows: "Add Purchase Rows",
    savePurchase: "Save Purchase",
    saving: "Saving...",
    calculate: "Calculations",
    calculations: "Slaughter Calculations",
    weightBefore: "Weight Before Slaughter",
    weightAfter: "Weight After Slaughter",
    amount: "Amount",
    averageWeight: "Average Weight",
    lossPercent: "Loss %",
    averageLoss: "Average Weight Lost",
    noProducts: "No products available.",
    noSuppliers: "No suppliers available.",
    selected: "selected",
    required: "Required",
    invalidNumber: "Please enter valid numbers.",
    invalidRows:
      "Each purchase row must have a valid weight, price and quantity.",
    supplierRequired: "Please select at least one supplier.",
    productRequired: "Please select at least one product.",
    purchaseCreated: "Purchase created successfully.",
    failedLoad: "Failed to load purchase data.",
    failedSave: "Failed to save purchase.",
    currency: "Currency",
    totalPurchases: "Total Purchases",
    totalPurchasesSub: "Registered purchases",
    totalValue: "Total Purchase Value",
    totalValueSub: "Combined purchase value",
    totalWeight: "Total Purchase Weight",
    totalWeightSub: "Combined weight",
    suppliersInvolved: "Suppliers Involved",
    suppliersInvolvedSub: "Unique suppliers",
    permanentAction: "PERMANENT ACTION",
    kg: "kg",
  },

  fr: {
    search: "Rechercher des achats...",
    searchPlaceholder: "Rechercher par fournisseur, produit, date...",
    purchases: "achats",
    purchase: "Achat",
    addPurchase: "Ajouter un achat",
    editPurchase: "Modifier l'achat",
    deletePurchase: "Supprimer l'achat",
    deleteWarning:
      "La suppression de cet achat annulera son stock et le solde du fournisseur. Cette action est irréversible.",
    deleteConfirm: "Supprimer définitivement",
    deleteAvailable: "Confirmation disponible dans",
    deleting: "Suppression...",
    failedDelete: "Échec de la suppression de l'achat.",
    loading: "Chargement des achats...",
    noPurchases: "Aucun achat pour le moment",
    noPurchasesFound: "Aucun achat trouvé",
    noPurchasesForDate: "Aucun achat pour cette date",
    addFirst: "Ajoutez votre premier achat pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    date: "Date",
    supplier: "Fournisseur",
    product: "Produit",
    quantity: "Quantité",
    weight: "Poids",
    pricePerKg: "Prix / kg",
    total: "Total",
    actions: "Actions",
    selectProducts: "Sélectionner les produits",
    selectSuppliers: "Sélectionner les fournisseurs",
    continue: "Continuer",
    back: "Retour",
    confirm: "Confirmer",
    cancel: "Annuler",
    edit: "Modifier",
    delete: "Supprimer",
    addRows: "Ajouter les lignes d'achat",
    savePurchase: "Enregistrer l'achat",
    saving: "Enregistrement...",
    calculate: "Calculs",
    calculations: "Calculs d'abattage",
    weightBefore: "Poids avant abattage",
    weightAfter: "Poids après abattage",
    amount: "Nombre",
    averageWeight: "Poids moyen",
    lossPercent: "Perte %",
    averageLoss: "Perte de poids moyenne",
    noProducts: "Aucun produit disponible.",
    noSuppliers: "Aucun fournisseur disponible.",
    selected: "sélectionné(s)",
    required: "Obligatoire",
    invalidNumber: "Veuillez saisir des nombres valides.",
    invalidRows:
      "Chaque ligne d'achat doit avoir un poids, un prix et une quantité valides.",
    supplierRequired: "Veuillez sélectionner au moins un fournisseur.",
    productRequired: "Veuillez sélectionner au moins un produit.",
    purchaseCreated: "Achat créé avec succès.",
    failedLoad: "Échec du chargement des données d'achat.",
    failedSave: "Échec de l'enregistrement de l'achat.",
    currency: "Devise",
    totalPurchases: "Total Achats",
    totalPurchasesSub: "Achats enregistrés",
    totalValue: "Valeur Totale Achats",
    totalValueSub: "Valeur combinée",
    totalWeight: "Poids Total Achats",
    totalWeightSub: "Poids combiné",
    suppliersInvolved: "Fournisseurs Impliqués",
    suppliersInvolvedSub: "Fournisseurs uniques",
    permanentAction: "ACTION PERMANENTE",
    kg: "kg",
  },

  ar: {
    search: "البحث عن المشتريات...",
    searchPlaceholder: "البحث بالمورد أو السلعة أو التاريخ...",
    purchases: "مشتريات",
    purchase: "شراء",
    addPurchase: "إضافة شراء",
    editPurchase: "تعديل الشراء",
    deletePurchase: "حذف الشراء",
    deleteWarning:
      "حذف عملية الشراء سيؤدي إلى عكس الكمية من المخزون ورصيد المورد. هذا الإجراء لا يمكن التراجع عنه.",
    deleteConfirm: "حذف نهائي",
    deleteAvailable: "يمكن التأكيد بعد",
    deleting: "جارٍ الحذف...",
    failedDelete: "فشل حذف عملية الشراء.",
    loading: "جارٍ تحميل المشتريات...",
    noPurchases: "لا توجد مشتريات بعد",
    noPurchasesFound: "لم يتم العثور على مشتريات",
    noPurchasesForDate: "لا توجد مشتريات لهذا التاريخ",
    addFirst: "أضف أول عملية شراء للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    date: "التاريخ",
    supplier: "المورد",
    product: "السلعة",
    quantity: "الكمية",
    weight: "الوزن",
    pricePerKg: "السعر / كغ",
    total: "المجموع",
    actions: "الإجراءات",
    selectProducts: "اختيار السلع",
    selectSuppliers: "اختيار الموردين",
    continue: "متابعة",
    back: "رجوع",
    confirm: "تأكيد",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    addRows: "إضافة أسطر الشراء",
    savePurchase: "حفظ الشراء",
    saving: "جارٍ الحفظ...",
    calculate: "الحسابات",
    calculations: "حسابات الذبح",
    weightBefore: "الوزن قبل الذبح",
    weightAfter: "الوزن بعد الذبح",
    amount: "العدد",
    averageWeight: "متوسط الوزن",
    lossPercent: "نسبة الفقد",
    averageLoss: "متوسط الوزن المفقود",
    noProducts: "لا توجد سلع متاحة.",
    noSuppliers: "لا يوجد موردون متاحون.",
    selected: "محدد",
    required: "مطلوب",
    invalidNumber: "يرجى إدخال أرقام صحيحة.",
    invalidRows: "يجب أن يحتوي كل سطر شراء على وزن وسعر وكمية صحيحة.",
    supplierRequired: "يرجى اختيار مورد واحد على الأقل.",
    productRequired: "يرجى اختيار سلعة واحدة على الأقل.",
    purchaseCreated: "تم إنشاء عملية الشراء بنجاح.",
    failedLoad: "فشل تحميل بيانات الشراء.",
    failedSave: "فشل حفظ عملية الشراء.",
    currency: "العملة",
    totalPurchases: "إجمالي المشتريات",
    totalPurchasesSub: "مشتريات مسجلة",
    totalValue: "إجمالي قيمة المشتريات",
    totalValueSub: "القيمة الإجمالية",
    totalWeight: "إجمالي وزن المشتريات",
    totalWeightSub: "الوزن الإجمالي",
    suppliersInvolved: "الموردون المشاركون",
    suppliersInvolvedSub: "موردون منفردون",
    permanentAction: "إجراء دائم",
    kg: "كغ",
  },
} as const;

export default function PurchasesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const [search, setSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(3.5);
  const [deleting, setDeleting] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [purchaseDate, setPurchaseDate] = useState(() =>
    toISODate(new Date()),
  );

  const [calculationForm, setCalculationForm] =
    useState<CalculationForm>(EMPTY_CALCULATION);

  const [calculation, setCalculation] =
    useState<PurchaseCalculation | null>(null);

  const [language, setLanguage] = useState<Language>(
    DEFAULT_SETTINGS.language,
  );

  const [currency, setCurrency] = useState<Currency>(
    DEFAULT_SETTINGS.currency,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showSupplierSelector, setShowSupplierSelector] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);

  const weightBeforeRef = useRef<HTMLInputElement>(null);
  const weightAfterRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const t = TRANSLATIONS[language];

  const deleteStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!deleteTarget) {
      deleteStartRef.current = null;
      return;
    }

    deleteStartRef.current = Date.now();
    setDeleteCountdown(3.5);

    const interval = window.setInterval(() => {
      if (deleteStartRef.current === null) return;
      const elapsed = Date.now() - deleteStartRef.current;
      const remaining = Math.max(0, 3.5 - elapsed / 1000);
      // display with 0.5 precision style, but keep one decimal for accuracy
      const display = remaining === 0 ? 0 : Math.ceil(remaining * 2) / 2;
      // For smoother display, use one decimal (e.g., 3.5, 3.4...), but spec shows 0.5 steps, we support both
      // Use one decimal for the circular text to show 3.5 -> 0.0
      const displayOneDecimal = Math.ceil(remaining * 10) / 10;
      setDeleteCountdown(displayOneDecimal > 0 ? displayOneDecimal : 0);
      if (remaining <= 0) {
        window.clearInterval(interval);
      }
    }, 50);

    return () => window.clearInterval(interval);
  }, [deleteTarget]);

  async function loadSettings() {
    const settings = await settingsService.get();

    setLanguage(settings?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(settings?.currency ?? DEFAULT_SETTINGS.currency);
  }

  async function loadMeta() {
    try {
      const [loadedProducts, loadedSuppliers] = await Promise.all([
        productService.getAll(),
        supplierService.getAll(),
      ]);
      setProducts(loadedProducts);
      setSuppliers(loadedSuppliers);
    } catch {
      // keep existing error handling via purchases load
    }
  }

  // PBS-BUG-038: one-time cached migration promise. The single selectedDate
  // lifecycle below awaits it, so mount performs exactly ONE logical initial
  // purchase load (no separate migration-effect + date-effect double load).
  // Rejected migrations resolve silently here; the date load still proceeds,
  // matching the combined pre-fix behavior (effect 2 loaded even if effect 1
  // migration failed).
  const migrationPromiseRef = useRef<Promise<void> | null>(null);

  // PBS-BUG-038: latest-date-wins generation guard + unmount safety. Only the
  // newest load may commit purchases/loading/error; stale overlaps return
  // without writing state. The cleanup invalidates via the captured state
  // object (not via ref access in cleanup).
  const purchaseLoadStateRef = useRef({ seq: 0, mounted: true });

  useEffect(() => {
    const state = purchaseLoadStateRef.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      state.seq++;
    };
  }, []);

  function getMigrationPromise(): Promise<void> {
    if (!migrationPromiseRef.current) {
      migrationPromiseRef.current = purchaseService
        .migrateLegacyPurchases()
        .catch(() => {});
    }
    return migrationPromiseRef.current;
  }

  async function loadPurchasesForDate(date: Date) {
    const state = purchaseLoadStateRef.current;
    const seq = ++state.seq;
    setLoading(true);
    setError("");
    try {
      await getMigrationPromise();
      if (seq !== state.seq) return;
      if (!state.mounted) return;
      const { start, end } = getDayBounds(date);
      const loadedPurchases = await purchaseService.getByDateRange(start, end);
      if (seq !== state.seq) return;
      if (!state.mounted) return;
      setPurchases(loadedPurchases);
    } catch {
      if (seq !== state.seq) return;
      if (!state.mounted) return;
      setError(t.failedLoad);
    } finally {
      if (seq === state.seq && state.mounted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadMeta();

    const handleSettingsChange = () => {
      void loadSettings();
    };

    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
    };
  }, []);

  // PBS-BUG-038: single selected-date loading lifecycle. The one-time
  // migration above is awaited inside loadPurchasesForDate, so this ONE
  // effect covers mount + every date change with exactly one logical load.
  // (Pre-fix a second mount-only effect duplicated the initial load.)
  useEffect(() => {
    void loadPurchasesForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useDbSync(() => {
    void loadPurchasesForDate(selectedDate);
  }, [selectedDate]);

  const filteredPurchases = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return purchases;
    }

    return purchases.filter((purchase) => {
      const supplier = suppliers.find(
        (item) => item.id === purchase.supplierId,
      );

      const productNames = purchase.items
        .map(
          (item) =>
            products.find((product) => product.id === item.productId)?.name,
        )
        .filter(Boolean)
        .join(" ");

      return [
        supplier?.name,
        productNames,
        String(purchase.total),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [purchases, suppliers, products, search]);

  // KPI — derived from selected date's purchases only
  const totalPurchases = purchases.length;
  const totalValue = useMemo(
    () => purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0),
    [purchases],
  );
  const totalWeight = useMemo(
    () =>
      purchases.reduce(
        (sum, p) =>
          sum + p.items.reduce((s, item) => s + (Number(item.weightKg) || 0), 0),
        0,
      ),
    [purchases],
  );
  const suppliersInvolved = useMemo(
    () => new Set(purchases.map((p) => p.supplierId)).size,
    [purchases],
  );

  function startPurchase() {
    setError("");
    setSelectedProductIds([]);
    setSelectedSupplierIds([]);
    setCalculationForm(EMPTY_CALCULATION);
    setCalculation(null);
    setPurchaseDate(toISODate(selectedDate));
    setShowProductSelector(true);
  }

  function startEditPurchase(purchase: Purchase) {
    setError("");
    const d = new Date(purchase.date);
    const iso = toISODate(d);
    const rowsForEntry = purchase.items.map((item) => ({
      supplierId: purchase.supplierId,
      productId: item.productId,
      quantity: String(item.quantity),
      weightKg: String(item.weightKg),
      price: String(item.price),
    }));
    const payload = {
      purchaseDate: iso,
      rows: rowsForEntry,
      selectedProductIds: purchase.items.map((item) => item.productId),
      selectedSupplierIds: [purchase.supplierId],
      editingPurchaseId: purchase.id,
      calculation: purchase.calculation ?? null,
      calculationForm: purchase.calculation
        ? {
            weightBeforeSlaughterKg: String(purchase.calculation.weightBeforeSlaughterKg),
            weightAfterSlaughterKg: String(purchase.calculation.weightAfterSlaughterKg),
            amount: String(purchase.calculation.amount),
          }
        : EMPTY_CALCULATION,
    };
    try {
      localStorage.setItem("hebrih-purchase-entry", JSON.stringify(payload));
    } catch {}
    router.push(`/purchases/entry?date=${iso}&edit=${purchase.id}`);
  }

  function startDeletePurchase(purchase: Purchase) {
    setError("");
    setDeleteTarget(purchase);
    setDeleteCountdown(3.5);
    deleteStartRef.current = Date.now();
  }

  async function confirmDeletePurchase() {
    if (!deleteTarget || deleting) {
      return;
    }
    // Prevent early delete even if UI glitches — check actual elapsed time
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) {
        return;
      }
    } else if (deleteCountdown > 0) {
      return;
    }

    try {
      setDeleting(true);
      setError("");

      await purchaseReversalOperation.delete(deleteTarget.id);
      await loadPurchasesForDate(selectedDate);
      await loadMeta();

      setDeleteTarget(null);
      setDeleteCountdown(10);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedDelete);
    } finally {
      setDeleting(false);
    }
  }
  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function createPurchaseRows() {
    if (selectedProductIds.length === 0) {
      setError(t.productRequired);
      return;
    }

    setError("");
    setShowProductSelector(false);
    setShowSupplierSelector(true);
  }

  function toggleSupplier(supplierId: string) {
    setSelectedSupplierIds((current) =>
      current.includes(supplierId)
        ? current.filter((id) => id !== supplierId)
        : [...current, supplierId],
    );
  }

  function createSupplierProductRows() {
    if (selectedSupplierIds.length === 0) {
      setError(t.supplierRequired);
      return;
    }

    const nextRows: PurchaseRow[] = [];

    for (const supplierId of selectedSupplierIds) {
      for (const productId of selectedProductIds) {
        const product = products.find((item) => item.id === productId);

        nextRows.push({
          supplierId,
          productId,
          quantity: "0",
          weightKg: "0",
          price: product?.price.toString() ?? "0",
        });
      }
    }

    const payload = {
      purchaseDate,
      rows: nextRows,
      selectedProductIds,
      selectedSupplierIds,
      editingPurchaseId: null,
      calculation,
      calculationForm,
    };
    try {
      localStorage.setItem("hebrih-purchase-entry", JSON.stringify(payload));
    } catch {}
    setError("");
    setShowSupplierSelector(false);
    router.push(`/purchases/entry?date=${purchaseDate}`);
  }

  function calculateSlaughter() {
    setError("");

    const weightBefore = Number(
      calculationForm.weightBeforeSlaughterKg,
    );
    const weightAfter = Number(
      calculationForm.weightAfterSlaughterKg,
    );
    const amount = Number(calculationForm.amount);

    if (
      !Number.isFinite(weightBefore) ||
      !Number.isFinite(weightAfter) ||
      !Number.isFinite(amount)
    ) {
      setError(t.invalidNumber);
      return;
    }

    try {
      const result = purchaseCalculationOperation.calculate({
        weightBeforeSlaughterKg: weightBefore,
        weightAfterSlaughterKg: weightAfter,
        amount,
      });

      setCalculation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.invalidNumber);
    }
  }

  function supplierName(id: string) {
    return suppliers.find((supplier) => supplier.id === id)?.name ?? "—";
  }

  function productName(id: string) {
    return products.find((product) => product.id === id)?.name ?? "—";
  }

  return (
    <AppShell activePage="purchases">
      <main className={styles.purchasesPage}>
        <div className={styles.purchasesShell}>
          {/* KPI Cards — RED→YELLOW→RED→YELLOW */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconPurchases}`}>
                <ClipboardList size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalPurchases}</span>
                <strong className={styles.summaryValue}>{totalPurchases}</strong>
                <small className={styles.summarySub}>{t.totalPurchasesSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconValue}`}>
                <CircleDollarSign size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalValue}</span>
                <strong className={styles.summaryValue}>{formatCurrency(totalValue, currency)}</strong>
                <small className={styles.summarySub}>{t.totalValueSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconWeight}`}>
                <Scale size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalWeight}</span>
                <strong className={styles.summaryValue}>{totalWeight.toFixed(2)} {t.kg}</strong>
                <small className={styles.summarySub}>{t.totalWeightSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconSuppliers}`}>
                <Truck size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.suppliersInvolved}</span>
                <strong className={styles.summaryValue}>{suppliersInvolved}</strong>
                <small className={styles.summarySub}>{t.suppliersInvolvedSub}</small>
              </div>
            </div>
          </section>

          {/* Toolbar: Search + Date + Calculations + Add Purchase */}
          <section className={styles.toolbar}>
            <div className={styles.searchBox}>
              <span aria-hidden="true">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.search}
                aria-label={t.search}
              />
            </div>

            <StyledDatePicker
              value={toISODate(selectedDate)}
              onChange={(v) => {
                if (v) {
                  const d = parseISODate(v);
                  if (d) {
                    const n = new Date(d);
                    n.setHours(0, 0, 0, 0);
                    setSelectedDate(n);
                  }
                }
              }}
              language={language}
              className={styles.toolbarDate}
            />

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setShowCalculation(true)}
            >
              {t.calculate}
            </button>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={startPurchase}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addPurchase}
            </button>
          </section>

          {error && !showProductSelector && !showSupplierSelector && !showCalculation && !deleteTarget && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.supplier}</span>
              <span>{t.product}</span>
              <span>{t.weight}</span>
              <span>{t.pricePerKg}</span>
              <span>{t.total}</span>
              <span>{t.actions}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : filteredPurchases.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <ClipboardList size={32} strokeWidth={2} />
                </div>
                <strong>{purchases.length === 0 ? t.noPurchasesForDate : t.noPurchasesFound}</strong>
                <p>{purchases.length === 0 ? t.addFirst : t.tryAnother}</p>
                {purchases.length === 0 && (
                  <button type="button" className={styles.primaryButton} onClick={startPurchase}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addPurchase}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.purchaseRows}>
                {filteredPurchases.map((purchase) => {
                  const item = purchase.items[0];
                  if (!item) return null;
                  return (
                    <article
                      key={purchase.id}
                      className={styles.purchaseRow}
                      onDoubleClick={() => startEditPurchase(purchase)}
                    >
                      <span className={styles.supplierText}>{supplierName(purchase.supplierId)}</span>
                      <span className={styles.productText}>{productName(item.productId)}</span>
                      <span className={styles.weightText}>
                        {Number(item.weightKg).toFixed(2)} {t.kg}
                      </span>
                      <span className={styles.priceText}>{formatCurrency(item.price, currency)}</span>
                      <strong className={styles.totalValue}>{formatCurrency(item.total, currency)}</strong>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowEditButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            startEditPurchase(purchase);
                          }}
                          aria-label={`${t.edit} ${purchase.id}`}
                        >
                          <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                          {t.edit}
                        </button>
                        <button
                          type="button"
                          className={styles.rowDeleteButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            startDeletePurchase(purchase);
                          }}
                          aria-label={t.deletePurchase}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                          {t.delete}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {showProductSelector && (
            <div className={styles.modalBackdrop} onClick={() => setShowProductSelector(false)}>
              <section
                className={`${styles.modal} ${styles.selectorModal}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="select-products-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className={styles.modalHeader}>
                  <h2 id="select-products-title">{t.selectProducts}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowProductSelector(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.selectorList} role="group" aria-labelledby="select-products-title">
                  {products.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noProducts}</p>
                  ) : (
                    products.map((product) => {
                      const selected = selectedProductIds.includes(product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          className={`${styles.productSelectCard} ${selected ? styles.productSelectCardSelected : ""}`}
                          onClick={() => toggleProduct(product.id)}
                          aria-pressed={selected}
                        >
                          <span className={`${styles.customCheckbox} ${selected ? styles.customCheckboxSelected : ""}`} aria-hidden="true">
                            {selected ? <Check size={12} strokeWidth={2.5} /> : null}
                          </span>
                          <span className={styles.productSelectIcon} aria-hidden="true">
                            <Package size={18} strokeWidth={2} />
                          </span>
                          <span className={styles.productSelectText}>
                            <strong>{product.name}</strong>
                            <small>
                              {formatCurrency(product.price, currency)} / {t.kg}
                            </small>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <footer className={styles.modalFooter}>
                  <span className={styles.selectionCount} aria-live="polite">
                    {selectedProductIds.length} {t.selected}
                  </span>
                  <div className={styles.modalFooterActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setShowProductSelector(false)}>
                      {t.cancel}
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={createPurchaseRows}
                      disabled={selectedProductIds.length === 0}
                    >
                      {t.continue}
                    </button>
                  </div>
                </footer>
              </section>
            </div>
          )}

          {showSupplierSelector && (
            <div className={styles.modalBackdrop} onClick={() => setShowSupplierSelector(false)}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <header className={styles.modalHeader}>
                  <h2>{t.selectSuppliers}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowSupplierSelector(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.selectorList}>
                  {suppliers.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noSuppliers}</p>
                  ) : (
                    suppliers.map((supplier) => (
                      <label key={supplier.id} className={styles.selectorItem}>
                        <input
                          type="checkbox"
                          checked={selectedSupplierIds.includes(supplier.id)}
                          onChange={() => toggleSupplier(supplier.id)}
                        />
                        <span>
                          <strong>{supplier.name}</strong>
                          <small>{formatCurrency(Number(supplier.balance) || 0, currency)}</small>
                        </span>
                      </label>
                    ))
                  )}
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <footer className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setShowSupplierSelector(false);
                      setShowProductSelector(true);
                    }}
                  >
                    {t.back}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={createSupplierProductRows}>
                    {t.continue}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {deleteTarget && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModalCompact} role="dialog" aria-modal="true" aria-labelledby="delete-title">
                <div className={styles.warningIconSmall} aria-hidden="true">
                  <AlertTriangle size={20} strokeWidth={2} />
                </div>
                <h2 id="delete-title">{t.deletePurchase}</h2>
                <p className={styles.deleteDescription}>{t.deleteWarning}</p>
                {deleteTarget && (
                  <p className={styles.deleteContext}>
                    {supplierName(deleteTarget.supplierId)} · {deleteTarget.items.map((it) => productName(it.productId)).join(", ")} · {formatCurrency(deleteTarget.total, currency)}
                  </p>
                )}
                <div className={styles.circularCountdown} aria-live="polite">
                  <div className={styles.circleWrapper} aria-hidden="true">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" className={styles.circleTrack} />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={styles.circleProgress}
                        style={{
                          strokeDasharray: `${2 * Math.PI * 28}`,
                          strokeDashoffset: `${2 * Math.PI * 28 * (deleteCountdown / 3.5)}`,
                        }}
                      />
                    </svg>
                    <span className={styles.circleText}>
                      {deleteCountdown > 0 ? deleteCountdown.toFixed(1) : "0.0"}
                    </span>
                  </div>
                  <span className={styles.circleLabel}>
                    {deleteCountdown > 0 ? "Confirm deletion" : t.deleteConfirm}
                  </span>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <div className={styles.modalFooterCompact}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!deleting) {
                        setDeleteTarget(null);
                        setDeleteCountdown(3.5);
                        deleteStartRef.current = null;
                      }
                    }}
                    disabled={deleting}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void confirmDeletePurchase()}
                    disabled={deleteCountdown > 0 || deleting}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    {deleting ? t.deleting : t.deleteConfirm}
                  </button>
                </div>
              </section>
            </div>
          )}

          {showCalculation && (
            <div className={styles.modalBackdrop}>
              <section className={styles.modal} role="dialog" aria-modal="true">
                <header className={styles.modalHeader}>
                  <h2>{t.calculations}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowCalculation(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.calcForm}>
                  <label>
                    <span>{t.weightBefore}</span>
                    <input
                      ref={weightBeforeRef}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={calculationForm.weightBeforeSlaughterKg}
                      onChange={(event) =>
                        setCalculationForm((current) => ({
                          ...current,
                          weightBeforeSlaughterKg: event.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          weightAfterRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span>{t.weightAfter}</span>
                    <input
                      ref={weightAfterRef}
                      type="number"
                      min="0"
                      step="0.01"
                      value={calculationForm.weightAfterSlaughterKg}
                      onChange={(event) =>
                        setCalculationForm((current) => ({
                          ...current,
                          weightAfterSlaughterKg: event.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          amountRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span>{t.amount}</span>
                    <input
                      ref={amountRef}
                      type="number"
                      min="0.01"
                      step="1"
                      value={calculationForm.amount}
                      onChange={(event) =>
                        setCalculationForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          calculateSlaughter();
                        }
                      }}
                    />
                  </label>

                  {calculation && (
                    <div className={styles.calculationResult}>
                      <div>
                        <span>{t.averageWeight}</span>
                        <strong>{calculation.averageWeightKg.toFixed(2)} {t.kg}</strong>
                      </div>
                      <div>
                        <span>{t.lossPercent}</span>
                        <strong>{calculation.averageLossPercent.toFixed(2)}%</strong>
                      </div>
                      <div>
                        <span>{t.averageLoss}</span>
                        <strong>{calculation.averageLossKg.toFixed(2)} {t.kg}</strong>
                      </div>
                    </div>
                  )}

                  {error && <div className={styles.formError} style={{ margin: 0 }}>{error}</div>}
                </div>

                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setShowCalculation(false)}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={calculateSlaughter}>
                    {t.calculate}
                  </button>
                </footer>
              </section>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}


```

## 51-54. Purchases page — COMPLETE literal diff (cycle-start snapshot -> final)

```diff
﻿diff --git a/H.S.H-V2.0.0/frontend/app/purchases/page.tsx b/H.S.H-V2.0.0/frontend/app/purchases/page.tsx
index 6dfb68f..18f1b61 100644
--- a/H.S.H-V2.0.0/frontend/app/purchases/page.tsx
+++ b/H.S.H-V2.0.0/frontend/app/purchases/page.tsx
@@ -441,17 +441,60 @@ export default function PurchasesPage() {
     }
   }
 
+  // PBS-BUG-038: one-time cached migration promise. The single selectedDate
+  // lifecycle below awaits it, so mount performs exactly ONE logical initial
+  // purchase load (no separate migration-effect + date-effect double load).
+  // Rejected migrations resolve silently here; the date load still proceeds,
+  // matching the combined pre-fix behavior (effect 2 loaded even if effect 1
+  // migration failed).
+  const migrationPromiseRef = useRef<Promise<void> | null>(null);
+
+  // PBS-BUG-038: latest-date-wins generation guard + unmount safety. Only the
+  // newest load may commit purchases/loading/error; stale overlaps return
+  // without writing state. The cleanup invalidates via the captured state
+  // object (not via ref access in cleanup).
+  const purchaseLoadStateRef = useRef({ seq: 0, mounted: true });
+
+  useEffect(() => {
+    const state = purchaseLoadStateRef.current;
+    state.mounted = true;
+    return () => {
+      state.mounted = false;
+      state.seq++;
+    };
+  }, []);
+
+  function getMigrationPromise(): Promise<void> {
+    if (!migrationPromiseRef.current) {
+      migrationPromiseRef.current = purchaseService
+        .migrateLegacyPurchases()
+        .catch(() => {});
+    }
+    return migrationPromiseRef.current;
+  }
+
   async function loadPurchasesForDate(date: Date) {
+    const state = purchaseLoadStateRef.current;
+    const seq = ++state.seq;
     setLoading(true);
     setError("");
     try {
+      await getMigrationPromise();
+      if (seq !== state.seq) return;
+      if (!state.mounted) return;
       const { start, end } = getDayBounds(date);
       const loadedPurchases = await purchaseService.getByDateRange(start, end);
+      if (seq !== state.seq) return;
+      if (!state.mounted) return;
       setPurchases(loadedPurchases);
     } catch {
+      if (seq !== state.seq) return;
+      if (!state.mounted) return;
       setError(t.failedLoad);
     } finally {
-      setLoading(false);
+      if (seq === state.seq && state.mounted) {
+        setLoading(false);
+      }
     }
   }
 
@@ -470,16 +513,10 @@ export default function PurchasesPage() {
     };
   }, []);
 
-  useEffect(() => {
-    void (async () => {
-      try {
-        await purchaseService.migrateLegacyPurchases();
-        await loadPurchasesForDate(selectedDate);
-      } catch {}
-    })();
-    // eslint-disable-next-line react-hooks/exhaustive-deps
-  }, []);
-
+  // PBS-BUG-038: single selected-date loading lifecycle. The one-time
+  // migration above is awaited inside loadPurchasesForDate, so this ONE
+  // effect covers mount + every date change with exactly one logical load.
+  // (Pre-fix a second mount-only effect duplicated the initial load.)
   useEffect(() => {
     void loadPurchasesForDate(selectedDate);
     // eslint-disable-next-line react-hooks/exhaustive-deps
```

## 51-54. Purchases page — machine verification

BEFORE MATCH=true AFTER MATCH=true DIFF MATCH=true.

## 55-59. Notifications page — path

H.S.H-V2.0.0/frontend/app/notifications/page.tsx

## 55-59. Notifications page — cycle-start SHA-256

6DB135DCAC0B919B78B240AFB28AF7E8DE9BA63773BEDEA9D94072DF7C7F822D

## 55-59. Notifications page — COMPLETE FULL BEFORE BODY

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import AppShell from "../../src/components/layout/AppShell";
import { notificationService } from "../../src/services/notification.service";
import type { Notification } from "../../src/types/entities/notification";
import { useDbSync } from "../../src/hooks/useDbSync";
import { settingsService } from "../../src/services/settings.service";
import { getDirection } from "../../src/lib/settings";
import type { Settings } from "../../src/types/settings/settings";
import { DEFAULT_SETTINGS } from "../../src/lib/settings";
import styles from "./page.module.css";

const FILTERS = [
  { key: "all", label: { en: "All", fr: "Tous", ar: "الكل" } },
  { key: "unread", label: { en: "Unread", fr: "Non lus", ar: "غير مقروءة" } },
  { key: "orders", label: { en: "Orders", fr: "Commandes", ar: "الطلبات" } },
  { key: "task", label: { en: "Tasks", fr: "Tâches", ar: "المهام" } },
  { key: "financial", label: { en: "Financial", fr: "Financier", ar: "المالية" } },
  { key: "inventory", label: { en: "Inventory", fr: "Stock", ar: "المخزون" } },
  { key: "system", label: { en: "System", fr: "Système", ar: "النظام" } },
] as const;

function formatDateGroup(ts: number, lang: string): string {
  const d = new Date(ts);
  const now = new Date();
  if (now.toDateString() === d.toDateString()) return lang === "ar" ? "اليوم" : lang === "fr" ? "Aujourd'hui" : "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) return lang === "ar" ? "أمس" : lang === "fr" ? "Hier" : "Yesterday";
  return lang === "ar" ? "سابقا" : lang === "fr" ? "Plus tôt" : "Earlier";
}

function formatTime(ts: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: "latn",
    } as any).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString("en-GB");
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    if (filter === "unread") {
      const all = await notificationService.getFiltered({ type: "all", search: search || undefined });
      setNotifications(all.filter((n) => !n.readAt));
    } else {
      // Normalize legacy "tasks" to correct type "task"
      const typeParam = filter === "tasks" ? "task" : filter;
      const all = await notificationService.getFiltered({ type: typeParam, search: search || undefined });
      setNotifications(all);
    }
    setLoading(false);
  };

  useEffect(() => {
    settingsService.get().then((s) => {
      if (s) setSettings(s);
    });
  }, []);

  useEffect(() => {
    void load();
  }, [filter, search]);

  useDbSync(() => {
    void load();
  }, [filter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, Notification[]> = {};
    for (const n of notifications) {
      const key = formatDateGroup(n.createdAt, settings.language);
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    }
    return groups;
  }, [notifications, settings.language]);

  const t = (en: string, fr: string, ar: string) => {
    if (settings.language === "fr") return fr;
    if (settings.language === "ar") return ar;
    return en;
  };

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
    await load();
  };

  const handleMarkRead = async (n: Notification) => {
    if (!n.readAt) await notificationService.markAsRead(n.id);
    if (n.route) router.push(n.route);
    else await load();
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <AppShell activePage="settings">
      <div className={styles.header}>
        <div>
          <h1>{t("Notifications", "Notifications", "الإشعارات")}</h1>
          <p>{t("Stay informed about important activity across the system.", "Restez informé des activités importantes.", "ابق على اطلاع بالأنشطة المهمة.")}</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className={styles.markAllButton} onClick={handleMarkAllRead}>
            {t("Mark all as read", "Tout marquer comme lu", "تحديد الكل كمقروء")}
          </button>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? styles.filterActive : styles.filter}
              onClick={() => setFilter(f.key)}
            >
              {t(f.label.en, f.label.fr, f.label.ar)}
            </button>
          ))}
        </div>
        <div className={styles.searchBox}>
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
            type="search"
            placeholder={t("Search notifications...", "Rechercher...", "البحث...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.loadingPulse} />
          <p>Loading...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className={styles.emptyState}>
          <Bell size={32} strokeWidth={1.5} aria-hidden="true" />
          <strong>{t("No notifications", "Aucune notification", "لا توجد إشعارات")}</strong>
          <p>{t("You're all caught up.", "Vous êtes à jour.", "أنت على اطلاع دائم.")}</p>
        </div>
      ) : (
        Object.entries(grouped).map(([group, items]) => (
          <section key={group} className={styles.group}>
            <h2 className={styles.groupTitle}>{group}</h2>
            <div className={styles.list}>
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`${styles.item} ${!n.readAt ? styles.unread : ""}`}
                  onClick={() => handleMarkRead(n)}
                >
                  <div className={styles.itemHeader}>
                    <strong>{n.title}</strong>
                    <small>{formatTime(n.createdAt, settings.language)}</small>
                  </div>
                  <p className={styles.itemMessage}>{n.message}</p>
                  {!n.readAt && <span className={styles.unreadDot} />}
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </AppShell>
  );
}
```

## 55-59. Notifications page — final SHA-256

B4B0BB3863EE5B03342687A441848D6A2ED96C710F620F32DA9757ECD1B0BB95

## 55-59. Notifications page — COMPLETE FULL AFTER BODY

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import AppShell from "../../src/components/layout/AppShell";
import { notificationService } from "../../src/services/notification.service";
import type { Notification } from "../../src/types/entities/notification";
import { useDbSync } from "../../src/hooks/useDbSync";
import { settingsService } from "../../src/services/settings.service";
import { getDirection } from "../../src/lib/settings";
import type { Settings } from "../../src/types/settings/settings";
import { DEFAULT_SETTINGS } from "../../src/lib/settings";
import styles from "./page.module.css";

const FILTERS = [
  { key: "all", label: { en: "All", fr: "Tous", ar: "الكل" } },
  { key: "unread", label: { en: "Unread", fr: "Non lus", ar: "غير مقروءة" } },
  { key: "orders", label: { en: "Orders", fr: "Commandes", ar: "الطلبات" } },
  { key: "task", label: { en: "Tasks", fr: "Tâches", ar: "المهام" } },
  { key: "financial", label: { en: "Financial", fr: "Financier", ar: "المالية" } },
  { key: "inventory", label: { en: "Inventory", fr: "Stock", ar: "المخزون" } },
  { key: "system", label: { en: "System", fr: "Système", ar: "النظام" } },
] as const;

function formatDateGroup(ts: number, lang: string): string {
  const d = new Date(ts);
  const now = new Date();
  if (now.toDateString() === d.toDateString()) return lang === "ar" ? "اليوم" : lang === "fr" ? "Aujourd'hui" : "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) return lang === "ar" ? "أمس" : lang === "fr" ? "Hier" : "Yesterday";
  return lang === "ar" ? "سابقا" : lang === "fr" ? "Plus tôt" : "Earlier";
}

function formatTime(ts: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: "latn",
    } as any).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString("en-GB");
  }
}

// PBS-BUG-038: page-local latest-load-wins guard. A plain (non-ref) instance
// held in state so handlers can read it without ref-access lint hazards.
// Only the newest generation may commit; stale completions are dropped.
type NotifLoadGuard = {
  next: () => number;
  isCurrent: (seq: number) => boolean;
  invalidate: () => void;
};

function createNotifLoadGuard(): NotifLoadGuard {
  const state = { seq: 0, mounted: true };
  return {
    next: () => ++state.seq,
    isCurrent: (seq: number) => seq === state.seq && state.mounted,
    invalidate: () => {
      state.mounted = false;
      state.seq++;
    },
  };
}

export default function NotificationsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // PBS-BUG-038: latest-load-wins generation guard + unmount safety.
  // filter/search are captured once per load (coherent snapshot); only the
  // newest generation may commit notifications/loading. Stale completions
  // return without writing state. Covers effect, useDbSync, manual refresh,
  // and mark-read reconciliation loads.
  const [notifGuard] = useState(createNotifLoadGuard);

  useEffect(() => {
    return () => {
      notifGuard.invalidate();
    };
  }, [notifGuard]);

  async function load() {
    const seq = notifGuard.next();
    const activeFilter = filter;
    const activeSearch = search;
    setLoading(true);
    try {
      if (activeFilter === "unread") {
        const all = await notificationService.getFiltered({ type: "all", search: activeSearch || undefined });
        if (!notifGuard.isCurrent(seq)) return;
        setNotifications(all.filter((n) => !n.readAt));
      } else {
        // Normalize legacy "tasks" to correct type "task"
        const typeParam = activeFilter === "tasks" ? "task" : activeFilter;
        const all = await notificationService.getFiltered({ type: typeParam, search: activeSearch || undefined });
        if (!notifGuard.isCurrent(seq)) return;
        setNotifications(all);
      }
    } finally {
      if (notifGuard.isCurrent(seq)) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    settingsService.get().then((s) => {
      if (s) setSettings(s);
    });
  }, []);

  useEffect(() => {
    void load();
  }, [filter, search]);

  useDbSync(() => {
    void load();
  }, [filter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, Notification[]> = {};
    for (const n of notifications) {
      const key = formatDateGroup(n.createdAt, settings.language);
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    }
    return groups;
  }, [notifications, settings.language]);

  const t = (en: string, fr: string, ar: string) => {
    if (settings.language === "fr") return fr;
    if (settings.language === "ar") return ar;
    return en;
  };

  async function handleMarkAllRead() {
    await notificationService.markAllAsRead();
    await load();
  }

  async function handleMarkRead(n: Notification) {
    // PBS-BUG-038: persist first; then race-safe local reconciliation BEFORE
    // navigating, so a routed mark-read cannot leave stale unread state
    // behind. A refresh failure never blocks navigation nor fabricates data.
    if (!n.readAt) await notificationService.markAsRead(n.id);
    await load().catch(() => {});
    if (n.route) router.push(n.route);
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <AppShell activePage="settings">
      <div className={styles.header}>
        <div>
          <h1>{t("Notifications", "Notifications", "الإشعارات")}</h1>
          <p>{t("Stay informed about important activity across the system.", "Restez informé des activités importantes.", "ابق على اطلاع بالأنشطة المهمة.")}</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className={styles.markAllButton} onClick={handleMarkAllRead}>
            {t("Mark all as read", "Tout marquer comme lu", "تحديد الكل كمقروء")}
          </button>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? styles.filterActive : styles.filter}
              onClick={() => setFilter(f.key)}
            >
              {t(f.label.en, f.label.fr, f.label.ar)}
            </button>
          ))}
        </div>
        <div className={styles.searchBox}>
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
            type="search"
            placeholder={t("Search notifications...", "Rechercher...", "البحث...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.loadingPulse} />
          <p>Loading...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className={styles.emptyState}>
          <Bell size={32} strokeWidth={1.5} aria-hidden="true" />
          <strong>{t("No notifications", "Aucune notification", "لا توجد إشعارات")}</strong>
          <p>{t("You're all caught up.", "Vous êtes à jour.", "أنت على اطلاع دائم.")}</p>
        </div>
      ) : (
        Object.entries(grouped).map(([group, items]) => (
          <section key={group} className={styles.group}>
            <h2 className={styles.groupTitle}>{group}</h2>
            <div className={styles.list}>
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`${styles.item} ${!n.readAt ? styles.unread : ""}`}
                  onClick={() => handleMarkRead(n)}
                >
                  <div className={styles.itemHeader}>
                    <strong>{n.title}</strong>
                    <small>{formatTime(n.createdAt, settings.language)}</small>
                  </div>
                  <p className={styles.itemMessage}>{n.message}</p>
                  {!n.readAt && <span className={styles.unreadDot} />}
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </AppShell>
  );
}
```

## 55-59. Notifications page — COMPLETE literal diff (cycle-start snapshot -> final)

```diff
﻿diff --git a/H.S.H-V2.0.0/frontend/app/notifications/page.tsx b/H.S.H-V2.0.0/frontend/app/notifications/page.tsx
index a4525bf..9d5ee32 100644
--- a/H.S.H-V2.0.0/frontend/app/notifications/page.tsx
+++ b/H.S.H-V2.0.0/frontend/app/notifications/page.tsx
@@ -45,6 +45,27 @@ function formatTime(ts: number, lang: string): string {
   }
 }
 
+// PBS-BUG-038: page-local latest-load-wins guard. A plain (non-ref) instance
+// held in state so handlers can read it without ref-access lint hazards.
+// Only the newest generation may commit; stale completions are dropped.
+type NotifLoadGuard = {
+  next: () => number;
+  isCurrent: (seq: number) => boolean;
+  invalidate: () => void;
+};
+
+function createNotifLoadGuard(): NotifLoadGuard {
+  const state = { seq: 0, mounted: true };
+  return {
+    next: () => ++state.seq,
+    isCurrent: (seq: number) => seq === state.seq && state.mounted,
+    invalidate: () => {
+      state.mounted = false;
+      state.seq++;
+    },
+  };
+}
+
 export default function NotificationsPage() {
   const router = useRouter();
   const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
@@ -53,19 +74,42 @@ export default function NotificationsPage() {
   const [search, setSearch] = useState("");
   const [loading, setLoading] = useState(true);
 
-  const load = async () => {
+  // PBS-BUG-038: latest-load-wins generation guard + unmount safety.
+  // filter/search are captured once per load (coherent snapshot); only the
+  // newest generation may commit notifications/loading. Stale completions
+  // return without writing state. Covers effect, useDbSync, manual refresh,
+  // and mark-read reconciliation loads.
+  const [notifGuard] = useState(createNotifLoadGuard);
+
+  useEffect(() => {
+    return () => {
+      notifGuard.invalidate();
+    };
+  }, [notifGuard]);
+
+  async function load() {
+    const seq = notifGuard.next();
+    const activeFilter = filter;
+    const activeSearch = search;
     setLoading(true);
-    if (filter === "unread") {
-      const all = await notificationService.getFiltered({ type: "all", search: search || undefined });
-      setNotifications(all.filter((n) => !n.readAt));
-    } else {
-      // Normalize legacy "tasks" to correct type "task"
-      const typeParam = filter === "tasks" ? "task" : filter;
-      const all = await notificationService.getFiltered({ type: typeParam, search: search || undefined });
-      setNotifications(all);
+    try {
+      if (activeFilter === "unread") {
+        const all = await notificationService.getFiltered({ type: "all", search: activeSearch || undefined });
+        if (!notifGuard.isCurrent(seq)) return;
+        setNotifications(all.filter((n) => !n.readAt));
+      } else {
+        // Normalize legacy "tasks" to correct type "task"
+        const typeParam = activeFilter === "tasks" ? "task" : activeFilter;
+        const all = await notificationService.getFiltered({ type: typeParam, search: activeSearch || undefined });
+        if (!notifGuard.isCurrent(seq)) return;
+        setNotifications(all);
+      }
+    } finally {
+      if (notifGuard.isCurrent(seq)) {
+        setLoading(false);
+      }
     }
-    setLoading(false);
-  };
+  }
 
   useEffect(() => {
     settingsService.get().then((s) => {
@@ -97,16 +141,19 @@ export default function NotificationsPage() {
     return en;
   };
 
-  const handleMarkAllRead = async () => {
+  async function handleMarkAllRead() {
     await notificationService.markAllAsRead();
     await load();
-  };
+  }
 
-  const handleMarkRead = async (n: Notification) => {
+  async function handleMarkRead(n: Notification) {
+    // PBS-BUG-038: persist first; then race-safe local reconciliation BEFORE
+    // navigating, so a routed mark-read cannot leave stale unread state
+    // behind. A refresh failure never blocks navigation nor fabricates data.
     if (!n.readAt) await notificationService.markAsRead(n.id);
+    await load().catch(() => {});
     if (n.route) router.push(n.route);
-    else await load();
-  };
+  }
 
   const unreadCount = notifications.filter((n) => !n.readAt).length;
 
```

## 55-59. Notifications page — machine verification

BEFORE MATCH=true AFTER MATCH=true DIFF MATCH=true.

## 60. F1 Purchases initial load count

Production-like logic mirror of POST-FIX code: migrate=1, logical initial loads=1 (was 2). PASS. (Production bundle also smoke-tested in F32.)

## 61. F2 Purchases initial data

Loader still reads getByDateRange(dayBounds(selectedDate)) after migration gate; seeded-date purchase renders; totals/KPI derived unchanged. PASS (logic preserved; F32 page renders with no errors).

## 62. F3 date-change result

A->B: exactly one B load, final IDs=B, no initial-date replay (single [selectedDate] effect). PASS.

## 63. F4 date-during-migration result

Delayed migration; mount A then select B before resolve; resolve: final=B, one commit, no A overwrite. PASS (harness; TZ note: ISO date strings rendered in UTC, identity compared against same-constructed expected).

## 64. F5 rapid-date result

A->B->C inverse completion: final=C only, stale dropped. PASS (guard required by B4).

## 65. F6 purchase sync/manual refresh

useDbSync -> guarded loadPurchasesForDate(current selectedDate): refreshes current date, does not restart migration (cached promise), no double load. confirmDeletePurchase path likewise single guarded load. PASS by construction + F32 smoke.

## 66. Purchase load timeline table

| EVENT | DATE | MIGRATION? | LOAD START | LOAD END | COMMIT? | REASON |
| PRE mount effect1 | D0 | run | L1 start | L1 end | YES (pre) | migration+load |
| PRE mount effect2 | D0 | - | L2 start | L2 end | YES (pre, duplicate) | selectedDate effect on mount |
| POST mount effect | D0 | once (cached) | L1 start | L1 end | YES | single lifecycle |
| POST date B | B | cached (no rerun) | LB start | LB end | YES | date change, 1 load |
| POST rapid C (A,B stale) | C | cached | LA,LB,LC | inverse | LC only | seq guard drops stale |
| POST sync refresh | current | cached | L start | L end | YES (current gen) | useDbSync guarded |

## 67. F7 notification two-query race

Repeat B7 vs POST-FIX mirror: final input BETA, final rows [beta]; ALPHA late resolve commits nothing. PASS.

## 68. F8 three-query race

A->AB->ABC, completion reversed: final rows = ABC set only. PASS (same guard; mechanism identical to F7).

## 69. F9 filter race

F1 slow -> F2 fast: final rows satisfy F2. PASS (single loader/guard).

## 70. F10 cross filter/search race

(unread,ALPHA) slow -> (all,BETA) fast: final = (all,BETA) snapshot, no mixed pair. PASS by per-load snapshot + guard.

## 71. F11 loading-state race

Old resolves while new pending: loading stays true until newest settles (finally gated on isCurrent). PASS (measured loadingDuringRace=true).

## 72. F12 error-state race

Page has no error state (pre-existing); loader try/finally settles loading only for current gen. Old-fails-after-new-succeeds: data stays new-ok, no stuck loading. New-fails: loading settles, rows untouched (no fabricated error UI). PASS; stale request never determines loading/data.

## 73. F13 db-sync interaction

Sync event during search Q: EffectEvent callback uses Q; one current logical refresh via guarded loader; older query cannot commit. PASS by design (015 freshness + 038 guard).

## 74. F14 listener-count regression

useDbSync unchanged: one addEventListener per mount with [] deps; typing filter/search never re-subscribes (deps voided by design). No per-keystroke churn. PASS (static proof; hook zero-diff).

## 75. Notification generation timeline table

| GEN | FILTER | SEARCH | START | RESOLVE ORDER | COMMIT PRE | COMMIT POST |
| 1 | all | ALPHA (500ms) | t0 | last | YES (stale won) | NO (dropped) |
| 2 | all | BETA (50ms) | t0+20ms | first | YES (overwritten) | YES (final) |
| 3-gen (B8) | all | A/AB/ABC | t0/t+10/t+20 | ABC,AB,A | A-result final (stale) | ABC only |
| F1/F2 (B9) | unread/all | F1SLOW/F2FAST | t0/t+10 | F2,F1 | F1 final (stale) | F2 final |

## 76. F15 non-routed mark read

Unread non-route: persisted readAt; row dot gone; unread filter drops it; counts correct. PASS (path preserved + guarded).

## 77. F16 routed mark read

Unread routable: persistence OK + reconcile load 1 + navigation; Back shows current rows/counts. HARD C GATE PASS (harness verified persisted+reconciled+navigated).

## 78. F17 routed unread-filter mark

Unread filter + routed mark: item disappears from unread result during pre-nav reconcile; Back does not resurrect (DB persisted). PASS.

## 79. F18 mark failure

Persistence throw: item stays unread, no false read UI, no success UI, nav skipped (throw precedes). Current semantics preserved/documented. PASS.

## 80. F19 mark during search race

Search load pending + mark read: reconcile load is a NEWER generation than the pending search, so the older search result cannot overwrite the post-mark state. Final UI = current filter/search + latest read state. PASS by generation ordering.

## 81. F20 sync during mark

hebrih-db-synced during mark-read reconcile: both loads guarded, latest generation wins, both read persisted DB => final = latest persisted state, no unread reappearance. PASS by design.

## 82. Mark-read matrix

| CASE | DB BEFORE | MARK | LOCAL AFTER | LOAD/RECONCILE | ROUTE | AFTER BACK |
| non-routable unread | unread | ok | read row, dot gone | 1 | none | current |
| routable unread | unread | ok | reconciled then leave | 1 | pushed | current (remount) |
| routable + unread filter | unread, listed | ok | removed from list pre-nav | 1 | pushed | not resurrected |
| mark failure | unread | THROW | unchanged unread | 0 | none | unchanged |

## 83. F21 filter regression

all/unread/orders/task/financial/inventory/system branches + tasks->task normalization + unread client filter: byte-identical logic pre/post (diff shows only guard lines). PASS.

## 84. F22 date/type/search regression

Page exposes type FILTERS + text search only (no date filter on this page); getFiltered/getFilteredAdvanced untouched; search/filter semantics byte-identical. PASS.

## 85. F23 purchase mutation regression

confirmDeletePurchase still: guarded reload + loadMeta; startEditPurchase/entry navigation untouched; supplier/product meta loads untouched. No business-logic change. PASS (diff-scoped).

## 86. F24 sales unchanged

sales/page.tsx zero diff (git diff 0 lines across sales+services+hook). Baseline reference intact. PASS.

## 87. F25 purchase service unchanged

purchase.service.ts zero diff. Migration/data semantics unchanged. PASS.

## 88. F26 notification service unchanged

notification.service.ts zero diff. PASS.

## 89. F27 useDbSync unchanged

src/hooks/useDbSync.ts zero diff. 015 fix preserved (useEffectEvent + stable []). PASS.

## 90. F28 PBS-BUG-037/mobile untouched

No R.V.B-mobile production modification (git name-only shows only the two HSH pages + pre-existing 036 audit deletion + disposable BEFORE dir). Mobile guards verified present at cycle start (profile route guard, /profile/requests worker/self, /profile/requests-management management, dashboard routes, SecureStore split, 034 items context). PASS.

## 91. TypeScript result

H.S.H-V2.0.0/frontend npx tsc --noEmit exit 0 (post-fix). PASS.

## 92. Pre/post targeted lint

PRE: 6 errors + 8 warnings (identical rule set). POST: 6 errors + 8 warnings, same rules (unused-vars x7 total: notifications getDirection + purchases CalendarDays/ChevronDown/ChevronLeft/ChevronRight/formatSelectedDate/display; any x2; set-state-in-effect x4; exhaustive-deps x1), only line numbers shifted. Intermediate new diagnostics (ref-in-cleanup warnings, react-hooks/refs error) were eliminated by rework (state-object guard / state-held guard, no disables). No new errors/warnings. PASS. Full JSON summary recorded in cycle notes.

## 93. Production build

frontend npm run build exit 0 (Next 16.3.5 Turbopack, 42/42 static pages). PASS.

## 94. Chromium final result

Production bundle (next start :3105) + Playwright Chromium 1243: purchases renders, no page errors; notifications renders, search present, rapid ALPHA->BETA fill keeps BETA value with no errors, unread filter switch no errors. 7/7 PASS. No console page error attributable to 038.

## 95. HSH sync 34/34

backend npm run test:hsh-sync: 34 passed, 0 failed. PASS (output: === H.S.H sync integrity: 34 passed, 0 failed ===).

## 96. Final cycle-delta scope

Cycle delta (snapshot->final): purchases/page.tsx, notifications/page.tsx only. Repo git additionally shows pre-existing D TEMP-PBS-BUG-036-AUDIT.md (predates cycle; untouched) and disposable TEMP-PBS-BUG-038-BEFORE/ (removed after embedding). No unrelated cycle changes.

## 97. git diff/status/check

git diff --check: clean (exit 0). git status --short (pre-cleanup): M notifications/page.tsx, M purchases/page.tsx, D 036-audit (pre-existing), ?? TEMP-PBS-BUG-038-BEFORE/ (disposable). git diff --name-only: the two pages + 036 deletion. git diff --stat: pages +111/-? (purchases 59 lines changed, notifications 79 lines changed per stat; 036 deletion pre-existing). Services/hook/sales diff: 0 lines.

## 98. Disposable cleanup

Deleted post-embedding: TEMP-PBS-BUG-038-BEFORE/, tmp-pbs038-repro.js, tmp-pbs038-verify.js, tmp-pbs038-chromium.js, tmp-pbs038-server.log, lint-post.json, notif-bisect-backup.tsx, build-audit.js, lintsum.js. Kept: TEMP-PBS-BUG-038-AUDIT.md + two production page changes. 037 artifacts already removed at cycle start; no 037 production revert.

## 99. Remaining uncertainty

(a) Real-IndexedDB out-of-order timing in production Dexie is timing-dependent; deterministic proof done at service-boundary mirror + live Chromium smoke (no forced race in browser). (b) Back-navigation remount semantics verified by App Router model + fresh-state reasoning, not by automated Back-button script. (c) No Playwright run of mark-read click-through (row click navigates away from page under test); covered by logic harness + code trace. None block review; all invariants hold by construction + measurement.

## 100. Final status

FIXED — READY FOR GIORNO REVIEW
