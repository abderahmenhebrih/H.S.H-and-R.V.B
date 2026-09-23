# H.S.H OpenCode Final Fix Tool

This package does **not** contain a modified H.S.H project.

It is a focused instruction-and-verification pack for OpenCode to fix the remaining confirmed release blockers in:

`C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\H.S.H-V2.0.0`

## Remaining confirmed blocker

The Pass 7 adversarial retest reproduced one critical bug:

- a sync operation can be persisted as `in_flight`
- the browser/process can crash before the response is handled
- after restart, `getPendingSyncOperations()` excludes it
- no startup/locked-cycle recovery currently re-queues it
- the user edit can remain stuck forever

There is also a smaller test-runner issue:

- `frontend/package.json` contains `test:hsh-client`
- the frontend package does not have `tsx` available locally
- `npx tsx ...` works, but `npm run test:hsh-client` can fail in a clean environment

## How to use

1. Extract this ZIP anywhere.
2. Open OpenCode at the H.S.H project root:
   `C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\H.S.H-V2.0.0`
3. Give OpenCode this instruction:

   `Read every file in HSH-OPENCODE-FINAL-FIX-TOOL, starting with MASTER-FIX-INSTRUCTIONS.md. Follow the scope exactly, inspect the current source before editing, implement only the remaining fixes, run the required tests, and return the requested final report.`

4. If this folder is not inside the project, provide OpenCode the extracted absolute path instead.

## Important

Do **not** let OpenCode perform another broad rewrite.

The current Sale/Purchase/Payment atomic lifecycle, payment direction fixes, stale revision rejection, queue coalescing, lease ownership/heartbeat, Office fixes, and snapshot pending-business protection are already working and must be preserved.
