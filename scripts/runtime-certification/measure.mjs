/**
 * Runtime certification — measurement primitives.
 *
 * These exist so every surface is measured the SAME way. Each one encodes a mistake this programme
 * actually made; read the comments before writing a new probe.
 */

/**
 * ONE in-page clock. Every milestone is stamped once, against a single `performance.now()` origin.
 *
 * Measuring milestones with sequential `await`s makes each clock start when the PREVIOUS one
 * resolved, so "shell 8 ms, first useful 1 ms" looks impossible and is. Install this before
 * navigation and read the marks once at the end.
 */
export const RECORDER = () => {
    window.__RC__ = { marks: {}, frames: [], mounts: [] };
    const mark = (k) => { if (window.__RC__.marks[k] == null) window.__RC__.marks[k] = Math.round(performance.now()); };
    const tick = () => {
        try {
            const txt = document.body?.innerText ?? "";
            if (document.querySelector("[data-adminv2-workspace-shell]")) mark("shell");
            if (document.querySelectorAll("[role=button]").length > 3) mark("rows");
            const cards = [...document.querySelectorAll("[data-alloy-section-id]")];
            if (cards.length) mark("panelFirstVisible");
            if (cards.some((c) => (c.innerText || "").length > 60)) mark("firstUsefulCard");
            if (txt.length > 1200) mark("useful");
            // A NEW DOM node carrying an id we have already seen is a REMOUNT — the duplicate-card
            // defect was invisible until this was measured by node identity rather than by looks.
            for (const c of cards) {
                if (!c.__rcTag) {
                    c.__rcTag = 1;
                    window.__RC__.mounts.push({ t: Math.round(performance.now()), id: c.getAttribute("data-alloy-section-id") });
                }
            }
            const summary = cards.find((c) => /Summary/i.test(c.getAttribute("data-alloy-section-name") || ""));
            if (summary) {
                const r = summary.getBoundingClientRect();
                window.__RC__.frames.push({ t: Math.round(performance.now()), h: Math.round(r.height), y: Math.round(r.top), sy: Math.round(window.scrollY) });
            }
        } catch { /* a probe must never break the page it measures */ }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
};

/** Arm BEFORE the gesture. An observer installed after the click misses the feedback it measures. */
export const arm = (page) => page.evaluate(() => {
    window.__FB__ = null; window.__T0__ = performance.now();
    const o = new MutationObserver(() => { if (window.__FB__ == null) { window.__FB__ = Math.round(performance.now() - window.__T0__); o.disconnect(); } });
    o.observe(document.body, { childList: true, subtree: true, characterData: true });
    setTimeout(() => o.disconnect(), 15000);
});
export const feedback = (page) => page.evaluate(() => window.__FB__);

/**
 * Poll a predicate IN PAGE. Returns ms, or null.
 *
 * `null` means NOT MEASURED. A selector that does not resolve is a PROBE FAILURE and must never be
 * reported as a latency number — and a predicate that was already true before the gesture is not a
 * measurement either, which is why callers should assert the pre-state.
 */
export async function until(page, fn, budget = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < budget) {
        try { if (await page.evaluate(fn)) return Date.now() - t0; } catch { /* mid-navigation */ }
        await page.waitForTimeout(40);
    }
    return null;
}

/** DOM quiet for `quiet` ms. Returns ms from t0, or null when it never settled inside the budget. */
export async function stable(page, t0, quiet = 1200, budget = 30000) {
    let last = Date.now(), prev = "";
    const dl = Date.now() + budget;
    while (Date.now() < dl) {
        const s = await page.evaluate(() => document.body.innerText.length + ":" + document.body.scrollHeight + ":" + document.querySelectorAll("*").length);
        if (s !== prev) { prev = s; last = Date.now(); } else if (Date.now() - last > quiet) return last - t0;
        await page.waitForTimeout(80);
    }
    return null;
}

/** Resolve a control by predicate; null when it does not resolve (PROBE FAILURE, not zero). */
export const centre = (page, pred) => page.evaluate((p) => {
    const f = new Function("b", "return " + p);
    const el = [...document.querySelectorAll("a,button,[role=button],[role=tab],[role=option]")].find((b) => { try { return f(b); } catch { return false; } });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), txt: (el.innerText || "").trim().slice(0, 30) };
}, pred);

/** Trusted pointer input. `element.click()` cannot reproduce the pointerdown/up defect class. */
export async function realPointer(page, c) {
    await page.mouse.move(c.x, c.y); await page.waitForTimeout(20);
    await page.mouse.down(); await page.waitForTimeout(18); await page.mouse.up();
}

export const docLoads = (page) => page.evaluate(() => performance.getEntriesByType("navigation").length);
export const navTiming = (page) => page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return n ? { ttfb: Math.round(n.responseStart), docEnd: Math.round(n.responseEnd) } : null;
});

export const p = (arr, q) => {
    const v = arr.filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.min(v.length - 1, Math.floor((q / 100) * v.length))] : null;
};

/** Geometry summary for the Focus Panel summary card. */
export function geometry(frames) {
    if (!frames?.length) return null;
    const hs = frames.map((f) => f.h);
    let largest = 0, waves = 0;
    for (let i = 1; i < hs.length; i++) {
        const d = Math.abs(hs[i] - hs[i - 1]);
        if (d > largest) largest = d;
        if (d > 24) waves += 1;
    }
    let neighbourMove = 0;
    for (let i = 1; i < frames.length; i++) neighbourMove += Math.abs(frames[i].y - frames[i - 1].y);
    const lastChange = (() => { for (let i = hs.length - 1; i > 0; i--) if (Math.abs(hs[i] - hs[i - 1]) > 4) return frames[i].t; return frames[0].t; })();
    return {
        initialH: hs[0], finalH: hs.at(-1), maxH: Math.max(...hs), growth: hs.at(-1) - hs[0],
        largestDelta: largest, waves, stableAt: lastChange,
        scrollDisplacement: Math.max(...frames.map((f) => f.sy)) - Math.min(...frames.map((f) => f.sy)),
        neighbourMovement: neighbourMove,
    };
}
