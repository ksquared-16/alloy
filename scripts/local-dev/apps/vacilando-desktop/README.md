# Vacilando — native macOS shell

Opens the Vacilando engineering control plane as a real macOS app window. No
browser. The shell owns the loopback server lifecycle: it starts the server when
the app opens and stops it when the app quits.

## Run it

From `scripts/local-dev/`:

```bash
./alloy-vacilando-app
```

First run installs Electron (a prebuilt binary — no compiler). After that it
opens instantly.

- Default port `3021`. Override: `./alloy-vacilando-app --port 3022`.
- If a Vacilando server is **already** listening on the port (e.g. one you
  started by hand), the app **attaches** to it and leaves it running on quit.
  Otherwise it spawns its own and stops it on quit.

## Build a double-clickable app

```bash
./alloy-vacilando-app --package
open dist/Vacilando-darwin-*/Vacilando.app
```

Drag `Vacilando.app` to `/Applications` to keep it. (Add a `Login Item` for
always-running; that lifecycle work is the launcher-worker follow-on.)

`--package` deep **ad-hoc code-signs** the bundle. Without that, Apple Silicon
rejects an electron-packager bundle as *"damaged / can't be opened"* on
double-click (the packager only signs the main binary, not the sealed
resources). Ad-hoc signing runs locally but is **not notarized** — that needs a
Developer ID and is out of scope for a local internal tool. If you ever hit a
"damaged" error on a hand-built bundle, re-seal it:

```bash
codesign --force --deep --sign - dist/Vacilando-darwin-*/Vacilando.app
```

## How it works

- `main.js` — Electron main process. Resolves Node (prefers node22), builds a
  robust child `PATH` (Finder-launched apps get a stripped PATH; the server
  shells out to `git`/`gh`), spawns `node lib/vacilando-server.mjs --port N`,
  polls until it answers, then loads `http://127.0.0.1:N/#/director` in the
  window. Kills the child on quit (SIGTERM → SIGKILL grace).
- `preload.js` — intentionally empty; keeps the renderer sandboxed
  (`contextIsolation` on, `nodeIntegration` off).

The server itself is unchanged — it's launched exactly as
`node lib/vacilando-server.mjs --port N`, the same working invocation used from
the shell.

## Environment overrides

| Var | Default | Purpose |
|---|---|---|
| `VACILANDO_PORT` | `3021` | Port the server binds / the window loads |
| `VACILANDO_ROUTE` | `#/director` | Hash route to open |
| `VACILANDO_NODE` | auto | Explicit Node binary for the server child |
