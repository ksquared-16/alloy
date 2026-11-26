/**
 * R5 — count React duplicate-key warnings on the Current Work Activity timeline.
 *
 * ── RUN THIS AGAINST A DEV SERVER ──
 *
 * React STRIPS duplicate-key warnings from production builds. A production run reports zero whether
 * the defect is present or not, so a zero from a production build proves nothing at all. Point this
 * at `next dev`; use a production build only to smoke-test that rows and content are preserved.
 *
 * Env: PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE / R5_SLUG (same contract as the pe3 harnesses).
 * Prints the duplicated key values with subject identifiers redacted.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const SLOT = process.env.PE3_SLOT ?? "5";
const PORT = process.env.PE3_PORT ?? String(3010 + Number(SLOT));
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${PORT}`;
const STORAGE = process.env.PE3_STORAGE ?? join(homedir(), `.local/state/alloy-dev/auth/slot${SLOT}/storage-state.json`);
const SLUG = process.env.R5_SLUG ?? "waitlist";
const LABEL = process.env.R5_LABEL ?? "run";

const redactId = (s) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");

// Local dev only: this drives a workspace journey and must never point at a shared environment.
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
    throw new Error(`refusing to run against a non-local host: ${BASE}`);
}

const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
  const p = await c.newPage();
  const dupes = [];
  p.on("console", async (m) => {
    if (m.type() !== "error" || !/same key/i.test(m.text())) return;
    const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => null)));
    dupes.push(redactId(args.map(String).join(" ⟂ ")).replace(/^.*could change in a future version\.?/s, "KEY:").slice(0, 240));
  });
  const step = async (name, fn, wait = 12000) => {
    const before = dupes.length;
    try { await fn(); } catch (e) { console.log(`  ${name}: ${String(e).slice(0, 60)}`); }
    await p.waitForTimeout(wait);
    console.log(`  ${name.padEnd(24)} duplicate-key warnings: ${dupes.length - before}`);
  };
  await step("1_workspace", async () => {
    await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 120000 });
  }, 20000);
  await step("2_work_unit", async () => {
    await p.locator(`a[href^="/workspace/work-unit/${SLUG}"]`).first().click({ timeout: 20000 });
  }, 18000);
  await step("3_row_switch", async () => {
    const rows = p.locator("[data-entity-id]");
    if (await rows.count() > 1) await rows.nth(1).click({ timeout: 12000 });
  }, 12000);
  await step("4_back_and_return", async () => {
    await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.waitForTimeout(8000);
    await p.locator(`a[href^="/workspace/work-unit/${SLUG}"]`).first().click({ timeout: 20000 });
  }, 14000);

  const tally = {};
  dupes.forEach((d) => { tally[d] = (tally[d] || 0) + 1; });
  console.log(`\n=== ${LABEL}: ${dupes.length} duplicate-key warnings, ${Object.keys(tally).length} distinct keys ===`);
  Object.entries(tally).sort((a, b2) => b2[1] - a[1]).slice(0, 6)
    .forEach(([k, v]) => console.log(`   ${v}×  ${k}`));
} finally { await b.close(); }
