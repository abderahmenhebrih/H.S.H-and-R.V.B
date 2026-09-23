# Verification Checklist

OpenCode must verify the finished fix, not only describe it.

## Source checks

- [ ] `getPendingSyncOperations()` still excludes actively `in_flight` rows
- [ ] there is now an explicit abandoned-in-flight recovery function
- [ ] recovery preserves operationId
- [ ] recovery preserves payload/baseRevision/dependencies
- [ ] recovery is invoked only inside exclusive cross-tab sync ownership
- [ ] active foreign-tab sync cannot be reset
- [ ] server same-client stale bypass remains removed
- [ ] existing successor rebasing remains intact
- [ ] payment direction code is unchanged unless a regression is found
- [ ] snapshot pending-business protection remains intact

## Runtime tests

- [ ] pending -> in_flight -> simulated crash -> restart -> operation becomes retryable
- [ ] same operationId is retried
- [ ] server-not-yet-seen operation applies exactly once
- [ ] server-already-committed operation does not double-apply
- [ ] OP2 successor survives recovery
- [ ] OP2 baseRevision rebases after OP1 success
- [ ] transient retry ordering remains safe
- [ ] terminal reconciliation still works
- [ ] fallback lease owner/heartbeat tests remain green
- [ ] customer payment Bank0 tests remain green
- [ ] pending business snapshot preservation remains green

## Commands

Frontend:

```powershell
cd "C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\H.S.H-V2.0.0\frontend"
npm run build
npm run lint
npx tsx test-hsh-regression.ts
npm run test:hsh-client
```

Backend:

```powershell
cd "C:\Users\islam\OneDrive\Desktop\H.S.H and R.V.B\H.S.H-V2.0.0\backend"
npm run build
npm run test:hsh-sync
```

## Release gate

Do not say freeze-ready if abandoned `in_flight` recovery is only source-inspected.

It must be reproduced in the test suite.
