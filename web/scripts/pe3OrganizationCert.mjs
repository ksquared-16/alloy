/**
 * /organization operator certification.
 *
 * These are ROUTE navigations, not modals, so the question is not only "did it paint" but whether
 * /organization behaves as ONE runtime: does the shell survive, do controls arrive with the page or
 * after it, and does any page blank while its siblings do not.
 *
 *   T1 acknowledgement   first DOM mutation after the nav click
 *   T2 committed         pathname is the target AND a main region is present
 *   T3 controls usable   the page carries interactive controls that were not on the previous page
 *   T4 secondary quiet   no /api/ request for 1.2s
 *
 * Consistency signals per page: whether the shell NODE survived (a remount is a different node),
 * whether main content blanked mid-transition, request count, and console errors.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const errors = [];
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 100)); });
const reqs = [];
p.on("request", (r) => { if (r.url().includes("/api/")) reqs.push({ u: r.url().replace(BASE, ""), t: Date.now() }); });

await p.goto(`${BASE}/organization`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(20000);

const links = await p.evaluate(() =>
  [...document.querySelectorAll('a[href^="/organization/"]')]
    .map((a) => ({ href: a.getAttribute("href"), label: (a.textContent || "").trim().slice(0, 28) }))
    .filter((l, i, arr) => l.href && arr.findIndex((x) => x.href === l.href) === i));
console.log(`nav links discovered: ${links.length}`);
console.log(links.map((l) => `${l.label}→${l.href}`).join("\n"));

/*
 * The Organization sidebar is CONTEXTUAL — its links change once you are inside a page — so every
 * target is approached from `/organization` and the hrefs are taken from what the home page
 * actually offers. Hard-coding segments measured a link that was not there and reported `clicked:
 * false`, which is a harness miss, not a product result.
 */
const pick = (pred) => links.find(pred);
const targets = [
  { label: "Surfaces", href: "/organization/surfaces" },
  { label: "Locations", href: pick((l) => l.href.startsWith("/organization/locations"))?.href ?? "/organization/locations" },
  { label: "Access", href: "/organization/access" },
  { label: "Processes", href: "/organization/processes" },
  { label: "Data Model", href: "/organization/data-model?section=entities" },
  { label: "Statuses", href: "/organization/data-model?section=statuses" },
].filter((t) => t.href);

/** Always start from the Organization home so the contextual sidebar offers every link. */
async function goHome() {
  if (new URL(p.url()).pathname !== "/organization") {
    await p.goto(`${BASE}/organization`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(6000);
  }
}

async function navigate(target) {
  const errs0 = errors.length, n0 = reqs.length, t0 = Date.now();
  const res = await p.evaluate(async ({ href }) => {
    const main = () => document.querySelector("main") ?? document.body;
    const shell = document.querySelector("nav, [data-adminv2-settings-shell], aside");
    const controlCensus = (el) => new Set([...(el?.querySelectorAll("button,input,select,textarea,a[href]") ?? [])]
      .map((n, i) => `${n.tagName}:${(n.textContent || "").trim().slice(0, 20)}:${i}`));
    const baseControls = controlCensus(main());
    const m = { t1: null, t2: null, t3: null, last: null, minChars: Infinity, blanked: false };
    const start = performance.now();
    const now = () => Math.round(performance.now() - start);
    const check = () => {
      m.last = now();
      if (m.t1 == null) m.t1 = now();
      const el = main();
      const chars = (el?.innerText || "").trim().length;
      if (chars < m.minChars) m.minChars = chars;
      if (chars < 80) m.blanked = true;
      const wantPath = href.split("?")[0];
      if (m.t2 == null && location.pathname === wantPath && el) m.t2 = now();
      if (m.t3 == null && m.t2 != null) {
        const cur = controlCensus(el);
        let fresh = 0;
        for (const k of cur) if (!baseControls.has(k)) fresh++;
        if (fresh >= 3 && chars > 200) m.t3 = now();
      }
    };
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const a = [...document.querySelectorAll('a[href^="/organization/"]')].find((x) => x.getAttribute("href") === href);
    if (a) a.click(); else { obs.disconnect(); return { clicked: false, missing: true }; }
    check();
    await new Promise((r) => setTimeout(r, 11000));
    obs.disconnect();
    const shellNow = document.querySelector("nav, [data-adminv2-settings-shell], aside");
    return { clicked: true, ...m, shellSurvived: shell === shellNow && shell != null,
             path: location.pathname, chars: (main()?.innerText || "").trim().length };
  }, { href: target.href });

  const during = reqs.slice(n0);
  const last = during.length ? during[during.length - 1].t - t0 : null;
  return { label: target.label, href: target.href, ...res,
           reqCount: during.length, lastReqMs: last, errs: errors.length - errs0 };
}

const rows = [];
for (const t of targets) {
  await goHome();
  rows.push(await navigate(t));
  await p.waitForTimeout(1200);
}
// WARM REVISIT of the first target — same route, second time.
await goHome();
const warm = targets.length ? await navigate(targets[0]) : null;

console.log("\n" + "═".repeat(118));
console.log("page           click  T1     T2     T3     lastReq  reqs  shell  blanked  chars  err  path-ok");
console.log("═".repeat(118));
const f = (v) => String(v ?? "—").padStart(5);
for (const r of [...rows, warm && { ...warm, label: `${warm.label} (warm)` }].filter(Boolean)) {
  console.log(`${String(r.label).padEnd(14)} ${String(r.clicked).padEnd(5)} ${f(r.t1)} ${f(r.t2)} ${f(r.t3)} ${f(r.lastReqMs).padStart(7)}  ${String(r.reqCount).padStart(3)}  ` +
    `${String(r.shellSurvived).padEnd(5)}  ${String(r.blanked).padEnd(7)} ${String(r.chars).padStart(5)}  ${String(r.errs).padStart(3)}  ${r.path === r.href}`);
}
await b.close();
