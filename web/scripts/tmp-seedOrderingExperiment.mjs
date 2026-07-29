/**
 * OPTION B ordering experiment — does a page-owned subject seed get registered before the Host
 * consumes it, and does that remove the client's duplicate provisioning compose?
 *
 * The pass criterion is STRUCTURAL, never timing:
 *   - page seed registered BEFORE host consumption (read from the seed/consume trace, not inferred)
 *   - exactly one subject-specific provisioning compose
 *   - zero client provisioning fetch for the displayed subject
 *   - seed subject == visible subject
 *
 * Usage: node scripts/tmp-seedOrderingExperiment.mjs
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const BASE = "http://127.0.0.1:3013";
const SLUG = "lifecycle_wu_lead";
const REAL = "b29921ca-b4d2-4cf4-b26c-2b9bd7263d78";   // Chapmap — on the evaluated page
const ABSENT = "00000000-0000-4000-8000-000000000001"; // well-formed, not a record

const cases = [
  ["bare route            ", `${BASE}/workspace/work-unit/${SLUG}`],
  ["valid subject deeplink", `${BASE}/workspace/work-unit/${SLUG}?subject_id=${REAL}`],
  ["absent subject        ", `${BASE}/workspace/work-unit/${SLUG}?subject_id=${ABSENT}`],
];

const browser = await chromium.launch({ headless: true });

for (const [label, url] of cases) {
  const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  // Arm the seed/consume trace before any app code runs.
  await ctx.addInitScript(() => { try { localStorage.setItem("ALLOY_SEED_TRACE", "1"); } catch {} });

  const provisioningFetches = [];
  page.on("request", (r) => {
    if (r.url().includes("/provisioning-answer")) {
      const u = new URL(r.url());
      provisioningFetches.push(u.searchParams.get("subject_id") ?? "(none)");
    }
  });
  const pageErrs = [];
  page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 100)));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(26000);

  const out = await page.evaluate(() => {
    const panel = document.querySelector("[data-inline-focus-panel]");
    return {
      trace: (window.__alloySeedTrace ?? []).map((e) => ({
        kind: e.kind, t: e.t, subjectInKey: e.subjectInKey, composedSubject: e.composedSubject, terminal: e.terminal,
      })),
      visibleSubject: panel?.getAttribute("data-inline-focus-panel-subject") ?? null,
      operational: panel?.getAttribute("data-focus-panel-operational") ?? null,
      cards: document.querySelectorAll("[data-card-role]").length,
      body: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 120),
    };
  });

  const seeds = out.trace.filter((e) => e.kind === "seed");
  const hits = out.trace.filter((e) => e.kind === "consume-hit");
  const misses = out.trace.filter((e) => e.kind === "consume-miss");
  const subjSeed = seeds.find((s) => s.subjectInKey);
  const subjHit = hits.find((h) => h.subjectInKey);

  console.log(`\n### ${label}`);
  console.log(`  trace (${out.trace.length} events):`);
  out.trace.forEach((e) => console.log(`     ${String(e.t).padStart(6)}ms ${e.kind.padEnd(13)} key.subject=${String(e.subjectInKey).slice(0, 12).padEnd(12)} composed=${String(e.composedSubject).slice(0, 12)} terminal=${e.terminal}`));
  console.log(`  seeds=${seeds.length} consume-hit=${hits.length} consume-miss=${misses.length}`);
  console.log(`  subject-keyed seed BEFORE its consume-hit: ${subjSeed && subjHit ? (subjSeed.t <= subjHit.t ? `YES (${subjSeed.t}ms <= ${subjHit.t}ms)` : `NO (${subjSeed.t}ms > ${subjHit.t}ms)`) : "n/a"}`);
  console.log(`  client provisioning fetches: ${provisioningFetches.length} -> subjects ${JSON.stringify(provisioningFetches.slice(0, 6))}`);
  console.log(`  visible subject: ${out.visibleSubject}  operational=${out.operational}  cards=${out.cards}`);
  console.log(`  page errors: ${pageErrs.length} ${pageErrs.slice(0, 1)}`);
  if (out.cards === 0) console.log(`  body: ${out.body}`);
  await ctx.close();
}
await browser.close();
