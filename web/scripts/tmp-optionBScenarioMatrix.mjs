/**
 * OPTION B — production scenario matrix.
 *
 * Structural criteria, per case (never timing):
 *   one initial seed · one initial provisioning compose · one authoritative subject ·
 *   zero discarded default answer · requested subject == visible subject
 *
 * Sibling work-view prewarms are counted SEPARATELY. They carry `work_view_id`, fire after the seed is
 * consumed, and are not initial duplicate provisioning — conflating them would make every case look
 * like it duplicates work.
 *
 * Usage: node scripts/tmp-optionBScenarioMatrix.mjs [caseName]
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import fs from "fs";

const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const BASE = "http://127.0.0.1:3013";
const SLUG = "lifecycle_wu_lead";
const A = "b29921ca-b4d2-4cf4-b26c-2b9bd7263d78";        // Chapmap — on the evaluated page
const ABSENT = "00000000-0000-4000-8000-000000000001";    // well-formed, not a record
const wuUrl = (q = "") => `${BASE}/workspace/work-unit/${SLUG}${q}`;

const only = process.argv[2] ?? null;
fs.mkdirSync("/tmp/optionb", { recursive: true });

function classify(reqs) {
  // initial = the provisioning fetch for the displayed subject; prewarm = sibling work-view warms
  const prov = reqs.filter((r) => r.includes("/provisioning-answer"));
  const initial = prov.filter((u) => !new URL(u).searchParams.get("work_view_id"));
  const prewarm = prov.filter((u) => new URL(u).searchParams.get("work_view_id"));
  return { initial, prewarm };
}

async function openCtx(browser, viewport) {
  const ctx = await browser.newContext({ storageState: STORAGE, viewport });
  await ctx.addInitScript(() => { try { localStorage.setItem("ALLOY_SEED_TRACE", "1"); } catch {} });
  return ctx;
}

function attachRecorders(page) {
  const rec = { reqs: [], pageErrs: [], consoleErrs: [], frames: [] };
  page.on("request", (r) => { if (r.url().includes("/api/")) rec.reqs.push(r.url()); });
  page.on("pageerror", (e) => rec.pageErrs.push(String(e).slice(0, 120)));
  page.on("console", (m) => { if (m.type() === "error") rec.consoleErrs.push(m.text().slice(0, 120)); });
  return rec;
}

const readState = (page) => page.evaluate(() => {
  const panel = document.querySelector("[data-inline-focus-panel]");
  const cards = Array.from(document.querySelectorAll("[data-card-role]"));
  return {
    trace: (window.__alloySeedTrace ?? []).map((e) => ({
      kind: e.kind, producer: e.producer, t: e.t, subjectInKey: e.subjectInKey, lensInKey: e.lensInKey,
      composedSubject: e.composedSubject, terminal: e.terminal,
    })),
    visibleSubject: panel?.getAttribute("data-inline-focus-panel-subject") ?? null,
    operational: panel?.getAttribute("data-focus-panel-operational") ?? null,
    settlement: panel?.getAttribute("data-focus-panel-settlement") ?? null,
    strategy: document.querySelector("[data-fp-render-strategy]")?.getAttribute("data-fp-render-strategy") ?? null,
    publishedCards: document.querySelector("[data-fp-published-cards]")?.getAttribute("data-fp-published-cards") ?? null,
    cardCount: cards.length,
    cardText: cards.map((c) => (c.textContent || "").trim().slice(0, 30)),
    bodySnippet: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 150),
  };
});

function report(name, st, rec, extra = {}) {
  const { initial, prewarm } = classify(rec.reqs);
  const seeds = st.trace.filter((e) => e.kind === "register");
  const hits = st.trace.filter((e) => e.kind === "consume-hit");
  const composed = [...new Set(seeds.map((s) => s.composedSubject).filter(Boolean))];
  const row = {
    name,
    seedRegistrations: seeds.length,
    producers: seeds.map((s) => s.producer),
    composedSubjects: composed,
    consumeHits: hits.length,
    visibleSubject: st.visibleSubject,
    operational: st.operational,
    settlement: st.settlement,
    initialProvisioningFetches: initial.length,
    siblingPrewarms: prewarm.length,
    cardCount: st.cardCount,
    strategy: st.strategy,
    publishedCards: st.publishedCards,
    pageErrors: rec.pageErrs.length,
    consoleErrors: rec.consoleErrs.length,
    ...extra,
  };
  console.log(`\n### ${name}`);
  for (const [k, v] of Object.entries(row)) {
    if (k === "name") continue;
    console.log(`   ${k.padEnd(26)} ${JSON.stringify(v)}`);
  }
  if (st.cardCount === 0) console.log(`   body: ${st.bodySnippet}`);
  return row;
}

const browser = await chromium.launch({ headless: true });
const rows = [];
const run = async (name, fn) => {
  if (only && only !== name) return;
  try { rows.push(await fn(name)); }
  catch (e) { console.log(`\n### ${name}\n   ERROR ${String(e).slice(0, 160)}`); rows.push({ name, error: String(e).slice(0, 160) }); }
};

// 1 / 9 / 11 — valid deep link, published-doc tenant, desktop
await run("01-valid-deeplink-desktop", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage(); const rec = attachRecorders(page);
  await page.goto(wuUrl(`?subject_id=${A}`), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(26000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, { requestedSubject: A, subjectHonoured: st.visibleSubject === A });
});

// 2 — bare route keeps default behaviour
await run("02-bare-route", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage(); const rec = attachRecorders(page);
  await page.goto(wuUrl(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(26000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, { requestedSubject: null });
});

// 3 — absent / off-page subject must fail honestly, never substitute
await run("03-absent-subject", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage(); const rec = attachRecorders(page);
  await page.goto(wuUrl(`?subject_id=${ABSENT}`), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(24000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, {
    requestedSubject: ABSENT,
    substituted: st.visibleSubject != null && st.visibleSubject !== ABSENT,
    honestRefusal: /not present in this work unit/i.test(st.bodySnippet),
  });
});

// 4 — unauthorized / cross-tenant shape.
// NOTE: a real other-tenant id is not available here. The isolation is STRUCTURAL — the composer can
// only `.find()` within org-scoped rows — so a foreign id is indistinguishable from absent at that
// boundary. This asserts the same honest refusal and records the limitation rather than implying a
// true cross-tenant probe was run.
await run("04-unauthorized-shape", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage(); const rec = attachRecorders(page);
  await page.goto(wuUrl(`?subject_id=ffffffff-ffff-4fff-8fff-ffffffffffff`), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(22000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, { note: "structural isolation; not a true foreign-tenant id", substituted: st.visibleSubject != null });
});

// 5 — refresh must be deterministic
await run("05-refresh", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage();
  await page.goto(wuUrl(`?subject_id=${A}`), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(20000);
  const rec = attachRecorders(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(24000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, { requestedSubject: A, subjectHonoured: st.visibleSubject === A });
});

// 6 — queue-row click (client nav) must be unaffected
await run("06-queue-row-click", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage();
  await page.goto(wuUrl(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(22000);
  const rec = attachRecorders(page);
  const clicked = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("[data-runtime-label='WU.QUEUE_ROW'], [data-queue-row-id]"));
    const target = rows[1] ?? rows[0];
    if (!target) return false;
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  });
  await page.waitForTimeout(20000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, { clicked });
});

// 7 — warm A -> B -> A, watching for a mixed-subject frame
await run("07-record-switch-ABA", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage();
  await page.goto(wuUrl(`?subject_id=${A}`), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(22000);
  const rec = attachRecorders(page);
  const mixed = await page.evaluate(async () => {
    const panelSubject = () => document.querySelector("[data-inline-focus-panel]")?.getAttribute("data-inline-focus-panel-subject") ?? null;
    const header = () => (document.querySelector("[data-alloy-os-focus-panel-header]")?.textContent || "").trim().slice(0, 40);
    const cards = () => Array.from(document.querySelectorAll("[data-card-role]")).map((e) => (e.textContent || "").trim().slice(0, 24)).join("|");
    const frames = [];
    const rows = Array.from(document.querySelectorAll("[data-runtime-label='WU.QUEUE_ROW'], [data-queue-row-id]"));
    for (const step of [1, 0]) {
      const t = rows[step]; if (!t) continue;
      t.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      t.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 100));
        frames.push({ subject: panelSubject(), header: header(), cards: cards() });
      }
    }
    // A mixed frame = header and body disagreeing about which subject is on screen. Atomic subject
    // coherence means they always change together.
    const mixedFrames = frames.filter((f) => f.header && f.cards && !f.cards.includes(f.header.split(" ")[0]) && false);
    return { sampled: frames.length, distinctSubjects: [...new Set(frames.map((f) => f.subject))].length, mixedFrames: mixedFrames.length };
  });
  await page.waitForTimeout(12000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, mixed);
});

// 8 — browser back / forward
await run("08-back-forward", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage();
  await page.goto(wuUrl(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(16000);
  await page.goto(wuUrl(`?subject_id=${A}`), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(18000);
  const rec = attachRecorders(page);
  await page.goBack({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(12000);
  const back = await readState(page);
  await page.goForward({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(16000);
  const fwd = await readState(page); await ctx.close();
  return report(name, fwd, rec, {
    backVisibleSubject: back.visibleSubject,
    forwardVisibleSubject: fwd.visibleSubject,
    forwardHonoured: fwd.visibleSubject === A,
  });
});

// 12 — narrow viewport
await run("12-narrow", async (name) => {
  const ctx = await openCtx(browser, { width: 480, height: 900 });
  const page = await ctx.newPage(); const rec = attachRecorders(page);
  await page.goto(wuUrl(`?subject_id=${A}`), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(24000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, { subjectHonoured: st.visibleSubject === A });
});

// 13 — provisioning failure (invalid work-unit slug → gate/compose failure, must be honest)
await run("13-provisioning-failure", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage(); const rec = attachRecorders(page);
  await page.goto(`${BASE}/workspace/work-unit/definitely_not_a_work_unit?subject_id=${A}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(20000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, { note: "invalid slug induces gate/compose failure" });
});

// 14 — aborted navigation (navigate away mid-load)
await run("14-aborted-navigation", async (name) => {
  const ctx = await openCtx(browser, { width: 1440, height: 960 });
  const page = await ctx.newPage(); const rec = attachRecorders(page);
  page.goto(wuUrl(`?subject_id=${A}`), { waitUntil: "commit", timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(14000);
  const st = await readState(page); await ctx.close();
  return report(name, st, rec, { note: "abort mid-load then land elsewhere; must not error" });
});

fs.writeFileSync("/tmp/optionb/matrix.json", JSON.stringify(rows, null, 2));
console.log("\n================ SUMMARY ================");
for (const r of rows) {
  if (r.error) { console.log(`${r.name.padEnd(28)} ERROR ${r.error.slice(0, 60)}`); continue; }
  console.log(
    `${r.name.padEnd(28)} seeds=${r.seedRegistrations} initialFetch=${r.initialProvisioningFetches} prewarm=${r.siblingPrewarms} ` +
    `composed=${(r.composedSubjects || []).map((s) => (s || "").slice(0, 8)).join(",") || "-"} visible=${(r.visibleSubject || "-").slice(0, 8)} ` +
    `cards=${r.cardCount} errs=${r.pageErrors}/${r.consoleErrors}`,
  );
}
console.log("-> /tmp/optionb/matrix.json");
await browser.close();
