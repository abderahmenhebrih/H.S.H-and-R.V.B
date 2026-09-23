# Recovery Design Notes for OpenCode

These notes describe the intended safety model, not mandatory exact code.

## Why recovery belongs inside the cross-tab lock

A naive startup hook like:

`on app start: set all in_flight -> pending`

is unsafe.

Two browser tabs share IndexedDB. A newly opened Tab B could reset Tab A's legitimate operation while A's HTTP request is still active.

The project already has one global cross-tab synchronization lock:

- Web Locks API when available
- IndexedDB owner/expiry lease fallback

Therefore the clean safety invariant is:

> Only the owner of the global exclusive sync lock may recover persisted `in_flight` operations.

If a healthy Tab A is syncing, Tab B cannot acquire the lock.

If Tab A dies:

- Web Locks releases automatically, or
- fallback heartbeat stops and lease eventually expires

The next owner can then treat leftover `in_flight` rows as abandoned.

## Suggested flow

Inside the locked callback used by `syncCycle`:

1. `recoverAbandonedInFlightOperations()`
2. perform pull/push in current architecture
3. normal result handling
4. release lock

Recovery should run before pending operations are loaded for push.

## Retry identity

Never create a new operationId during crash recovery.

The same operationId is the mechanism that makes this safe if the server already committed before the client crashed.

## Successor relationships

Do not flatten or delete:

- `dependsOnOperationId`
- `parentOperationId`

during recovery.

If a recovered parent succeeds, use existing successor rebasing.

## State choice

Either of these is acceptable if current code supports it correctly:

- `in_flight -> retrying`
- `in_flight -> pending`

What matters is that `getPendingSyncOperations()` can eventually select it in correct order.

## Attempts

Recovery itself should not necessarily count as a new network attempt.

Only increment attempts when another request is actually attempted, unless the current retry accounting intentionally works differently.

## No schema upgrade is necessarily required

If recovery can be made safe by exclusive-lock ownership, timestamps are not required merely to distinguish abandoned operations.

However, if OpenCode chooses timeout-based recovery instead, it must prove that long healthy requests are not duplicated and that lock ownership remains authoritative.
