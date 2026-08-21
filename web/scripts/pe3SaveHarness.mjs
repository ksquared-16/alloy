/**
 * Surface 9 — Save. Uses the sanctioned reversible field: Lennon -> Children drill-in ->
 * Special Instructions (a free-text scalar routed through `identityInlineChildSave`).
 *
 * Captures the ORIGINAL value first, writes a unique probe value, proves persistence across a
 * reload, then restores the original and proves exact restoration. Firefly is left as found.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const PROBE = process.env.PE3_PROBE_VALUE ?? `perf-probe-${Date.now()}`;

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const mutations = [];
p.on("response", async (r) => {
  const m = r.request().method();
  if (m !== "GET" && r.url().includes("/api/")) {
    // Server-side decomposition of the save tail, emitted by the PATCH route.
    const spans = r.headers()["x-alloy-patch-spans"] ?? null;
    mutations.push({ t: Date.now(), status: r.status(), u: r.url().replace(BASE, "").slice(0, 90), spans });
  }
});

async function openDrillIn() {
  await p.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(26000);
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-entity-id]")].map((e) => ({
    id: e.getAttribute("data-entity-id"),
    name: (e.innerText || "").trim().split("\n").map((x) => x.trim()).filter((x) => x.length > 2)[0] })));
  const lennon = rows.find((r) => /Lennon/i.test(r.name || ""));
  await p.locator(`[data-entity-id="${lennon.id}"]`).first().click({ timeout: 15000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => { const el = document.querySelector('[aria-label="View Lennon Kurzman in Children"]'); el?.scrollIntoView({ block: "center" }); el?.click(); });
  await p.waitForTimeout(8000);
}

/** The Edit control whose own field block mentions Special Instructions. */
/**
 * Bound by DOCUMENT ORDER: the first `Edit` that follows the "Special Instructions" label.
 * An ancestor-text walk matched a container holding several fields and returned the WRONG control —
 * the observed mutation went to `/api/admin/persons/…`, a person-scoped field, not the child's.
 */
const siHandle = () => p.evaluateHandle(() => {
  const all = [...document.querySelectorAll("*")];
  // Deepest SHORT element whose text starts with the label — it is not a leaf in this markup.
  let labelIdx = -1;
  for (let i = 0; i < all.length; i++) {
    const t = (all[i].textContent || "").trim();
    if (t.length < 80 && /^special instructions?\b/i.test(t)) labelIdx = i;
  }
  if (labelIdx < 0) return null;
  for (let i = labelIdx + 1; i < all.length; i++) {
    const e = all[i];
    if (e.tagName === "BUTTON" && /^Edit$/i.test((e.innerText || "").trim())) return e;
  }
  return null;
});
/** The line immediately AFTER the "Special Instructions" label in the rendered drill-in. */
const siValue = () => p.evaluate(() => {
  const lines = document.body.innerText.split("\n").map((l) => l.trim());
  const i = lines.findIndex((l) => /^special instructions?$/i.test(l));
  if (i < 0) return null;
  const v = lines[i + 1] ?? null;
  return v === "Edit" ? null : v;
});

await openDrillIn();
const original = await siValue();
console.log(`ORIGINAL Special Instructions: ${JSON.stringify(original)}`);

async function setValue(value, label) {
  const h = await siHandle();
  if (!(await h.evaluate((e) => Boolean(e)))) { console.log("  Special Instructions Edit control not found"); return null; }
  const tEdit = Date.now();
  await h.evaluate((e) => e.click());
  await p.waitForFunction(() => Boolean(document.querySelector("input:focus,textarea:focus")), { timeout: 15000 }).catch(() => {});
  const T_control = Date.now() - tEdit;
  const before = mutations.length;
  /**
   * REAL keystrokes. Setting `el.value` and dispatching `input` does not reach a React controlled
   * input's state — the first attempt did exactly that, committed the UNCHANGED value, and produced
   * a 200 no-op patch whose timings looked like a successful save. Select-all then type.
   */
  await p.keyboard.press("ControlOrMeta+a");
  if (value) await p.keyboard.type(value, { delay: 8 });
  else await p.keyboard.press("Backspace");
  const typed = await p.evaluate(() => document.querySelector("input:focus,textarea:focus")?.value ?? null);
  if (value && typed !== value) { console.log(`  WARN typed value did not stick (saw ${JSON.stringify(typed)})`); }
  const t0 = Date.now();
  await p.keyboard.press("Enter");
  let T_ack = null, T_server = null, T_conv = null;
  for (let i = 0; i < 400; i++) {
    if (T_ack === null) { const editing = await p.evaluate(() => Boolean(document.querySelector("input:focus,textarea:focus"))); if (!editing) T_ack = Date.now() - t0; }
    if (T_server === null && mutations.length > before) T_server = mutations[before].t - t0;
    if (T_conv === null) { const v = await siValue(); if (v && v.includes(value.slice(0, 12))) T_conv = Date.now() - t0; }
    if (T_ack !== null && T_server !== null && T_conv !== null) break;
    await p.waitForTimeout(40);
  }
  console.log(`  ${label}: edit->control ${T_control}ms | T1 ack ${T_ack}ms | T2 server ${T_server}ms | T3 converged ${T_conv}ms | mutations ${JSON.stringify(mutations.slice(before).map((m) => m.status + " " + m.u.split("?")[0]))}`);
  for (const mu of mutations.slice(before)) if (mu.spans) console.log(`    SERVER SPANS: ${mu.spans}`);
  return { T_control, T_ack, T_server, T_conv };
}

console.log(`\n=== WRITE probe value ===`);
await setValue(PROBE, "save");
console.log("\n=== RELOAD proves persistence ===");
const tR = Date.now();
await openDrillIn();
const afterReload = await siValue();
console.log(`  reload agreement ${Date.now() - tR}ms — value now: ${JSON.stringify(afterReload)}  persisted=${Boolean(afterReload && afterReload.includes(PROBE.slice(0, 12)))}`);

console.log("\n=== RESTORE original ===");
await setValue(original && original !== "—" ? original : "", "restore");
console.log("\n=== RELOAD proves exact restoration ===");
await openDrillIn();
const restored = await siValue();
console.log(`  value now: ${JSON.stringify(restored)}  exact_restore=${JSON.stringify(restored) === JSON.stringify(original)}`);
await b.close();
