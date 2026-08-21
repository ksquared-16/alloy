/**
 * Operations workspace — warm-reuse A/B.
 *
 * Distinct from `pe3WorkspaceDataLifecycle.mjs` in one load-bearing way: that harness keys requests
 * by PATH ONLY (`.split("?")[0]`), which made Operations' seven DISTINCT queries — two roster weeks,
 * two roster dates, sites, assignment_roster, assignment_types — look like duplicates of two. Here
 * the FULL URL is the identity, so "reused" and "refetched" can actually be told apart.
 *
 * Reports, per open/close cycle: request count, the exact URL set, and which URLs were re-requested
 * on a later cycle (refreshed) versus served warm (reused). Plus two timings that are the point of
 * the work: click -> modal shell, and click -> the day actually on screen.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const CYCLES = Number(process.env.PE3_CYCLES ?? 4);
const LABEL = process.env.PE3_LABEL ?? "run";

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();

const reqs = [];
p.on("request", (r) => {
  const u = r.url();
  if (u.includes("/api/")) reqs.push(u.replace(BASE, ""));
});

await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(22000);
// Resume is now live: without clearing it this measures whichever section a previous run left
// behind, and the cycle counts would not be comparable between runs.
await p.evaluate(() => window.sessionStorage.clear());

const SHELL = '[data-adminv2-operations-modal="true"]';
const READY = '[data-operations-roster-state="ready"]';

async function openAndTime() {
  const t = await p.evaluate(() => {
    window.__ab = { t0: performance.now(), shell: null, ready: null };
    const check = () => {
      if (window.__ab.shell == null && document.querySelector('[data-adminv2-operations-modal="true"]'))
        window.__ab.shell = Math.round(performance.now() - window.__ab.t0);
      if (window.__ab.ready == null && document.querySelector('[data-operations-roster-state="ready"]'))
        window.__ab.ready = Math.round(performance.now() - window.__ab.t0);
    };
    window.__abObs?.disconnect?.();
    window.__abObs = new MutationObserver(check);
    window.__abObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const el = [...document.querySelectorAll("[aria-label]")].find((e) =>
      /^Operations/i.test(e.getAttribute("aria-label") || ""));
    if (!el) return "NO_NAV";
    el.click();
    check();
    return "clicked";
  });
  if (t === "NO_NAV") throw new Error("Operations nav control not found — harness cannot measure.");
  await p.waitForTimeout(9000);
  return p.evaluate(() => ({ shell: window.__ab.shell, ready: window.__ab.ready }));
}

const cycles = [];
for (let i = 0; i < CYCLES; i++) {
  const n0 = reqs.length;
  const timing = await openAndTime();
  const urls = reqs.slice(n0);
  cycles.push({ urls, timing });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(3000);
}

console.log(`\n=== Operations warm A/B — ${LABEL} ===`);
cycles.forEach((cy, i) => {
  console.log(
    `open#${i + 1}: ${String(cy.urls.length).padStart(2)} requests   shell ${
      cy.timing.shell ?? "—"}ms   day-on-screen ${cy.timing.ready ?? "—"}ms`);
});
const totals = cycles.map((c2) => c2.urls.length);
console.log(`shape: ${JSON.stringify(totals)}`);

const first = new Set(cycles[0].urls);
const later = new Set(cycles.slice(1).flatMap((c2) => c2.urls));
const reused = [...first].filter((u) => !later.has(u));
const refreshed = [...first].filter((u) => later.has(u));
const novel = [...later].filter((u) => !first.has(u));

const short = (u) => u.replace("/api/admin/", "");
console.log(`\nREUSED across reopen (never re-requested)  — ${reused.length}`);
reused.forEach((u) => console.log(`  · ${short(u)}`));
console.log(`REFRESHED on a later open                 — ${refreshed.length}`);
refreshed.forEach((u) => console.log(`  · ${short(u)}`));
if (novel.length) {
  console.log(`ONLY on later opens                       — ${novel.length}`);
  novel.forEach((u) => console.log(`  · ${short(u)}`));
}
await b.close();
