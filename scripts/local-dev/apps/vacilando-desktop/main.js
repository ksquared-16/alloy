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

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
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
  return { ...process.env, PATH: merged.join(":") };
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

/**
 * Ensure a Vacilando server is reachable on PORT. Attach if one is already
 * running; otherwise spawn one and take ownership of its lifecycle.
 */
async function ensureServer() {
  if (await probe()) {
    managingServer = false;
    log(`attached to existing server on ${HOST}:${PORT}`);
    return true;
  }

  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error(
      `server not found at ${SERVER_ENTRY}. ` +
        `Set VACILANDO_CHECKOUT to your scripts/local-dev path, or re-package from the checkout.`
    );
  }

  const node = resolveNode();
  log(`starting server: ${node} lib/vacilando-server.mjs --port ${PORT}`);
  serverChild = spawn(node, ["lib/vacilando-server.mjs", "--port", String(PORT)], {
    cwd: LOCAL_DEV_DIR,
    env: childEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  managingServer = true;

  serverChild.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverChild.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  serverChild.on("exit", (code, signal) => {
    log(`server exited (code=${code} signal=${signal})`);
    serverChild = null;
    if (!shuttingDown && code !== 0) {
      dialog.showErrorBox(
        "Vacilando server stopped",
        `The control-plane server exited unexpectedly (code ${code}${signal ? `, signal ${signal}` : ""}).`
      );
    }
  });

  const ok = await waitForReady(Date.now() + READY_TIMEOUT_MS);
  if (!ok) throw new Error(`server did not become ready on ${HOST}:${PORT} within ${READY_TIMEOUT_MS}ms`);
  return true;
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

function loadingHTML(message) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#12100e;color:#e8ded2;
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;
    display:flex;align-items:center;justify-content:center}
  .box{text-align:center}
  .brand{font-size:22px;font-weight:600;letter-spacing:.3px}
  .brand b{color:#e0a15e}
  .msg{margin-top:10px;color:#9a8f80;font-size:13px}
  .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#e0a15e;
    margin:14px 3px 0;animation:p 1s infinite ease-in-out}
  .dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
  @keyframes p{0%,80%,100%{opacity:.25}40%{opacity:1}}
</style></head><body><div class="box">
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
  try {
    await ensureServer();
    if (!mainWindow) return; // closed during startup
    await mainWindow.loadURL(APP_URL);
  } catch (err) {
    log(`boot failed: ${err.message}`);
    if (mainWindow) {
      mainWindow.loadURL(
        loadingHTML(`Couldn’t reach the control plane.<br><small>${String(err.message)}</small>`)
      );
    }
  }
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
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
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

  app.whenReady().then(() => {
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
