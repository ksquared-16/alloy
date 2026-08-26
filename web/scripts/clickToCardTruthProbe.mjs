/**
 * CLICK TO TRUTHFUL CARD, decomposed by leg.
 *
 * `responseEnd -> truth` is never called "React" here on assumption: the long-task observer, the
 * Focus Panel mutation counter and the reveal-lifecycle buffer each have to say so. On the
 * certification tenant they said the opposite of what was expected — see below.
 *
 * TWO MEASUREMENT TRAPS THIS PROBE EXISTS TO AVOID, both of which produced confidently wrong
 * numbers before they were found:
 *
 *  1. `PE3_CLICK_AT_MS` is measured from the WORKSPACE LOAD, not from the destination links
 *     appearing. Timing it from the links made every "2,100 ms" click actually land at ~4,100 ms —
 *     past the destination prewarm entirely — and the whole click-time sweep read flat at ~370 ms.
 *  2. The settle loop only exits once cells EXIST. Exiting on "every card is truthful" while the
 *     Work Unit had composed nothing reported all five cards truthful at 0 ms.
 *
 * WHAT IT ESTABLISHED (20 trials, quiet host, click at 2,900 ms):
 *   p50 1,048 · p75 1,143 · p90 1,318 · max 1,531 ms
 *   What's Next truthful at 99 ms; the four family-grain cards together at 1,048 ms.
 *   The drawer VM was ISSUED BEFORE THE CLICK in all 20 samples (-366 to -937 ms) and still
 *   finished AFTER it (+305 to +1,047 ms), because the compose itself is ~1,170-1,374 ms.
 *   responseEnd -> truth was 400-484 ms, with ONE Focus Panel commit and ZERO long tasks inside the
 *   window in every sample — so repeated projection, duplicate renders, redundant publication and
 *   main-thread blocking are all ruled out by measurement rather than by argument.
 */
import { BASE, redact, withOperatorPage } from "./pe3HarnessEnv.mjs";

const CARDS = ["current_work", "household", "children", "scheduling", "billing_preview"];
const N = Number(process.env.PE3_N ?? 6);
const MODE = process.env.PE3_MODE ?? "immediate";   // immediate | prepared
const CLICK_AT = Number(process.env.PE3_CLICK_AT_MS ?? (MODE === "prepared" ? 12000 : 2100));

const INSTRUMENT = `
(() => {
  const S = { longTasks: [], mutations: {}, firstMutation: {}, commits: 0 };
  window.__s3 = S;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) S.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }); })
      .observe({ entryTypes: ["longtask"] });
  } catch {}
  const attach = () => {
    const grid = document.querySelector('[data-focus-panel-card-grid]');
    if (grid && S.attached) return true;
    if (grid) S.attached = true;
    if (!grid) return false;
    new MutationObserver((records) => {
      S.commits += 1;
      for (const r of records) {
        let el = r.target instanceof Element ? r.target : r.target.parentElement;
        while (el && !el.hasAttribute?.('data-focus-panel-grid-cell')) el = el.parentElement;
        const k = el?.getAttribute?.('data-focus-panel-grid-cell');
        if (!k) continue;
        S.mutations[k] = (S.mutations[k] ?? 0) + 1;
        if (S.firstMutation[k] === undefined) S.firstMutation[k] = Math.round(performance.now());
      }
    }).observe(grid, { subtree: true, childList: true, characterData: true, attributes: true });
    return true;
  };
  if (!attach()) { const i = setInterval(() => { if (attach()) clearInterval(i); }, 50); setTimeout(() => clearInterval(i), 60000); }
})();
`;

const READ = `(() => {
  const q=(s)=>Array.from(document.querySelectorAll(s));
  const txt=(el)=>(el?(el.textContent||"").replace(/\\s+/g," ").trim():"");
  const cells={};
  q('[data-focus-panel-grid-cell]').forEach((el)=>{const k=el.getAttribute('data-focus-panel-grid-cell');
    cells[k]={len:txt(el).length,sk:Boolean(el.querySelector('[data-testid="inline-focus-panel-skeleton"],.animate-pulse,[aria-busy="true"]'))};});
  return { cells, identity: txt(document.querySelector('#admin-focus-panel-title')),
           reveal: (window.__ALLOY_REVEAL_GATE_DIAG__||[]).slice(-8).map(e=>e.event+"@"+e.t),
           s3: window.__s3 ? { longTasks: window.__s3.longTasks.slice(-40), mutations: {...window.__s3.mutations}, firstMutation: {...window.__s3.firstMutation}, commits: window.__s3.commits } : null }; })()`;

const samples = [];
for (let run = 0; run < N; run += 1) {
  await withOperatorPage(async (page, context) => {
    await context.addInitScript(INSTRUMENT);
    const cdp = await context.newCDPSession(page); await cdp.send("Network.enable");
    const reqs = new Map(); const done = [];
    cdp.on("Network.requestWillBeSent", (e) => { if (e.request.url.startsWith(BASE)) reqs.set(e.requestId, { url: e.request.url, start: Date.now() }); });
    cdp.on("Network.responseReceived", (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.cache = Boolean(e.response.fromDiskCache || e.response.fromPrefetchCache); } });
    const fin = (id, x) => { const r = reqs.get(id); if (!r) return; Object.assign(r, x); r.end = Date.now(); done.push(r); reqs.delete(id); };
    cdp.on("Network.loadingFinished", (e) => fin(e.requestId, {}));
    cdp.on("Network.loadingFailed", (e) => fin(e.requestId, { failed: e.errorText }));

    // CLICK_AT is measured from the WORKSPACE LOAD, not from the links appearing. Timing it from
    // the links made every "2,100 ms" click actually land at ~4,100 ms — past the destination
    // prewarm burst entirely — and the whole sweep read flat because of it.
    const wsT0 = Date.now();
    await page.goto(`${BASE}/workspace`, { waitUntil: "commit", timeout: 120_000 });
    await page.waitForFunction(`document.querySelectorAll('a[href^="/workspace/work-unit/"]').length>0`, { timeout: 90_000 });
    const link = page.locator(`a[href^="/workspace/work-unit/waitlist"]`).first();
    await link.waitFor({ state: "visible", timeout: 20_000 });
    const HOVER = 800;
    const wait = CLICK_AT - (Date.now() - wsT0) - HOVER;
    if (wait > 0) await page.waitForTimeout(wait);
    await link.hover({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(HOVER);
    const clickedAtFromLoad = Date.now() - wsT0;

    const before = await page.evaluate(READ);
    // Truth = the card is present, not a skeleton, and carries more than its own heading. Matching
    // the validated settlement probe: a "changed from baseline" test is meaningless here because
    // /workspace has no Focus Panel cells at all, so every card reads as changed on the first poll.
    const TITLE_SLACK = 24;
    const clickAt = Date.now();
    link.click({ timeout: 15_000, noWaitAfter: true }).catch(() => {});

    const truth = {}; let identityAt = null; let last = null;
    while (Date.now() - clickAt < 12_000) {
      let r; try { r = await page.evaluate(READ); } catch { await page.waitForTimeout(25); continue; }
      const t = Date.now() - clickAt;
      if (identityAt === null && r.identity && r.identity !== before.identity) identityAt = t;
      for (const k of CARDS) {
        const c = r.cells[k]; if (!c) continue;
        if (truth[k] === undefined && !c.sk && c.len > TITLE_SLACK) truth[k] = t;
      }
      last = r;
      // Only a surface that HAS cells can be settled. Without this the loop exits on the first
      // poll, before the Work Unit has composed anything, and reports every card truthful at 0 ms.
      const present = CARDS.filter((k) => r.cells[k]);
      if (present.length >= 4 && present.every((k) => truth[k] !== undefined)) break;
      await page.waitForTimeout(25);
    }

    const rel = (t) => (t == null ? null : t - clickAt);
    const vm = done.filter((r) => /view-models\/drawer\/opportunity\/[^/?]+$/.test(r.url)).sort((a, b) => a.start - b.start).at(-1) ?? null;
    const prov = done.filter((r) => r.url.includes("/provisioning-answer")).sort((a, b) => a.start - b.start);
    const provLast = prov.at(-1) ?? null;
    let serverMs = null;
    if (vm) { try { const body = await page.request.get(vm.url).then((r) => r.json()); serverMs = body?.timing?.compose_ms ?? null; } catch {} }
    const window0 = clickAt, window1 = clickAt + (Math.max(...CARDS.map((k) => truth[k] ?? 0)) || 0);
    const competing = done.filter((r) => r.url.includes("/api/") && r.end > window0 && r.start < window1);
    // Long tasks ONLY inside click -> truth. The observer collects them for the whole page, and
    // counting page-load tasks as click-path work would attribute the interval to the main thread
    // on evidence that has nothing to do with the click.
    const clickPerf = await page.evaluate("performance.now()").catch(() => null);
    const truthMax = Object.keys(truth).length ? Math.max(...Object.values(truth)) : 0;
    const winEnd = clickPerf;                       // now == truth moment (loop just exited)
    const winStart = winEnd != null ? winEnd - truthMax : null;
    const lt = (last?.s3?.longTasks ?? []).filter(
      (x) => x.dur >= 50 && winStart != null && x.start + x.dur >= winStart && x.start <= winEnd,
    );
    samples.push({
      run, mode: MODE, clickedAtFromLoad,
      identityAt,
      provStart: rel(provLast?.start), provEnd: rel(provLast?.end), provCount: prov.length,
      vmStart: rel(vm?.start), vmEnd: rel(vm?.end), vmServerMs: serverMs, vmCached: vm?.cache ?? null,
      truth, allTruth: Object.keys(truth).length ? Math.max(...Object.values(truth)) : null,
      commits: last?.s3?.commits ?? null, mutations: last?.s3?.mutations ?? {},
      longTasksOver50: lt.length, longTaskMs: lt.reduce((a, b) => a + b.dur, 0), maxLongTask: lt.length ? Math.max(...lt.map((x) => x.dur)) : 0,
      competing: competing.length,
      reveal: last?.reveal ?? [],
    });
    const s = samples.at(-1);
    console.log(`  ${MODE} ${run}: click@${s.clickedAtFromLoad} allTruth ${s.allTruth}ms | vm ${s.vmStart}..${s.vmEnd} (server ${s.vmServerMs}) | prov ${s.provStart}..${s.provEnd} x${s.provCount} | commits ${s.commits} | longtask ${s.longTasksOver50}/${s.longTaskMs}ms max ${s.maxLongTask} | competing ${s.competing}`);
  }, { assertFreshBuild: run === 0 });
}

const vals = samples.map((s) => s.allTruth).filter((x) => x != null).sort((a, b) => a - b);
const pct = (p) => vals[Math.min(vals.length - 1, Math.floor((p / 100) * vals.length))];
console.log(`\n=== ${MODE} n=${vals.length} ===`);
console.log(`   raw   ${vals.join(" / ")}`);
console.log(`   p50 ${pct(50)}  p75 ${pct(75)}  p90 ${pct(90)}  max ${vals.at(-1)}`);
console.log(`\n   per-card first truth (median):`);
for (const k of CARDS) { const v = samples.map((s) => s.truth[k]).filter((x) => x != null).sort((a, b) => a - b); if (v.length) console.log(`     ${k.padEnd(16)} ${v[Math.floor(v.length/2)]} ms`); }
console.log(`\n   samples over 1500 ms:`);
for (const s of samples.filter((x) => x.allTruth > 1500)) {
  const clientLeg = s.vmEnd != null ? s.allTruth - s.vmEnd : null;
  console.log(`     run ${s.run}: allTruth ${s.allTruth} | vmIssue ${s.vmStart} | vmServer ${s.vmServerMs} | vmEnd ${s.vmEnd} | responseEnd->truth ${clientLeg} | longtask ${s.longTaskMs}ms | competing ${s.competing} | commits ${s.commits}`);
}
