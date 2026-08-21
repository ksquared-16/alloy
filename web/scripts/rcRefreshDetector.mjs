/**
 * PRIORITY 1 — unexpected page refresh / remount detector.
 *
 * The report is "the app sometimes appears to randomly refresh". Visual behaviour cannot tell a full
 * browser reload from an RSC refresh from a subtree remount, and those have completely different
 * owners — so this classifies the event instead of guessing:
 *
 *   FULL_BROWSER_RELOAD  the document was replaced (navigation type `reload`, or a fresh document
 *                        epoch with an unchanged URL)
 *   ROUTE_CHANGE         pathname/search changed (pushState/replaceState/popstate)
 *   RSC_REFRESH          an `?_rsc=` fetch for the CURRENT url with no location change
 *                        (this is what `router.refresh()` looks like on the wire)
 *   ROUTE_REMOUNT        a tracked root anchor node was replaced by a different node instance
 *   SURFACE_REMOUNT      a tracked surface anchor (Work Unit / workspace / Focus Panel) was replaced
 *   DATA_REFETCH         `/api/` traffic with none of the above
 *
 * Events are appended to sessionStorage as they happen. In-memory logs die with the document, so a
 * full reload would erase exactly the evidence that matters most.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import fs from "fs";

const BASE = process.env.RC_BASE ?? `http://127.0.0.1:${process.env.RC_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const MINUTES = Number(process.env.RC_MINUTES ?? 6);
const OUT = process.env.RC_OUT ?? "/tmp/rc/refresh-events.json";

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();

await p.addInitScript(() => {
  const KEY = "__rc_events";
  const EPOCH = "__rc_epoch";
  const push = (type, detail) => {
    try {
      const arr = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
      arr.push({ t: Date.now(), type, url: location.pathname + location.search, ...detail });
      sessionStorage.setItem(KEY, JSON.stringify(arr.slice(-400)));
    } catch { /* storage unavailable — detector degrades, page unaffected */ }
  };
  window.__rcPush = push;

  // ---- document epoch: a NEW document means the page was replaced, not re-rendered
  const prev = Number(sessionStorage.getItem(EPOCH) ?? "0");
  const epoch = prev + 1;
  sessionStorage.setItem(EPOCH, String(epoch));
  const navType = (() => {
    try { return performance.getEntriesByType("navigation")[0]?.type ?? "unknown"; } catch { return "unknown"; }
  })();
  if (epoch > 1) push("DOCUMENT_REPLACED", { epoch, navType });

  // ---- explicit reload / navigation attempts
  try {
    const origReload = Location.prototype.reload;
    Object.defineProperty(Location.prototype, "reload", {
      configurable: true,
      value: function (...a) { push("LOCATION_RELOAD_CALLED", { stack: new Error().stack?.split("\n").slice(1, 6).join(" | ") }); return origReload.apply(this, a); },
    });
  } catch { push("PATCH_FAILED", { what: "location.reload" }); }
  for (const m of ["assign", "replace"]) {
    try {
      const orig = Location.prototype[m];
      Object.defineProperty(Location.prototype, m, {
        configurable: true,
        value: function (...a) { push("LOCATION_" + m.toUpperCase(), { to: String(a[0]), stack: new Error().stack?.split("\n").slice(1, 5).join(" | ") }); return orig.apply(this, a); },
      });
    } catch { /* not configurable in this engine */ }
  }

  // ---- history / route changes
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function (...a) {
      push("HISTORY_" + m.toUpperCase(), { to: String(a[2] ?? ""), stack: new Error().stack?.split("\n").slice(1, 6).join(" | ") });
      return orig.apply(this, a);
    };
  }
  addEventListener("popstate", () => push("POPSTATE", {}));
  addEventListener("beforeunload", () => push("BEFOREUNLOAD", {}));
  addEventListener("pagehide", (e) => push("PAGEHIDE", { persisted: e.persisted }));
  addEventListener("pageshow", (e) => push("PAGESHOW", { persisted: e.persisted }));
  addEventListener("visibilitychange", () => push("VISIBILITY", { state: document.visibilityState }));
  addEventListener("error", (e) => push("WINDOW_ERROR", { msg: String(e.message).slice(0, 120) }));
  addEventListener("unhandledrejection", (e) => push("UNHANDLED_REJECTION", { msg: String(e.reason).slice(0, 120) }));

  // ---- mount identity: a REPLACED node is a remount; a re-rendered node is not
  const ANCHORS = {
    ROOT: "[data-alloy-os-runtime]",
    WORK_UNIT: "[data-runtime-label='WU.SURFACE']",
    FOCUS_PANEL: "[data-inline-focus-panel]",
    WORKSPACE_MODAL: "[data-adminv2-bos-modal]",
    QUEUE: "[data-queue-region],[data-queue-row]",
  };
  const seen = new Map();
  const scan = () => {
    for (const [name, sel] of Object.entries(ANCHORS)) {
      const el = document.querySelector(sel);
      const had = seen.get(name);
      if (el && had && el !== had) push(name + "_REMOUNT", {});
      if (el !== had) seen.set(name, el ?? null);
    }
  };
  const start = () => { new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); scan(); };
  if (document.documentElement) start();
  else addEventListener("readystatechange", start, { once: true });
});

// ---- network classification (outside the page, so a reload cannot erase it)
const net = [];
p.on("request", (r) => {
  const u = r.url();
  if (!u.startsWith(BASE)) return;
  const path = u.replace(BASE, "");
  if (path.includes("_rsc=")) net.push({ t: Date.now(), kind: "RSC", path });
  else if (path.includes("/api/")) net.push({ t: Date.now(), kind: "API", path: path.split("?")[0] });
  else if (r.resourceType() === "document") net.push({ t: Date.now(), kind: "DOCUMENT", path });
});
p.on("framenavigated", (f) => { if (f === p.mainFrame()) net.push({ t: Date.now(), kind: "FRAMENAV", path: f.url().replace(BASE, "") }); });
p.on("crash", () => net.push({ t: Date.now(), kind: "PAGE_CRASH", path: "" }));
const consoleErrors = [];
p.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ t: Date.now(), text: m.text().slice(0, 140) }); });

// ---- drive the canonical journey, then dwell
const startedAt = Date.now();
console.log(`detector armed — driving canonical journeys for ~${MINUTES} min`);
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
await p.waitForTimeout(22000);

const step = async (label, fn, dwellMs = 12000) => {
  await p.evaluate((l) => window.__rcPush?.("STEP", { step: l }), label);
  try { await fn(); } catch (e) { console.log(`  step ${label} threw: ${String(e).slice(0, 90)}`); }
  await p.waitForTimeout(dwellMs);
};

while (Date.now() - startedAt < MINUTES * 60000) {
  await step("open work unit", async () => {
    await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
  }, 16000);
  await step("idle on work unit", async () => {}, 25000);
  await step("open operations", async () => {
    await p.locator('[aria-label^="Operations"]').first().click({ timeout: 15000 });
  }, 12000);
  await step("close operations", async () => { await p.keyboard.press("Escape"); }, 8000);
  await step("back to workspace", async () => {
    await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
  }, 18000);
  await step("long idle", async () => {}, 40000);
}

const events = await p.evaluate(() => JSON.parse(sessionStorage.getItem("__rc_events") ?? "[]"));
fs.mkdirSync("/tmp/rc", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ events, net, consoleErrors, startedAt }, null, 2));

const counts = {};
for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
console.log("\n=== in-page events ===");
Object.entries(counts).sort((a, b2) => b2[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
const docs = net.filter((n) => n.kind === "DOCUMENT");
const rsc = net.filter((n) => n.kind === "RSC");
console.log(`\ndocument loads: ${docs.length} | RSC requests: ${rsc.length} | API: ${net.filter((n) => n.kind === "API").length} | crashes: ${net.filter((n) => n.kind === "PAGE_CRASH").length}`);
console.log(`console errors: ${consoleErrors.length}`);
console.log(`-> ${OUT}`);
await b.close();
