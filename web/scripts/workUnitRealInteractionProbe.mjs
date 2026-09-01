/**
 * Measure the Director's ACTUAL Work Unit interaction: click as soon as the target is actionable,
 * with no hover and no dwell, and observe each Focus Panel card independently.
 *
 * Why this exists: the prior certification clicked at a fixed time chosen late enough that
 * speculative preparation had already finished, so it measured a prepared journey and reported
 * ~987 ms as if it were the operator's experience. A number produced that way cannot see a card
 * that is still skeletal, because it only ever looked after everything had settled.
 *
 * Method. A requestAnimationFrame sampler records, per frame, for EVERY card cell: whether the cell
 * is present, whether it is skeletal, and a fingerprint of its text. Blank/skeleton duration is
 * therefore measured from observed frames rather than inferred from network completion. The click is
 * dispatched without awaiting Playwright actionability, which would otherwise absorb the very
 * transition under test.
 *
 * Truthful, for a card, means: mounted, not skeletal, not an explicit empty/error state, and holding
 * text that differs from the previous row's text for that same card. Stale prior-row content is
 * therefore never scored as truth.
 */
import { BASE, redact, withOperatorPage } from "./pe3HarnessEnv.mjs";

const MODE = process.env.WU_MODE ?? "switch";
const N = Number(process.env.WU_N ?? 10);
const SLUG = process.env.WU_SLUG ?? "waitlist";

{
    let h;
    try { h = new URL(BASE).hostname; } catch { h = null; }
    if (h !== "127.0.0.1" && h !== "localhost" && h !== "::1") {
        throw new Error(`refusing non-local base ${redact(BASE)} — loopback only`);
    }
}

/** Installed once per journey; samples every animation frame until stopped. */
const SAMPLER = `(() => {
  if (window.__wu && window.__wu.raf) cancelAnimationFrame(window.__wu.raf);
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const read = () => {
    const out = {};
    document.querySelectorAll('[data-focus-panel-grid-cell]').forEach((el) => {
      const key = el.getAttribute('data-focus-panel-grid-cell');
      const skeletal = Boolean(el.querySelector('[data-testid="inline-focus-panel-skeleton"],.animate-pulse,[aria-busy="true"]'));
      const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      out[key] = { sk: skeletal, len: text.length, h: hash(text) };
    });
    // Selection is data-queue-row-active. The three selectors this line used to carry
    // (data-selected / aria-selected / .is-selected) match NOTHING in CondensedQueueRow, so selId
    // was silently null on every frame of every journey — a sampler that cannot see the selection
    // cannot tell a switch from a no-op.
    const sel = document.querySelector('[data-entity-id][data-queue-row-active="true"]');
    return { cells: out, selId: sel ? sel.getAttribute('data-entity-id') : null,
             panelCount: document.querySelectorAll('[data-focus-panel-grid-cell]').length };
  };
  window.__wu = { t0: performance.now(), frames: [], raf: 0 };
  const tick = () => { const r = read(); window.__wu.frames.push({ t: performance.now() - window.__wu.t0, ...r }); window.__wu.raf = requestAnimationFrame(tick); };
  tick();
  return true;
})()`;

const STOP = `(() => { if (window.__wu && window.__wu.raf) cancelAnimationFrame(window.__wu.raf); return window.__wu ? window.__wu.frames : []; })()`;

/** Per-card timings relative to the click, using the previous row's fingerprints as the stale baseline. */
function analyse(frames, baseline) {
    const keys = [...new Set(frames.flatMap((f) => Object.keys(f.cells)))];
    const out = {};
    for (const k of keys) {
        const prev = baseline?.[k] ?? null;
        let priorRemoved = null, firstSkeleton = null, truthful = null, blankFrames = 0, missingFrames = 0;
        for (const f of frames) {
            const c = f.cells[k];
            if (!c) { missingFrames++; continue; }
            if (c.sk && firstSkeleton == null) firstSkeleton = f.t;
            if (c.sk || c.len === 0) blankFrames++;
            if (prev && priorRemoved == null && (c.h !== prev.h || c.sk)) priorRemoved = f.t;
            const isNew = !prev || c.h !== prev.h;
            if (truthful == null && !c.sk && c.len > 24 && isNew) truthful = f.t;
        }
        out[k] = {
            prior_removed_ms: priorRemoved == null ? null : Math.round(priorRemoved),
            first_skeleton_ms: firstSkeleton == null ? null : Math.round(firstSkeleton),
            truthful_ms: truthful == null ? null : Math.round(truthful),
            blank_frames: blankFrames,
            missing_frames: missingFrames,
        };
    }
    const selFrame = frames.find((f) => f.selId != null);
    const counts = [...new Set(frames.map((f) => f.panelCount))];
    // A remount shows up as the cell count collapsing to 0 mid-journey and coming back.
    const remount = frames.some((f, i) => i > 0 && f.panelCount === 0 && frames[i - 1].panelCount > 0);
    return { cards: out, selected_row_ms: selFrame ? Math.round(selFrame.t) : null, panel_counts: counts, remount };
}

const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

await withOperatorPage(async (page, context) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    let vmIssue = null, vmEnd = null, vmCount = 0;
    const vmIds = new Map();
    const resetVm = () => { vmIssue = vmEnd = null; vmCount = 0; vmIds.clear(); };
    cdp.on("Network.requestWillBeSent", (e) => {
        if (/view-models\/drawer\/opportunity\/[^/?]+$/.test(e.request.url)) { vmIds.set(e.requestId, 1); vmCount++; if (vmIssue == null) vmIssue = Date.now(); }
    });
    cdp.on("Network.loadingFinished", (e) => { if (vmIds.get(e.requestId) && vmEnd == null) vmEnd = Date.now(); });

    // A. Enter the Workspace and open the Work Unit the moment its link is actionable — no dwell.
    await page.goto(`${BASE}/workspace`, { waitUntil: "commit", timeout: 180_000 });
    await page.waitForFunction(`document.querySelectorAll('a[href^="/workspace/work-unit/"]').length>0`, null, { timeout: 180_000 });
    await page.evaluate(SAMPLER);
    resetVm();
    const tEnter = Date.now();
    await page.evaluate(`(() => { const a=document.querySelector('a[href^="/workspace/work-unit/${SLUG}"]'); if(a) a.click(); })()`);
    await page.waitForFunction(`document.querySelectorAll('[data-focus-panel-grid-cell]').length>=5`, null, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const entryFrames = await page.evaluate(STOP);
    const entry = analyse(entryFrames, null);
    console.log(`\n=== A. FIRST WORK UNIT ENTRY (no dwell) ===`);
    console.log(`  selected-row feedback ${entry.selected_row_ms ?? "—"}ms   panel cell counts ${JSON.stringify(entry.panel_counts)}   remount ${entry.remount}`);
    for (const [k, v] of Object.entries(entry.cards)) {
        console.log(`   ${k.padEnd(16)} truthful ${String(v.truthful_ms ?? "NEVER").padStart(6)}ms  skeleton@${String(v.first_skeleton_ms ?? "—").padStart(5)}  blank_frames ${String(v.blank_frames).padStart(4)}  missing ${v.missing_frames}`);
    }
    console.log(`  drawer VM: issued ${vmIssue ? vmIssue - tEnter : "—"}ms rel click, completed ${vmEnd ? vmEnd - tEnter : "—"}ms, requests ${vmCount}`);

    if (MODE === "entry") return;

    // B. Rapid row switching — no hover, no dwell, alternating near and distant rows.
    await page.waitForTimeout(1500);
    const ids = await page.evaluate(`Array.from(document.querySelectorAll('[data-entity-id]')).map(e=>e.getAttribute('data-entity-id'))`);
    if (ids.length < 2) { console.log(`\n=== B. ROW SWITCHING — only ${ids.length} row(s) present; cannot switch ===`); return; }
    // alternate near/distant: 0,last,1,last-1,...
    const order = [];
    for (let i = 0; i < Math.ceil(N / 2); i++) { order.push(i); order.push(ids.length - 1 - i); }
    const seq = order.filter((i, k) => i >= 0 && i < ids.length && order.indexOf(i) === k).slice(0, N);

    console.log(`\n=== B. RAPID ROW SWITCHING — ${seq.length} switches over ${ids.length} rows, no dwell ===`);
    const per = [];
    let baseline = null;
    {
        const f = await page.evaluate(`(() => { const o={}; document.querySelectorAll('[data-focus-panel-grid-cell]').forEach(el=>{const k=el.getAttribute('data-focus-panel-grid-cell'); const t=(el.textContent||'').replace(/\\s+/g,' ').trim(); let h=0; for(let i=0;i<t.length;i++) h=(h*31+t.charCodeAt(i))|0; o[k]={h,len:t.length,sk:false};}); return o; })()`);
        baseline = f;
    }
    for (const idx of seq) {
        const id = ids[idx];
        await page.evaluate(SAMPLER);
        resetVm();
        const t0 = Date.now();
        await page.evaluate(`(() => { const el=document.querySelector('[data-entity-id="${id}"]'); if(el) el.click(); })()`);
        await page.waitForTimeout(3200);
        const frames = await page.evaluate(STOP);
        const a = analyse(frames, baseline);
        const changed = Object.values(a.cards).some((c) => c.truthful_ms != null);
        per.push({ idx, admissible: changed, ...a, vm_issue: vmIssue ? vmIssue - t0 : null, vm_end: vmEnd ? vmEnd - t0 : null, vm_count: vmCount });
        const cw = a.cards.current_work ?? {};
        console.log(`  row ${String(idx).padStart(2)} ${changed ? "" : "[NO CHANGE] "}sel ${String(a.selected_row_ms ?? "—").padStart(4)}ms  current_work prior_removed ${String(cw.prior_removed_ms ?? "—").padStart(5)} truthful ${String(cw.truthful_ms ?? "NEVER").padStart(6)} blank_frames ${String(cw.blank_frames ?? 0).padStart(4)}  remount ${a.remount}  vm ${vmCount}`);
        // new baseline = the settled state we just reached
        baseline = frames.length ? frames[frames.length - 1].cells : baseline;
    }

    const ok = per.filter((p) => p.admissible);
    console.log(`\n=== SWITCH SUMMARY — ${ok.length}/${per.length} admissible ===`);
    const cardKeys = [...new Set(per.flatMap((p) => Object.keys(p.cards)))];
    for (const k of cardKeys) {
        const t = ok.map((p) => p.cards[k]?.truthful_ms).filter((v) => v != null);
        const never = ok.filter((p) => p.cards[k] && p.cards[k].truthful_ms == null).length;
        const blank = ok.map((p) => p.cards[k]?.blank_frames ?? 0);
        console.log(`   ${k.padEnd(16)} p50 ${String(pct(t, 50) ?? "—").padStart(5)}  p90 ${String(pct(t, 90) ?? "—").padStart(5)}  max ${String(t.length ? Math.max(...t) : "—").padStart(5)}  NEVER-truthful ${never}  max blank frames ${Math.max(0, ...blank)}`);
    }
    const sel = ok.map((p) => p.selected_row_ms).filter((v) => v != null);
    console.log(`   selected-row feedback  p50 ${pct(sel, 50)}  p90 ${pct(sel, 90)}  max ${sel.length ? Math.max(...sel) : "—"}`);
    console.log(`   remounts during switch: ${per.filter((p) => p.remount).length}   drawer VM requests per switch: ${JSON.stringify(per.map((p) => p.vm_count))}`);
}, { assertFreshBuild: process.env.WU_FRESH === "1" });
