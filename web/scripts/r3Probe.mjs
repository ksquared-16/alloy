/**
 * R3 — inventory drawer-VM requests across a child-grain work-unit journey, valid vs invalid.
 *
 * Re-run this to prove the speculative drawer-VM 404s have not come back. It reports per-phase
 * request and 404 counts, and for every 404 the route pattern (query values redacted) plus the JS
 * frames that issued it.
 * Playwright does not expose a request's JS initiator, so this attaches a CDP session and reads
 * Network.requestWillBeSent's `initiator.stack` — the only way to name the hook that issued it.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path"; import fs from "fs";
const SLOT = process.env.PE3_SLOT ?? "5";
const PORT = process.env.PE3_PORT ?? String(3010 + Number(SLOT));
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${PORT}`;
const STORAGE = process.env.PE3_STORAGE ?? join(homedir(), `.local/state/alloy-dev/auth/slot${SLOT}/storage-state.json`);
const LABEL = process.env.R3_LABEL ?? "r3";
/** The child-grain work unit under test, and a non-child control. Both configurable — no tenant constants. */
const SLUG = process.env.R3_SLUG ?? "waitlist";
const CONTROL_SLUG = process.env.R3_CONTROL_SLUG ?? "all";
const OUT_DIR = process.env.R3_OUT_DIR ?? "/tmp/r3";

/**
 * Durable output is REDACTED. The console shows a route pattern with query values masked, but the
 * JSON artifact was written from the raw records — full URLs, and therefore subject ids, persisted
 * to disk. A harness that redacts only what you happen to be watching is not redacting.
 */
const redact = (url) => {
    // Anywhere in the path, not only as a whole segment: ids are also EMBEDDED in segments
    // (`/queue-row-<uuid>-<uuid>`), and a leading-slash pattern walks straight past those.
    const path = url.replace(BASE, "").split("?")[0]
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
    let qs = "";
    try {
        const u = new URL(url);
        const keys = [...u.searchParams.keys()];
        if (keys.length) qs = "?" + keys.map((k) => `${k}=<redacted>`).join("&");
    } catch { /* non-parseable — the path alone is enough */ }
    return path + qs;
};

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");

  const byId = new Map();      // requestId -> {url, method, initiator, t}
  const records = [];          // completed records
  let phase = "boot", phaseT0 = Date.now();
  cdp.on("Network.requestWillBeSent", (e) => {
    const frames = (e.initiator?.stack?.callFrames ?? []).map(f => `${f.functionName || "(anon)"}@${(f.url||"").split("/").pop()}:${f.lineNumber}`);
    byId.set(e.requestId, { url: e.request.url, method: e.request.method, initiatorType: e.initiator?.type, frames, t: Date.now() - phaseT0, phase });
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = byId.get(e.requestId); if (!r) return;
    r.status = e.response.status; r.dur = Date.now() - phaseT0 - r.t;
    records.push(r); byId.delete(e.requestId);
  });

  const mark = (p) => { phase = p; phaseT0 = Date.now(); };

  const J = async (name, fn, wait = 12000) => { mark(name); try { await fn(); } catch (e) { console.log(`  ${name}: ${String(e).slice(0,70)}`); } await page.waitForTimeout(wait); };

  await J("1_workspace_first_entry", async () => { await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 180000 }); await page.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 }); }, 22000);
  await J("2_subject_unit_entry", async () => { await page.locator(`a[href^="/workspace/work-unit/${SLUG}"]`).first().click({ timeout: 20000 }); }, 16000);
  await J("3_row_selection", async () => { await page.locator("[data-entity-id]").nth(1).click({ timeout: 12000 }); }, 10000);
  await J("4_back_to_workspace", async () => { await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 }); }, 16000);
  await J("5_warm_repeat", async () => { await page.locator(`a[href^="/workspace/work-unit/${SLUG}"]`).first().click({ timeout: 20000 }); }, 12000);
  await J("6_rapid_two_rows", async () => {
    const rows = page.locator("[data-entity-id]");
    if (await rows.count() > 1) { await rows.nth(0).click({ timeout: 8000 }); await page.waitForTimeout(60); await rows.nth(1).click({ timeout: 8000 }); }
  }, 10000);
  await J("7_control_other_unit", async () => { await page.goto(`${BASE}/workspace/work-unit/${CONTROL_SLUG}`, { waitUntil: "domcontentloaded", timeout: 120000 }); }, 14000);

  const app = records.filter(r => r.url.startsWith(BASE));
  const notFound = app.filter(r => r.status === 404);
  // The point of R3 is not a quiet network panel — it is that the INVALID work went away while the
  // VALID preparation stayed. So both are reported, never just the 404 count.
  const drawerVm = app.filter(r => r.url.includes("/view-models/drawer/"));
  const drawerValid = drawerVm.filter(r => r.status === 200);
  const drawerInvalid = drawerVm.filter(r => r.status === 404);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const scrub = (r) => ({ phase: r.phase, route: redact(r.url), method: r.method, status: r.status, t: r.t, dur: r.dur, initiatorType: r.initiatorType, frames: r.frames });
  fs.writeFileSync(`${OUT_DIR}/${LABEL}.json`, JSON.stringify({ all: app.map(scrub), notFound: notFound.map(scrub) }, null, 1));

  console.log(`\n=== ${LABEL}: ${app.length} app requests, ${notFound.length} 404s ===`);
  console.log(`    drawer-VM: ${drawerVm.length} total = ${drawerValid.length} valid (200) + ${drawerInvalid.length} invalid (404)\n`);
  const perPhase = {}; app.forEach(r => { perPhase[r.phase] = perPhase[r.phase] || { n: 0, f: 0 }; perPhase[r.phase].n++; if (r.status === 404) perPhase[r.phase].f++; });
  for (const [p, v] of Object.entries(perPhase)) console.log(`  ${p.padEnd(26)} requests=${String(v.n).padStart(3)}  404s=${v.f}`);
  console.log("\n--- every 404 ---");
  for (const r of notFound) {
    console.log(`  [${r.phase}] +${r.t}ms ${r.dur}ms ${r.method} ${redact(r.url)}`);
    console.log(`      initiator=${r.initiatorType} :: ${r.frames.slice(0, 4).join("  <-  ") || "(no stack)"}`);
  }
  console.log(`\n  distinct 404 routes: ${new Set(notFound.map(r => redact(r.url))).size}`);
  console.log(`  -> ${OUT_DIR}/${LABEL}.json (redacted)`);
} finally { await browser.close(); }
