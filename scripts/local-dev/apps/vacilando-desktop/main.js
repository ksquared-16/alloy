"use strict";

/**
 * Vacilando — native macOS shell.
 *
 * Wraps the existing loopback control-plane server (scripts/local-dev/lib/
 * vacilando-server.mjs) and its static SPA in a real Electron window. The shell
 * OWNS the server lifecycle: it starts the server when the app opens and stops
 * it when the app quits. If a Vacilando server is already listening on the
 * target port (e.g. one you started by hand), the shell ATTACHES to it instead
 * of spawning a second one, and leaves it running on quit.
 *
 * The server is launched as a child node process — the exact working invocation
 * (`node lib/vacilando-server.mjs --port N`) — rather than imported in-process,
 * so it runs under the same Node it was built for and Electron only manages its
 * lifecycle. Nothing about the server changes.
 */

const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

// ---------------------------------------------------------------------------
// Paths & configuration
// ---------------------------------------------------------------------------

/**
 * Resolve the live `scripts/local-dev` checkout to run the server from.
 *
 * Unpackaged (`electron .` / alloy-vacilando-app), the app lives INSIDE the
 * checkout, so it's two levels up. Packaged into a .app, the bundle is a frozen
 * copy that must NOT run its own frozen server — Vacilando projects live git /
 * worktree / state, so it has to run against the real checkout on disk. The
 * absolute checkout path is baked into `checkout-path.txt` at package time (see
 * alloy-vacilando-app --package); `VACILANDO_CHECKOUT` overrides either way.
 */
function resolveLocalDevDir() {
  if (process.env.VACILANDO_CHECKOUT) return process.env.VACILANDO_CHECKOUT;
  if (app.isPackaged) {
    try {
      const baked = fs.readFileSync(path.join(__dirname, "checkout-path.txt"), "utf8").trim();
      if (baked) return baked;
    } catch {
      /* fall through */
    }
  }
  return path.resolve(__dirname, "..", "..");
}

const LOCAL_DEV_DIR = resolveLocalDevDir();
const SERVER_ENTRY = path.join(LOCAL_DEV_DIR, "lib", "vacilando-server.mjs");
const HOST = "127.0.0.1";
const PORT = Number(process.env.VACILANDO_PORT || 3021);
const START_ROUTE = process.env.VACILANDO_ROUTE || "#/director";
const APP_URL = `http://${HOST}:${PORT}/${START_ROUTE}`;

// Server readiness bounds. The first projection can be slow on a memory-pressured
// host (alloy-ro ~16s), but binding the port happens immediately, so a generous
// window here only matters when the host is truly wedged.
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 250;
const QUIT_GRACE_MS = 4_000;

let serverChild = null; // the spawned server process, if WE started it
let managingServer = false; // true only when we own the server lifecycle
let mainWindow = null;
let shuttingDown = false;

// ---------------------------------------------------------------------------
// Node runtime resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the Node binary to run the server with. Prefer an explicit override,
 * then the known node22 the toolkit is validated against, then whatever `node`
 * is on PATH. Electron's own bundled Node is NOT used to run the child — the
 * server is invoked as a standalone process.
 */
function resolveNode() {
  const candidates = [
    process.env.VACILANDO_NODE,
    path.join(app.getPath("home"), ".nvm/versions/node/v22.21.1/bin/node"),
    "/usr/local/bin/node",
    "/opt/homebrew/bin/node",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "node"; // last resort — relies on childEnv PATH
}

/**
 * Build a robust PATH for the child. Apps launched from Finder inherit a
 * stripped PATH (/usr/bin:/bin:/usr/sbin:/sbin) that omits Homebrew, nvm, and
 * /usr/local — where git, gh, and node live. The server shells out to git/gh,
 * so we prepend the locations they actually live in.
 */
function childEnv() {
  const home = app.getPath("home");
  const extra = [
    path.dirname(resolveNode()),
    `${home}/.nvm/versions/node/v22.21.1/bin`,
    `${home}/.local/bin`,
    `${home}/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  const existing = (process.env.PATH || "").split(":").filter(Boolean);
  const seen = new Set();
  const merged = [...extra, ...existing].filter((d) => {
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  });
  // Authoritative desktop defaults — Finder launches must not inherit a bare
  // Terminal server lacking execution configuration.
  const env = { ...process.env, PATH: merged.join(":") };
  if (!env.VACILANDO_EXECUTION_PROVIDER || env.VACILANDO_EXECUTION_PROVIDER === "") {
    env.VACILANDO_EXECUTION_PROVIDER = "auto";
  }
  // Mock is test-only; desktop never authorizes it unless the operator set it.
  if (env.VACILANDO_ALLOW_MOCK_PROVIDER !== "1") {
    env.VACILANDO_ALLOW_MOCK_PROVIDER = "0";
  }
  env.VACILANDO_DESKTOP_OWNED = "1";
  env.VACILANDO_CONTROL_PLANE_PORT = String(PORT);
  return env;
}

/** GET JSON from the control plane; null on failure. */
function fetchJson(pathname) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: pathname, timeout: 2500 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

/**
 * Kill whatever is listening on PORT so Vacilando.app can own it.
 * Prefer the recorded control-plane owner PID when present.
 */
function reclaimPort() {
  return new Promise((resolve) => {
    const { execFile } = require("node:child_process");
    execFile("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"], { timeout: 4000 }, (err, stdout) => {
      const pids = String(stdout || "")
        .split(/\s+/)
        .map((s) => Number(s))
        .filter((n) => n > 0 && n !== process.pid);
      if (!pids.length) return resolve({ killed: [] });
      const killed = [];
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGTERM");
          killed.push(pid);
          log(`reclaimed :${PORT} — SIGTERM pid ${pid} (foreign/misconfigured control plane)`);
        } catch (e) {
          log(`reclaim pid ${pid} failed: ${e.message}`);
        }
      }
      setTimeout(() => {
        for (const pid of killed) {
          try { process.kill(pid, 0); process.kill(pid, "SIGKILL"); } catch { /* gone */ }
        }
        resolve({ killed });
      }, 1500);
    });
  });
}

/** True when the listening server is safe for Vacilando.app to attach to. */
async function isAttachCompatible() {
  const diag = await fetchJson("/api/v2/runtime/diagnostics");
  if (!diag?.ok || !diag.execution) return false;
  return Boolean(diag.execution.attachCompatible || diag.execution.desktopOwned);
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/** GET / and resolve true iff the Vacilando server answers on the port. */
function probe() {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: "/", timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode > 0);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Poll until the server answers or we hit the timeout. */
async function waitForReady(deadline) {
  for (;;) {
    if (await probe()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
}

/** Show a status/launch page (desert art + message) in the window. */
function showStatus(message) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(loadingHTML(message));
}

/** Load the live app into the window; fall back to a status page on failure. */
async function showApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.loadURL(APP_URL);
  } catch (e) {
    log(`app load failed: ${e.message}`);
    showStatus("Loading…");
  }
}

/** Spawn the control-plane server as a SUPERVISED child and take ownership. */
function spawnServer() {
  const node = resolveNode();
  log(`starting server: ${node} lib/vacilando-server.mjs --port ${PORT}`);
  const child = spawn(node, ["lib/vacilando-server.mjs", "--port", String(PORT)], {
    cwd: LOCAL_DEV_DIR,
    env: childEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  child.on("exit", (code, signal) => onServerExit(code, signal));
  serverChild = child;
  managingServer = true;
}

/** Our server died. Never dead-end — recover (attach or respawn) unless quitting. */
function onServerExit(code, signal) {
  log(`server exited (code=${code} signal=${signal})`);
  const wasOurs = managingServer && serverChild;
  serverChild = null;
  managingServer = false;
  if (shuttingDown || !wasOurs) return;
  showStatus(code === 0 ? "Restarting the control plane…" : `Control plane stopped (code ${code}). Reconnecting…`);
  recover();
}

let recovering = false;
let restartAttempts = 0;
/**
 * Keep the app alive: attach to any healthy server on the port, else respawn —
 * with backoff, indefinitely, updating the launch screen. This replaces the old
 * dead-end "server stopped" dialog, and fixes the EADDRINUSE race (a server that
 * won the port is ATTACHED to, not fought). The app can no longer get stuck.
 */
async function recover() {
  if (recovering || shuttingDown) return;
  recovering = true;
  for (;;) {
    if (shuttingDown) break;
    if (await probe()) {
      if (await isAttachCompatible()) {
        managingServer = false;
        restartAttempts = 0;
        log(`attached to desktop-owned server on ${HOST}:${PORT}`);
        await showApp();
        break;
      }
      // Port occupied by a bare Terminal server (or mock) — reclaim ownership.
      showStatus("Taking ownership of the control plane…");
      log(`server on :${PORT} is not desktop-owned / misconfigured — reclaiming`);
      await reclaimPort();
      await new Promise((r) => setTimeout(r, 500));
    }
    try {
      if (!fs.existsSync(SERVER_ENTRY)) throw new Error(`server not found at ${SERVER_ENTRY}`);
      spawnServer();
      if (await waitForReady(Date.now() + READY_TIMEOUT_MS)) {
        restartAttempts = 0;
        log("server ready (desktop-owned, execution provider auto→Claude)");
        await showApp();
        break;
      }
      if (serverChild) { try { serverChild.kill("SIGKILL"); } catch { /* gone */ } serverChild = null; managingServer = false; }
    } catch (e) {
      log(`recover attempt failed: ${e.message}`);
    }
    restartAttempts += 1;
    const backoff = Math.min(1000 * 2 ** Math.min(restartAttempts, 4), 15000);
    showStatus(`Reconnecting to the control plane… (attempt ${restartAttempts})`);
    await new Promise((r) => setTimeout(r, backoff));
  }
  recovering = false;
}

/** Stop the server if we own it. Graceful SIGTERM, then SIGKILL. */
function stopServer() {
  if (!managingServer || !serverChild) return Promise.resolve();
  const child = serverChild;
  serverChild = null;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    child.once("exit", finish);
    try {
      child.kill("SIGTERM");
    } catch {
      return finish();
    }
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      finish();
    }, QUIT_GRACE_MS);
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

// The desert scene from the app's own UI, reused as the launch art.
const DESERT_ART = `
<svg width="120" height="120" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="lsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#163b28"/><stop offset="0.52" stop-color="#8f5334"/><stop offset="1" stop-color="#cc7d4b"/></linearGradient>
    <linearGradient id="ldune" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c46c40"/><stop offset="1" stop-color="#a4512d"/></linearGradient>
    <radialGradient id="lsun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffd9a3"/><stop offset="0.6" stop-color="#f2bd83"/><stop offset="1" stop-color="#eab07a"/></radialGradient>
    <radialGradient id="lhalo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#f3c48c" stop-opacity="0.55"/><stop offset="1" stop-color="#f3c48c" stop-opacity="0"/></radialGradient>
    <clipPath id="lsq"><rect x="0" y="0" width="1024" height="1024" rx="224" ry="224"/></clipPath>
  </defs>
  <g clip-path="url(#lsq)">
    <rect width="1024" height="1024" fill="url(#lsky)"/>
    <circle cx="670" cy="392" r="260" fill="url(#lhalo)"/>
    <circle cx="670" cy="392" r="132" fill="url(#lsun)"/>
    <path d="M0 690 Q280 590 540 668 T1024 636 V1024 H0 Z" fill="url(#ldune)"/>
    <path d="M0 812 Q320 712 620 792 T1024 772 V1024 H0 Z" fill="#8a4527"/>
    <g fill="#14311f" transform="translate(300 690)">
      <path d="M0 150 L-14 12 L14 12 Z"/>
      <path d="M0 150 C-30 70 -84 40 -120 44 C-78 22 -30 44 0 118 Z"/>
      <path d="M0 150 C30 70 84 40 120 44 C78 22 30 44 0 118 Z"/>
      <path d="M0 150 C-24 60 -60 -6 -70 -74 C-40 -24 -14 40 0 122 Z"/>
      <path d="M0 150 C24 60 60 -6 70 -74 C40 -24 14 40 0 122 Z"/>
      <path d="M0 150 C-8 60 -20 -30 -20 -104 C-4 -40 -2 44 0 126 Z"/>
      <path d="M0 150 C8 60 20 -30 20 -104 C4 -40 2 44 0 126 Z"/>
    </g>
  </g>
</svg>`;

function loadingHTML(message) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#12100e;color:#e8ded2;
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;
    display:flex;align-items:center;justify-content:center}
  .box{text-align:center}
  .art{width:120px;height:120px;margin:0 auto 20px;filter:drop-shadow(0 12px 28px rgba(0,0,0,.45))}
  .brand{font-size:22px;font-weight:600;letter-spacing:.3px}
  .brand b{color:#e0a15e}
  .msg{margin-top:10px;color:#9a8f80;font-size:13px;max-width:320px}
  .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#e0a15e;
    margin:16px 3px 0;animation:p 1s infinite ease-in-out}
  .dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
  @keyframes p{0%,80%,100%{opacity:.25}40%{opacity:1}}
</style></head><body><div class="box">
  <div class="art">${DESERT_ART}</div>
  <div class="brand">Vacilando<b>OS</b></div>
  <div class="msg">${message}</div>
  <div><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
</div></body></html>`)}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#12100e",
    titleBarStyle: "hiddenInset",
    title: "Vacilando",
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(loadingHTML("Starting the control plane…"));

  // Open target=_blank / external links in the system browser, never new windows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://${HOST}:${PORT}`)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function boot() {
  createWindow();
  if (!mainWindow) return;
  showStatus("Starting the control plane…");
  // recover() attaches to a healthy server or spawns+supervises one, retrying
  // forever with backoff and loading the app the moment it's reachable.
  await recover();
}

// ---------------------------------------------------------------------------
// App menu (native shortcuts, Reload, DevTools)
// ---------------------------------------------------------------------------

function buildMenu() {
  const template = [
    {
      label: "Vacilando",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Open at Login",
          type: "checkbox",
          checked: app.getLoginItemSettings().openAtLogin,
          // Always-running: auto-start Vacilando when you log in. The app owns
          // and supervises the control-plane server, so this keeps it up.
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked });
            log(`open-at-login = ${item.checked}`);
          },
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      // Without an Edit menu the paste/copy/cut accelerators are never
      // registered, so Cmd+V does nothing in text inputs on macOS.
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow && mainWindow.loadURL(APP_URL),
        },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Lifecycle wiring
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`[vacilando-desktop] ${msg}\n`);
}

// Single-instance: a second launch focuses the existing window instead of
// spawning a second server.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Double-click on the app header (preload sends this) → zoom/fill the window,
  // matching the native macOS title-bar gesture.
  ipcMain.on("win:toggle-zoom", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });

  // Dock badge: count of conversations that need the operator (from the SPA).
  ipcMain.on("dock:set-badge", (_e, count) => {
    if (process.platform !== "darwin" || !app.dock) return;
    const n = Math.max(0, Number(count) || 0);
    try { app.dock.setBadge(n > 0 ? String(n) : ""); } catch { /* ignore */ }
  });

  app.whenReady().then(() => {
    // Dock icon for the UNPACKAGED (dev) run only. The packaged .app must use its
    // bundle .icns (transparent) — overriding it at runtime with a PNG re-introduced
    // the white corners, since the runtime override wins over the .icns.
    if (process.platform === "darwin" && app.dock && !app.isPackaged) {
      try { app.dock.setIcon(path.join(__dirname, "assets", "icon.png")); } catch { /* ignore */ }
    }
    buildMenu();
    boot();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) boot();
    });
  });

  app.on("window-all-closed", () => {
    app.quit(); // owns the server; quitting fully is the right default on macOS here
  });

  app.on("before-quit", async (e) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (managingServer && serverChild) {
      e.preventDefault();
      log("stopping server…");
      await stopServer();
      app.quit();
    }
  });
}
