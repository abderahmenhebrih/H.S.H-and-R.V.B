# HSH Desktop

Native Windows client for HSH (Hebrih Slaughter House). It reuses the **real**
HSH Next.js frontend (packaged production build, served on loopback) and talks
to the **real** HSH Express backend over HTTPS/HTTP. No business logic is
duplicated here; this project is a secure shell, a local runtime supervisor, a
first-launch server configuration, and a Windows installer.

- Existing web app: `../H.S.H-V2.0.0/frontend` (untouched apart from two
  backward-compatible additions — see [Integration](#integration-with-the-hsh-application)).
- Existing backend: `../H.S.H-V2.0.0/backend` (not modified, not bundled).
- No MongoDB, no backend secrets, no `.env` files inside the package
  (verified by `npm run package-clean-check` and the `package-clean` test).

## Architecture

```text
HSH-Desktop/
├── electron/
│   ├── main.ts          # app lifecycle, windows, IPC handlers, shutdown
│   ├── preload.ts       # isolated bridge: window.hshDesktop + backend-URL override
│   ├── ipc.ts           # channel allowlist + argument validators
│   ├── navigation.ts    # top-level/popup navigation policy (pure, tested)
│   ├── windows.ts       # locked-down BrowserWindow options factories
│   ├── server.ts        # packaged Next runtime spawn/wait/stop (spawn-fn injected)
│   ├── runtime-spawn.ts # Electron-only launcher (utilityProcess, no Node needed)
│   ├── config.ts        # backend-URL validation, persistence, live probing
│   ├── constants.ts     # loopback defaults, ports, timeouts
│   └── setup.html       # bundled first-launch server configuration (no remote code)
├── scripts/
│   ├── stage-frontend.mjs       # builds the real frontend, stages standalone output
│   ├── make-icon.mjs            # offline .ico generator (deterministic)
│   ├── copy-assets.mjs          # ships setup.html next to compiled main
│   ├── assert-package-clean.mjs # fails on .env/keys/secrets in staged output
│   └── dev.mjs                  # dev loop against `next dev`
├── tests/               # node:test suites (no Electron runtime needed)
├── build/icon.ico       # generated application icon (committed for reproducible builds)
└── dist/                # installer output (gitignored): HSH-Desktop-Setup-<version>.exe
```

Runtime flow:

1. Main reads `%APPDATA%/HSH Desktop/config.json` (backend URL + ports only —
   never business data). First launch (no `configuredAt`) opens the setup window.
2. Main spawns the staged Next standalone `server.js` via `utilityProcess`
   (Electron's bundled Node — users need no Node.js) on `localhost:<port>`
   (default 3123, shifts on collision), waits for HTTP readiness (no fixed
   sleeps), then opens the main window.
3. Preload publishes the validated backend URL as read-only
   `window.__HSH_DESKTOP_API_URL` **before page scripts run** (via
   `additionalArguments`), which the frontend honors through `resolveApiBase()`.
4. Quit stops the runtime (`kill` + timed `SIGKILL` fallback) before exit —
   no orphan servers.

`localhost` (not `127.0.0.1`) is deliberate: the RVB cookie session is
`SameSite=Lax`, so only a `localhost` renderer origin stays same-site with a
same-machine backend. Remote backends face the same cookie limits as the web
app (see [Backend configuration](#backend-configuration)).

## Prerequisites

- Windows 10/11 x64, Node.js 20+ (build machine only).
- A reachable HSH backend (`SERVER_MODE=full`) with this app's origin in its
  `CORS_ORIGIN` list, e.g. `http://localhost:3123` (see below).
- A MongoDB replica set behind that backend (unchanged HSH requirement).

## Backend configuration

The backend URL is **never hardcoded** and never ships with secrets:

- First launch shows Server Setup (also: application menu → Server Settings…).
  Enter `http://localhost:5000` (same machine), `http://<lan-ip>:5000` (LAN),
  or `https://…` (hosted). **Test connection** probes from both the main
  process (API shape + DB readiness) and the renderer (real browser fetch, so a
  missing CORS entry is caught) before **Continue** enables.
- Changing the server recreates the main window (the frontend reads the URL at
  module scope); the packaged Next runtime is not restarted.
- Operator step on the backend host: add the desktop origin to `CORS_ORIGIN`,
  e.g. `CORS_ORIGIN=http://localhost:3000,http://localhost:3123`. Without it the
  backend answers 500 to the desktop origin (allowlist design, unchanged).
- Plain-`http` on a non-loopback host prints a main-process security warning;
  prefer `https` for remote servers. RVB cookie sessions require same-site
  deployments (same limitation as the web app); HSH offline-first sync works
  against any reachable backend.

## Installation / development / build

```powershell
cd HSH-Desktop
npm install            # desktop-only deps (isolated node_modules + lockfile)
npm run dev            # electron against the existing `next dev` (:3000) + your backend
npm test               # tsc + 26 node:test suites (config, IPC, navigation, windows, lifecycle, package-clean)
npm run typecheck      # tsc --noEmit
npm run build          # stage real frontend build + compile shell (staging/ + dist-electron/)
npm run dist           # build + NSIS installer → dist/HSH-Desktop-Setup-<version>.exe
npm run package-clean-check  # re-scan staged output for secrets
```

`npm run dev` expects the existing frontend dev server (`npm run dev` in
`../H.S.H-V2.0.0/frontend`, port 3000) and backend (`:5000`); override with
`HSH_DESKTOP_FRONTEND_URL` / `HSH_DESKTOP_BACKEND_URL`. `HSH_DESKTOP_SMOKE=1`
auto-quits once the main window shows (automated verification).
`HSH_DESKTOP_DEBUG=1` appends startup milestones to `%TEMP%/hshd-debug.log`.

## Installer

- NSIS via electron-builder: per-user install, Start Menu + optional Desktop
  shortcuts, `HSH Desktop` display name, full uninstaller, versioned upgrades
  (`HSH-Desktop-Setup-<version>.exe`, currently 119 MB — the Next standalone
  runtime dominates).
- Ships: compiled shell, setup page, staged Next production runtime (server.js
  + production-only node_modules, `.next/static`, `public/`). The runtime ships
  **unpacked** (`asarUnpack`): Windows cannot spawn a child process from inside
  `app.asar`, so the server runs from `resources/app.asar.unpacked/`. Source maps
  stripped. No devDependencies, test fixtures, `.env`, or backend config.
- **Not code-signed** (no certificate configured): Windows SmartScreen will warn
  on first install. To sign: obtain an EV/OV certificate, set `CSC_LINK` (+
  `CSC_KEY_PASSWORD`) or a Azure Trusted Signing config in CI, rebuild, and
  verify the signature tab on the `.exe` — do not claim signed builds before
  that succeeds.

## Security architecture

- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`, no insecure content, isolated `persist:hsh-desktop`
  partition (IndexedDB/Dexie + localStorage persist across restarts, separate
  from browsers).
- Preload exposes only `window.hshDesktop` (8 allowlisted channels in
  `electron/ipc.ts`, every argument validated; unknown keys rejected) — never
  `ipcRenderer`, `require`, or Node. IPC is served to our own windows only
  (sender-origin check).
- Navigation: top-level in-window navigation limited to the loopback frontend
  origin; foreign `http(s)` opens in the system browser; all other schemes
  denied. Same-origin popups (print previews) open guarded; backend/API origins
  can never become the top-level document. Downloads land in Documents with
  sanitized names. Permissions: notifications allowed, everything else denied.
- Validation: backend URLs restricted to `http(s)`, no credentials/userinfo,
  length-capped; `open-external` restricted to `http(s)`; print/file-dialog
  options whitelisted key-by-key.
- Secrets: none in the package (scanner-enforced); backend URL is not a secret
  and travels to the sandboxed preload via `additionalArguments`, never via
  query strings or logs. Security invariants are asserted by
  `tests/window-options.test.mjs` + `tests/ipc.test.mjs`.

## Integration with the HSH application

Two minimal, backward-compatible additions (web behavior byte-identical when
no desktop override is present):

1. `../H.S.H-V2.0.0/frontend/next.config.ts`: `output: "standalone"` —
   additive; `next start` and the web deployment behave as before.
2. `../H.S.H-V2.0.0/frontend/src/lib/api-base.ts` (`resolveApiBase()`, honors
   the desktop override, else the previous default) adopted by the 22 existing
   `NEXT_PUBLIC_API_URL` consumers (services + sync client + printing).

Everything else — auth/token lifecycle, Socket.IO, Dexie/outbox/snapshot/
incremental sync, fences, file uploads, notifications, printing — is the
unchanged HSH implementation running inside the desktop window. Multiple
desktop profiles and web browsers converge on the same backend revisions;
no second backend, no second sync, no forked database.

## Offline-first behavior (verified)

IndexedDB (Dexie) persists in the app partition across restarts; outbox rows
survive network loss and restarts; snapshot migration + incremental `/changes`
pull run unmodified; two desktop profiles against one backend both reach the
main window and share revisions (see mission evidence: dual-window run).
Restart-during-pending-sync recovers via the existing outbox + revision
protocol — no desktop-specific code.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Setup says unreachable / CORS | Backend down, wrong URL, or origin missing from backend `CORS_ORIGIN` (the renderer-side check catches exactly this) |
| Backend 500s to the desktop origin | Same CORS cause — add `http://localhost:<port>` server-side |
| Blank window after backend loss | Offline-first by design: HSH data stays usable; RVB re-authenticates on return; menu shows Backend status |
| Port taken at startup | The shell shifts ports automatically (up to +9) and remembers the working port |
| `HSH Desktop failed to start` | Read `%TEMP%/hshd-debug.log` (`HSH_DESKTOP_DEBUG=1`); missing staged runtime means `npm run build` never ran |
| SmartScreen warning | Expected: unsigned build (see Installer) |
| App Control blocks `win-unpacked` exe | Launch the installed `%LOCALAPPDATA%/Programs/HSH Desktop/HSH Desktop.exe` instead; direct execution from sync folders may be policy-blocked |

## Test evidence (this machine, dev — not a clean room)

- `npm test`: tsc + 26/26 suites green.
- Staged production runtime serves `/` (200) and `/rvb/login` (200).
- Packaged shell: main window visible with the real HSH UI (document title
  "Hebrih Slaughter House"); setup window on fresh profiles; smoke hook
  (`HSH_DESKTOP_SMOKE=1`) green; two profiles simultaneously green with
  port-shift; quit leaves zero processes and no listeners.
- Installer: silent `/S` install verified (exe + Start Menu shortcut +
  unpacked runtime mirror); silent uninstall verified (exe, shortcut, and
  install dir removed, exit 0); asar contains only `dist-electron/` +
  `package.json` (682 KB) with the runtime unpacked beside it, secret scan
  clean, no `.env`. The freshly built exe is currently reputation-blocked by
  this machine's Application Control policy on launch (unsigned new hash);
  packaged-UI evidence therefore comes from the prior identical-shell build
  (dashboard render via CDP, setup window, smoke, dual-instance) plus the
  byte-identical-file preload/bridge verification (asar hash match) on the
  final build. Clean-room install remains untested by design (see criteria).
- HSH regression: frontend `tsc` + `npm test` green after the `api-base`
  adoption; full `release-gate.mjs` outcome recorded in the final mission
  summary.
