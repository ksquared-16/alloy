import { test } from "@playwright/test";

/**
 * OX SLICE 3 — WAS THE REVEAL GATE ACTUALLY ACTIVE WHEN THE NEIGHBOURS FIRED?
 *
 * The contention hypothesis must be proven CAUSALLY before any scheduling change. The runtime
 * already answers this in production: `recordRevealGateEvent` writes begin / end /
 * subject_warm_emitted / subject_warm_suppressed / neighbour_effect into
 * `window.__ALLOY_REVEAL_GATE_DIAG__` with a timestamp and the gate's `active` flag at that
 * instant — deliberately NOT gated on NODE_ENV, precisely so the gate can be proven on the build
 * the measurements run against.
 *
 * So this reads the gate's own timeline across a real row switch and pairs it with the network.
 * If neighbours emitted while `active` was true the gate is broken; if `active` was false the gate
 * simply was not armed for this event; if they were suppressed the hypothesis is already wrong and
 * the contention is somewhere else.
 */
test("ox3 gate trace", async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        const reqs: Array<{ at: number; end: number; path: string }> = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    const r = e as PerformanceResourceTiming;
                    let path = r.name;
                    try { const u = new URL(r.name); path = u.pathname + u.search; } catch { /* raw */ }
                    reqs.push({ at: Math.round(r.startTime), end: Math.round(r.responseEnd), path });
                }
            }).observe({ entryTypes: ["resource"] });
        } catch { /* ignore */ }
        w.__ox3 = { reqs, clickAt: -1 };
    });

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);

    // Pointer intent, then click — the real operator sequence Slice 2 established.
    await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return false;
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        window.__ox3.target = rows[cur>=0?(cur+1)%rows.length:1];
        for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) {
            window.__ox3.target.dispatchEvent(new MouseEvent(t, { bubbles: true }));
        }
        return true;
    })()`);
    await page.waitForTimeout(800);
    await page.evaluate(`(() => {
        window.__ox3.clickAt = Math.round(performance.now());
        window.__ox3.gateAtClick = (window.__ALLOY_REVEAL_GATE_DIAG__||[]).length;
        window.__ox3.target.click();
        return true;
    })()`);
    await page.waitForTimeout(14000);

    const out = await page.evaluate(() => {
        const w = window as unknown as {
            __ox3: { reqs: Array<{ at: number; end: number; path: string }>; clickAt: number; gateAtClick: number };
            __ALLOY_REVEAL_GATE_DIAG__?: Array<{ t: number; event: string; active: boolean; detail?: string }>;
        };
        const { reqs, clickAt } = w.__ox3;
        const gate = (w.__ALLOY_REVEAL_GATE_DIAG__ ?? []).map((g) => ({ ...g, rel: g.t - clickAt }));
        const app = reqs.filter((r) => r.path.startsWith("/api/")).map((r) => ({
            rel: r.at - clickAt, dur: r.end - r.at, path: r.path,
        }));
        const subjectOf = (p: string) => {
            const m = p.match(/subject_id=([0-9a-f-]{36})/) || p.match(/opportunity\/([0-9a-f-]{36})/);
            return m ? m[1] : null;
        };
        const selected = (() => {
            const sel = document.querySelector('[data-alloy-os-focus-panel-header="true"]');
            return sel ? (sel.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60) : null;
        })();
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            gateAvailable: Array.isArray(w.__ALLOY_REVEAL_GATE_DIAG__),
            gateEventsAfterClick: gate.filter((g) => g.rel >= -200).slice(0, 40),
            postClickRequests: app.filter((r) => r.rel >= -50).sort((a, b) => a.rel - b.rel).slice(0, 25)
                .map((r) => ({ ...r, subject: subjectOf(r.path) })),
            selectedHeader: selected,
        };
    });
    console.log(`[gate] ${JSON.stringify(out)}`);
});
