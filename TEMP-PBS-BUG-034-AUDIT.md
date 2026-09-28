# TEMP-PBS-BUG-034-AUDIT (PBS-BUG-034 — mobile directory reads wrong response keys)

Cycle scope: PBS-BUG-034 ONLY. `R.V.B-mobile` is tracked in the superproject
index as a **gitlink without a `.gitmodules` mapping and without a nested
`.git`**, so superproject git commands cannot diff its worktree
(`git diff`/`git show HEAD:<mobile-path>` fail with "in submodule").
BEFORE is therefore the complete cycle-start worktree read (pre-edit),
AFTER is the current worktree file, and the DIFF is the literal unified hunk
(no `diff --git`/`index` lines exist for this path). Machine verification in
sec 32 proves all three blocks byte-exact under this method. Previous cycle
(PBS-BUG-032) is CLOSED; its endpoint fix is preserved and untouched.

## 1. Bug definition

Mobile `searchDirectory()` read `users`/`directory`/`results` from the
directory response, but the current backend returns the canonical array under
`items`. The real result was ignored and the service returned `[]`, emptying
the Search screen list and the secondary-chats group-member picker.

## 2. Current mobile directory-service source

`R.V.B-mobile/src/services/directory.service.ts` (13 lines, full bodies in
sec 29-30). Pre-fix extraction:
`(res).users || (res).directory || (res).results || []` — no `items`.
Post-fix: `(res).items || (res).users || (res).directory || (res).results || []`
with `items?` added to the response type. Nothing else in the file changed.

## 3. Current API-client return contract

`R.V.B-mobile/src/api/client.ts`: `rvbRequest<T>()` parses the body and
returns the **complete parsed backend JSON** (`return json as T` on success;
`RvbApiError` on failure). Proven at runtime, not just types: B5
`keys=success,items,total,page,limit,totalPages`. Answer: **A. whole parsed
body**. No unwrapping — the historical premise holds; the service (not the
client) was the defect.

## 4. Backend directory route contract

`H.S.H-V2.0.0/backend/src/routes/rvb-directory.ts` (37 lines, complete read):
router-wide `requireRvbAuth`; `GET /` parses `q = query.q || query.search`,
`role` (allow-listed, default `all`), `page`/`limit` (defaults 1/24);
`res.json({ success: true, ...result })` — spreads the service result WITHOUT
renaming, so `items` survives verbatim. `GET /:id` returns
`{success, account}` ( untouched).

## 5. Backend directory-service response shape

`H.S.H-V2.0.0/backend/src/services/rvb-directory.service.ts` (complete read):
`status:"active"` filter; role filter (`all|worker|supervisor|supplier|
customer|management→[manager,admin,supervisor]`); `q` matches displayName/tag
(case-insensitive; `@`-prefix tolerated) plus role-label regex; pagination
(page clamp 1-100, limit clamp 1-30, default 24); `displayName` ascending sort;
safe DTO `{id,displayName,tag,role,status,profilePicture,linkedEntityType,
linkedEntityId,createdAt,updatedAt}` (no business/accounting data). Returns
exactly `{items, total, page, limit, totalPages}`.

## 6. Query-parameter compatibility

Mobile sends `search=`; backend accepts `q` OR `search` (route line 12).
Runtime parity: B3 `q=…` and `search=…` return identical ID order
(`equal=true`). Query construction is NOT defective — unchanged per rule 14.

## 7. Current mobile response type

Pre-fix: `{ success: boolean; users: any[]; directory?: any[]; results?: any[] }`
(`users` required, `items` absent). Post-fix: adds `items?: any[]` first;
legacy keys retained as optional. No new project type was available for this
untyped (`any[]`) service; introducing one would exceed the narrow fix.

## 8. Current extraction/fallback logic

Pre-fix: `users || directory || results || []`. Post-fix: canonical `items`
first, then the three legacy fallbacks, then `[]`. Fallbacks retained per
rule 16 (harmless, proven non-shadowing by F3 precedence test).

## 9. Complete live-caller inventory

Whole-`R.V.B-mobile` grep for `searchDirectory(|directoryService|
directory.service` → 3 files only:
1. `src/services/directory.service.ts:3` — definition.
2. `app/(app)/search/index.tsx:11` import, `:37` call:
   `searchDirectory({search: query.trim()||undefined, role, limit:20, page})`
   → directory list + DM creation entry.
3. `app/(app)/secondary-chats/index.tsx:14` import, `:56` call
   (`openNew`: `{page:1, limit:50}`) and `:67` call (`loadMoreDirectory`:
   `{page:next, limit:50}`) → group-member picker + DM creation.

## 10. Search-screen data flow

`search/index.tsx`: debounced query/role chips → `search()` →
`searchDirectory({search, role, limit:20, page})` → `Array.isArray` guard →
`setResults` (reset or append) → `FlatList` (tag/name/role/avatar + DM button;
`ListEmptyComponent` "No results"). `hasMore = arr.length >= 20`. No second
bug: with `items` fixed the array flows straight to state (F-result len=5).
UI code untouched.

## 11. Secondary-chat member-picker data flow

`secondary-chats/index.tsx`: `openNew()` → `searchDirectory({page:1,limit:50})`
→ `Array.isArray(res) ? res : res?.data || []` → `setDirectory` (picker modal
list) → toggle-select → `createGroup({name, memberIds})`. Pre-fix `[]` meant
an empty member list with nobody selectable (group creation blocked at
"Select at least one member"). Post-fix len=5 selectable. Chat creation code
untouched (rule 7 boundary respected).

## 12. Web reference behavior

`H.S.H-V2.0.0/frontend/src/services/rvb-directory.service.ts`: typed
`DirectoryListResponse = {success, items: DirectoryItem[], total, page, limit,
totalPages}`; `list()` returns the full body (reads `items` correctly).
REFERENCE ONLY — byte-untouched (not in any diff).

## 13. Historical acceptance-report contradiction

Prior mobile reports claimed Directory PASS while shipped source read only
`users`/`directory`/`results` — impossible against the current backend, which
returns results exclusively under `items` (B2/B5 runtime proof). Runtime/source
truth overrides those older statements. No historical reports were edited.

## 14. Runtime environment

Real backend (express + REAL `rvb-auth`/`rvb-directory` routers, models, JWT)
on `MongoMemoryReplSet`; REAL mobile `api/client.ts` + `services/
directory.service.ts` imported from source via `@/` tsconfig paths with
disposable RN stubs (`react-native`→`{Platform:{OS}}`,
`expo-secure-store`→in-memory map); real Bearer tokens via
`setAccessTokenMemory` (no refresh path exercised). No device/emulator run
(disclosed in sec 58); no mocks for the shape mismatch. Disposable harness +
stubs + tsconfig removed afterward.

## 15. Fixture definition

Active: `pbs034.worker.alpha` (worker), `pbs034.supplier.alpha` (supplier),
`pbs034.customer.alpha` (customer), `pbs034.manager.alpha` (manager),
`pbs034.admin.alpha` (admin). Excluded-by-contract: `pbs034.archived.alpha`
(archived), `pbs034.disabled.alpha` (disabled). All password `Passw0rd!x`.

## 16. Raw backend nonempty response

`[pbs034] B2-raw status=200 success=true n=5 total=5 page=1 limit=24 totalPages=1 ids=pbs034.admin.alpha,pbs034.customer.alpha,pbs034.manager.alpha,pbs034.supplier.alpha,pbs034.worker.alpha`
`items.length > 0` proven; archived/disabled correctly absent (source
`status:"active"` filter, not invented).

## 17. q/search query parity

`[pbs034] B3-parity q=… search=… equal=true` — identical ID sets and order.
Query construction exonerated.

## 18. Raw api.get result

`[pbs034] B5-raw keys=success,items,total,page,limit,totalPages itemsLen=5`
Full-body contract proven at runtime.

## 19. Current searchDirectory baseline

`[pbs0304→pbs034] B4-service len=0 rawItemsLen=5` (pre-fix):
`[pbs034] B4-service len=0 rawItemsLen=5`. Decisive: backend non-empty,
service empty. (Pre-fix run; post-fix run in sec 34.)

## 20. Search-screen caller baseline

`[pbs034] B6-screen len=0` pre-fix with exact screen params
`{search, role: undefined, limit:20, page:1}`.

## 21. Member-picker baseline

`[pbs034] B7-picker len=0 rawTotal=5` pre-fix with exact picker params
`{page:1, limit:50}`.

## 22. Role-filter baseline

Backend: worker→only worker tag; supplier→only supplier; customer→only
customer; management→admin+manager (server-side `$in` expansion intact).
Service pre-fix: `B8-svc-worker len=0 tags=` (shape bug masks filtering).

## 23. Pagination baseline

`[pbs034] B9-raw n=2 total=5 totalPages=3 svcLen=0 svcIsArray=true`:
backend metadata valid; service returns array-only by caller contract
(unchanged post-fix: `svcLen=2`, no metadata entries).

## 24. Genuine-empty baseline

`[pbs034] B10-empty raw=[] svcLen=0` — unknown query → `[]` on both layers.
Legitimate empty, distinct from dropped non-empty results.

## 25. Decision-gate result

CASE 1 — expected bug: raw `items` non-empty (sec 16), `api.get` exposes them
(sec 18), service ignored `items` (sec 19), callers got `[]` (sec 20-21).
Narrow response-shape fix proceeds. (Not CASE 2/3/4.)

## 26. Exact root cause

`searchDirectory()` extracted `users || directory || results || []` while the
current backend's canonical array key is `items`; `undefined || … || []`
collapsed every real result to `[]`.

## 27. Fix architecture

Two-line response-type + one-line extraction change in
`R.V.B-mobile/src/services/directory.service.ts`: recognize canonical `items`
first, retain legacy fallbacks. No backend/client/UI/chat/pagination/typing
changes; query construction and error propagation untouched.

## 28. Permanent files changed

ONLY: `R.V.B-mobile/src/services/directory.service.ts` (3 lines within one
13-line file).

## 29. COMPLETE FULL BEFORE

A. Path: `R.V.B-mobile/src/services/directory.service.ts`
B. Full before body (cycle-start worktree read, pre-edit; gitlink path has no
   superproject blob — see sec 32 method):

<!-- BLOCK:BEFORE -->
```ts
import { api } from "@/api/client";

export async function searchDirectory(params?: { search?: string; role?: string; page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.role) q.set("role", params.role);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await api.get<{ success: boolean; users: any[]; directory?: any[]; results?: any[] }>(`/api/rvb/directory${qs}`);
  // Backend may return users/directory/results depending on version
  return (res as any).users || (res as any).directory || (res as any).results || [];
}
```

## 30. COMPLETE FULL AFTER

C. Full after body (current worktree file; SHA256
   `261FC12A0048FAA130C42E2FCD1606B53969B88078875313D936FF7B17156D62`):

<!-- BLOCK:AFTER -->
```ts
import { api } from "@/api/client";

export async function searchDirectory(params?: { search?: string; role?: string; page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.role) q.set("role", params.role);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await api.get<{ success: boolean; items?: any[]; users?: any[]; directory?: any[]; results?: any[] }>(`/api/rvb/directory${qs}`);
  // Backend canonical shape returns `items`; keep legacy fallbacks behind it
  return (res as any).items || (res as any).users || (res as any).directory || (res as any).results || [];
}
```

## 31. COMPLETE literal diff

D. Literal unified diff (no git repo exists for this gitlink path, so no
   `diff --git`/`index` lines; standard hunk over the 13-line file):

<!-- BLOCK:DIFF -->
```diff
--- a/R.V.B-mobile/src/services/directory.service.ts
+++ b/R.V.B-mobile/src/services/directory.service.ts
@@ -7,7 +7,7 @@
   if (params?.page) q.set("page", String(params.page));
   if (params?.limit) q.set("limit", String(params.limit));
   const qs = q.toString() ? `?${q.toString()}` : "";
-  const res = await api.get<{ success: boolean; users: any[]; directory?: any[]; results?: any[] }>(`/api/rvb/directory${qs}`);
-  // Backend may return users/directory/results depending on version
-  return (res as any).users || (res as any).directory || (res as any).results || [];
+  const res = await api.get<{ success: boolean; items?: any[]; users?: any[]; directory?: any[]; results?: any[] }>(`/api/rvb/directory${qs}`);
+  // Backend canonical shape returns `items`; keep legacy fallbacks behind it
+  return (res as any).items || (res as any).users || (res as any).directory || (res as any).results || [];
 }
```

## 32. Machine byte-verification

Method (gitlink path — no git objects; LF-normalized):
1. AFTER block == worktree file bytes.
2. BEFORE block with the 3 documented line substitutions == AFTER block
   (proves BEFORE is the exact pre-edit source: the cycle applied exactly one
   `edit` whose old/new strings are those lines).
3. DIFF block == hunk recomputed from BEFORE/AFTER line arrays (context +
   `-`/`+` lines + `@@ -7,7 +7,7 @@` header).
Script (`node`) and result (executed after writing this file):

```text
AFTER MATCH
BEFORE-EDIT MATCH
DIFF MATCH
```

Worktree SHA256 (`Get-FileHash`):
`261FC12A0048FAA130C42E2FCD1606B53969B88078875313D936FF7B17156D62`.

## 33. Verification commands

- `npx tsx --tsconfig tmp-pbs034-tsconfig.json tmp-pbs034-harness.ts`
  pre-fix (sec 16-24) and post-fix (sec 34-44). Harness + stubs + tsconfig
  deleted after collection.
- `npx tsc --noEmit` (R.V.B-mobile) — exit 0.
- Mobile lint: no `lint` script and no ESLint dependency in
  `R.V.B-mobile/package.json` — targeted ESLint unavailable without
  installing; skipped per F19 (no baseline exists to compare).
- `npx expo-doctor` — 21/21 checks passed, exit 0.
- `npx expo export --platform web --clear` — success (`dist/`), exit 0;
  generated `dist/` removed afterward.
- `npm run test:hsh-sync` (backend) — 34 passed, 0 failed.
- No existing backend directory tests (only filesystem `isDirectory`
  mentions) — none run, none invented (F22).
- `git diff HEAD --check` (superproject) — exit 0.

## 34. Post-fix nonempty service result

`[pbs034] B4-service len=5 rawItemsLen=5` (post-fix run): returned IDs exactly
match backend `items` IDs in order
(admin,customer,manager,supplier,worker displayName-sorted).

## 35. Returned-field proof

B2-item0 DTO: `{id,displayName,tag,role,status,profilePicture,
linkedEntityType,linkedEntityId,createdAt,updatedAt}` — current backend
projection only; service adds/removes nothing (`return d.events…` n/a —
returns extraction array as-is).

## 36. Canonical items precedence

`[pbs034] F3-precedence got=["A"]` — synthetic
`{items:[A],users:[B],directory:[C],results:[D]}` through the REAL production
`searchDirectory` (fetch-level stub, no production change) selects `items`.

## 37. Legacy-fallback proof

`[pbs034] F4-fallback got=["B"]` — `{users:[B]}` without `items` still
returns the legacy array through the real service. Fallbacks retained and
functional.

## 38. Search-screen result

`[pbs034] B6-screen len=5` post-fix with exact screen params — directly
suitable for its `FlatList` (`id/tag/displayName/role/profilePicture`
present). Visual render not separately exercised (sec 58).

## 39. Member-picker result

`[pbs034] B7-picker len=5` post-fix with exact `{page:1,limit:50}` picker
params — selectable accounts restored. Modal/group-creation UI untouched.

## 40. Role-filter result

`[pbs034] B8-svc-worker len=1 tags=pbs034.worker.alpha` — service-level
`role=worker` returns only the worker; backend role matrix (sec 22) unchanged,
including `management`→`[manager,admin]` expansion. Fix does not bypass
filtering (extraction only).

## 41. Query result

B3 parity re-verified post-fix run (`equal=true`); exact tag/name search works
(B4 len=5 on `pbs034`).

## 42. Pagination result

`[pbs034] B9-raw n=2 total=5 totalPages=3 svcLen=2 svcIsArray=true` post-fix:
current page's `items` only, array-typed, no metadata entries. Caller
`hasMore`/`loadMore` contract preserved.

## 43. Genuine-empty result

`[pbs034] B10-empty raw=[] svcLen=0` post-fix — unknown query still `[]` on
both layers.

## 44. Error-propagation result

`[pbs034] F11-throws status=401 code=RVB_TOKEN_INVALID name=RvbApiError`
(corrupt token, no refresh available): transport errors still THROW through
`searchDirectory` — not converted to `[]`. Behavior unchanged from pre-fix.

## 45. API-client unchanged proof

`R.V.B-mobile/src/api/client.ts` untouched (only `directory.service.ts`
edited this cycle; sec 56 scope). F12 expected-untouched satisfied.

## 46. Backend unchanged proof

Zero backend production diffs (only disposable harness files existed, since
removed; `git status` shows no backend modifications). F13 satisfied.

## 47. Web directory unchanged proof

`H.S.H-V2.0.0/frontend/src/services/rvb-directory.service.ts` untouched (no
diff; sec 12 reference only). F14 satisfied.

## 48. PBS-BUG-035/036/037 boundaries

No socket files (035), no secure-store files (036), no navigation/layout
role-guard files (037) modified — sole edited file is
`src/services/directory.service.ts`. Secure-store/RN modules were only
stubbed inside the deleted disposable harness, never edited.

## 49. Mobile TypeScript result

`npx tsc --noEmit` in `R.V.B-mobile`: `TSC_LASTEXIT=0`.

## 50. Lint result

No lint script or ESLint dependency in mobile `package.json`; targeted ESLint
not runnable without new installs (forbidden by F20 rule). Skipped with this
justification; the change is a 3-line expression edit introducing no new
identifiers, imports, or control flow.

## 51. Expo Doctor result

`npx expo-doctor`: `21/21 checks passed. No issues detected!`, exit 0
(`EXPO_PUBLIC_RVB_API_URL` loaded from env during run).

## 52. Expo web-export result

`npx expo export --platform web --clear`: success
(`entry-*.js` 2MB, `index.html`, `favicon.ico`, `metadata.json`), exit 0.
Generated `R.V.B-mobile/dist/` removed afterward (generated output, invisible
to superproject git as it sits under the gitlink path).

## 53. Relevant backend-test result

No existing RVB-directory tests (only unrelated filesystem `isDirectory`
mentions in `test-rvb-boundary.ts:47`, `test-final-web-pass.ts:144`). None
run; none invented.

## 54. HSH sync-suite result

`npm run test:hsh-sync` in `H.S.H-V2.0.0/backend`:
`=== H.S.H sync integrity: 34 passed, 0 failed ===`.

## 55. PBS-BUG-032 preservation

`rvbPortalService.getWorkerFinancial()` still targets
`/worker/financial-events` (service line 19, re-grepped post-cycle). No
frontend file modified in this cycle.

## 56. git diff/status/check proof

Superproject (`R.V.B-mobile` is a gitlink — mobile worktree changes are
invisible to superproject git by construction):
```text
M (none in tracked tree besides below)
D TEMP-PBS-BUG-032-AUDIT.md
?? TEMP-PBS-BUG-034-AUDIT.md
```
`git status --short` shows ONLY the required 032-audit deletion (plus this
untracked audit). `git diff HEAD --check`: exit 0. Production change
(`R.V.B-mobile/src/services/directory.service.ts`) verified instead by sec 32
hashes: worktree SHA256
`261FC12A0048FAA130C42E2FCD1606B53969B88078875313D936FF7B17156D62`.
No backend/web/mobile-client/socket/store/nav file modified.

## 57. Disposable-artifact cleanup

Deleted: `TEMP-PBS-BUG-032-AUDIT.md`,
`H.S.H-V2.0.0/backend/tmp-pbs034-harness.ts`,
`H.S.H-V2.0.0/backend/tmp-pbs034-tsconfig.json`,
`H.S.H-V2.0.0/backend/tmp-pbs034-stubs/` (2 stubs),
`R.V.B-mobile/dist/` (expo export output). Kept: this audit + the 3-line
production fix. No `tmp-pbs032*` leftovers existed.

## 58. Remaining uncertainty

1. No device/emulator visual run: Search-screen rows and member-picker
   selection were proven at the exact service-call layer (params identical to
   both call sites); FlatList rendering itself was not visually exercised.
2. BEFORE has no git blob (gitlink path) — provenance is the cycle-start
   pre-edit read plus the sec-32 edit-closure proof; stated explicitly rather
   than emulated with fake `index` lines.
3. `RVB-MOBILE-CONTRACT.md:91` remains stale (sec 11) — flagged, not edited
   per cycle preference.
4. Archived/disabled exclusion relies on backend `status:"active"` filter
   (verified at runtime: 5/7 fixtures returned); no invented semantics.

## 59. Final status

FIXED — READY FOR GIORNO REVIEW
