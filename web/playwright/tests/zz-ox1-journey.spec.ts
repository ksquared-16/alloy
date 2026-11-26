import { test } from "@playwright/test";

/**
 * OX SLICE 1 — OPERATOR-EVENT HARNESS.
 *
 * One instrument for all seven journeys, so their numbers are comparable rather than seven
 * bespoke measurements that cannot be put in one table.
 *
 * It records the operator's clock, not the runtime's: T0 is the click, and everything after is
 * the first moment a human could SEE the corresponding state. Server and RSC timings are captured
 * alongside as evidence, never substituted for the operator event.
 *
 * Rather than commit in advance to a selector for each of T1..T5 — which bakes an assumption about
 * where the wait is — this records the FIRST APPEARANCE of a broad probe set plus a full mutation
 * timeline, and the stages are classified afterwards from that record. A selector chosen before
 * measuring is a hypothesis; a timeline is evidence.
 *
 * T5 is operationalised as mutation quiescence: the last DOM mutation before a QUIET_MS gap with
 * no further mutation. Stated explicitly because it is a definition, not a fact.
 */

const QUIET_MS = 2000;

type Journey = {
    id: string;
    startUrl: string;
    /** How the operator expresses intent. Runs in the browser; returns false if unavailable. */
    act: string;
};

const JOURNEYS: Record<string, Journey> = {
    J1: {
        id: "J1 /workspace -> Processing",
        startUrl: "/adminV2/workspace",
        act: `(() => { const b=[...document.querySelectorAll('button')].find(x=>/^Processing/.test((x.getAttribute('aria-label')||x.textContent||'').trim())); if(!b) return false; b.click(); return true; })()`,
    },
    J2: {
        id: "J2 /workspace -> Financials",
        startUrl: "/adminV2/workspace",
        act: `(() => { const b=[...document.querySelectorAll('button')].find(x=>/^Financials/.test((x.getAttribute('aria-label')||x.textContent||'').trim())); if(!b) return false; b.click(); return true; })()`,
    },
    J3: {
        id: "J3 Processing -> Work Unit",
        startUrl: "/adminV2/workspace",
        act: `(() => { const b=[...document.querySelectorAll('button,a')].find(x=>/new.?lead|processing/i.test((x.getAttribute('aria-label')||x.textContent||'').trim())); if(!b) return false; b.click(); return true; })()`,
    },
    J4: {
        id: "J4 Work View A -> Work View B",
        startUrl: "/adminV2/workspace/work-unit/new-leads",
        act: `(() => { const pills=[...document.querySelectorAll('[role="tab"][data-work-view-id]')]; if(pills.length<2) return false; const cur=pills.findIndex(p=>p.getAttribute('aria-selected')==='true'); const next=pills[cur>=0?(cur+1)%pills.length:1]; if(!next) return false; next.click(); return true; })()`,
    },
    J5: {
        id: "J5 queue row A -> queue row B",
        startUrl: "/adminV2/workspace/work-unit/new-leads",
        act: `(() => { const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')]; if(rows.length<2) return false; const cur=rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.getAttribute('data-selected')==='true'||r.className.includes('--selected')); const next=rows[cur>=0?(cur+1)%rows.length:1]; if(!next) return false; next.click(); return true; })()`,
    },
    J6: {
        id: "J6 Focus Panel card -> card detail",
        startUrl: "/adminV2/workspace/work-unit/new-leads",
        act: `(() => { const b=[...document.querySelectorAll('.alloy-os-ucard button,.alloy-os-ucard a')].find(x=>/detail|view|open|manage/i.test((x.getAttribute('aria-label')||x.textContent||'').trim())); if(!b) return false; b.click(); return true; })()`,
    },
    J7: {
        id: "J7 Focus Panel -> Activity",
        startUrl: "/adminV2/workspace/work-unit/new-leads",
        act: `(() => { const b=[...document.querySelectorAll('[data-focus-panel-mode]')].find(x=>/activity/i.test((x.getAttribute('data-focus-panel-mode')||x.textContent||''))); if(!b) return false; b.click(); return true; })()`,
    },
};

test("ox1 journey", async ({ page }) => {
    const key = process.env.OX_JOURNEY || "J1";
    const j = JOURNEYS[key];
    if (!j) throw new Error(`unknown journey ${key}`);
    test.setTimeout(240_000);

    await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        const firstAt: Record<string, number> = {};
        const timeline: Array<{ at: number; added: number; sig: string }> = [];
        let lastMutation = 0;
        let t0 = -1;
        const reqs: Array<{ at: number; end: number; name: string; size: number }> = [];

        // Probe set: structural landmarks, not one committed guess per stage.
        const PROBES: Record<string, string> = {
            bootShell: "[data-alloy-operational-boot-shell]",
            identityLoader: "[data-alloy-identity-loader]",
            surfaceSlot: "[data-surface-slot]",
            wsPresentation: "[data-workspace-presentation]",
            sectionWU00: '[data-alloy-section-id="WU-00"]',
            focusPanel: '[data-alloy-section-id="WU-09"],[data-inline-focus-panel],[data-alloy-os-focus-panel-header="true"]',
            fpHeader: '[data-alloy-os-focus-panel-header="true"]',
            statusChip: '[data-focus-panel-chip-kind="status"]',
            statusChipFilled: '[data-focus-panel-chip-kind="status"]:not([data-focus-panel-chip-reserved="true"])',
            anyCell: ".alloy-os-ucard",
            sixCells: ".alloy-os-ucard",
            queueRow: "[data-queue-row-entity-id],[data-queue-row]",
            selectedRow: '[aria-selected="true"],[data-selected="true"]',
            tabSelected: '[role="tab"][aria-selected="true"]',
            dialog: '[role="dialog"],[data-detail-surface],[data-drawer-open="true"]',
            skeleton: '[data-skeleton],.animate-pulse,[aria-busy="true"]',
            activity: '[data-activity-surface],[data-alloy-section-id="WU-10"],[data-activity-timeline]',
            composer: "textarea,[contenteditable='true']",
            destRow: '[role="dialog"] [role="row"],[role="dialog"] li,[role="dialog"] tbody tr,[data-detail-surface] [role="row"]',
        };

        /*
         * T3 needs CONTENT, not a container. A destination shell with a spinner in it satisfies
         * every structural selector above while telling the operator nothing, so first meaning is
         * probed as substantive text inside the destination region — and separately as text that
         * is not merely the skeleton's own aria labels.
         */
        const destText = (): number | null => {
            /*
             * NO BODY FALLBACK. This originally fell back to document.body when no destination host
             * existed yet, so before the destination opened it measured the SOURCE page's text and
             * reported "first meaning" at +0ms on every journey — an artifact, not a measurement.
             * Absent destination means meaning is UNKNOWN, which is reported as null, never as 0.
             */
            const host = document.querySelector('[role="dialog"],[data-detail-surface]');
            if (!host) return null;
            return (host.textContent ?? "").replace(/\s+/g, " ").trim().length;
        };

        const scan = () => {
            const now = Math.round(performance.now());
            const dt = destText();
            if (dt != null) {
                if (firstAt.destTextV2_any == null && dt > 0) firstAt.destTextV2_any = now;
                if (firstAt.destTextV2_400 == null && dt >= 400) firstAt.destTextV2_400 = now;
                if (firstAt.destTextV2_1500 == null && dt >= 1500) firstAt.destTextV2_1500 = now;
            }
            for (const [k, sel] of Object.entries(PROBES)) {
                if (firstAt[k] != null) continue;
                try {
                    const n = document.querySelectorAll(sel).length;
                    if (k === "sixCells" ? n >= 6 : n >= 1) firstAt[k] = now;
                } catch { /* selector unsupported */ }
            }
        };

        new MutationObserver((recs) => {
            const now = Math.round(performance.now());
            lastMutation = now;
            let added = 0;
            const sigs = new Set<string>();
            for (const r of recs) {
                added += r.addedNodes.length;
                const t = r.target as Element;
                if (t && t.getAttribute) {
                    const s = t.getAttribute("data-alloy-section-id") || t.getAttribute("data-surface-slot")
                        || (t.className && typeof t.className === "string" ? t.className.split(" ")[0] : "");
                    if (s) sigs.add(String(s).slice(0, 40));
                }
            }
            if (t0 >= 0 && timeline.length < 4000) timeline.push({ at: now, added, sig: [...sigs].slice(0, 3).join(",") });
            scan();
        }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });

        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    const r = e as PerformanceResourceTiming;
                    reqs.push({ at: Math.round(r.startTime), end: Math.round(r.responseEnd), name: r.name.split("/").slice(-2).join("/").slice(0, 60), size: r.transferSize || 0 });
                }
            }).observe({ entryTypes: ["resource"] });
        } catch { /* ignore */ }

        w.__ox = {
            firstAt, timeline, reqs,
            get lastMutation() { return lastMutation; },
            arm() { t0 = Math.round(performance.now()); for (const k of Object.keys(firstAt)) delete firstAt[k]; timeline.length = 0; scan(); return t0; },
            get t0() { return t0; },
        };
        scan();
        document.addEventListener("DOMContentLoaded", scan);
    });

    await page.goto(j.startUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // Let the SOURCE surface settle first: these journeys are warm in-app transitions, and
    // measuring from a still-booting source would attribute the source's cost to the destination.
    await page.waitForTimeout(15000);

    const pre = await page.evaluate(() => {
        const w = window as unknown as { __ox: { firstAt: Record<string, number>; lastMutation: number } };
        return { sourceFirstAt: { ...w.__ox.firstAt }, sourceLastMutation: w.__ox.lastMutation,
                 signedOut: !!document.querySelector('input[type="password"]'), url: location.pathname };
    });

    /*
     * HOVER DISCIPLINE. The Processing tile prefetches on mouseenter/focus; Financials has no warm
     * path at all. Clicking without hovering therefore measures a route no mouse operator takes and
     * would understate Processing while leaving Financials unchanged — inventing part of the gap.
     * OX_HOVER=1 dispatches the real pointer sequence first and waits the dwell a human spends
     * between hovering a target and clicking it.
     */
    /*
     * HOVER DISCIPLINE. The Processing tile prefetches on mouseenter/focus (warmProcessingQueueCache
     * + warmProcessingFormsCache); Financials has no warm path at all. Clicking without hovering
     * measures a route no mouse operator takes — it understates Processing while leaving Financials
     * unchanged, inventing part of the very gap this slice is trying to explain.
     *
     * Only journeys with a real warm handler get a hover target, and the target is stated explicitly
     * rather than derived from the click expression: deriving it silently turned "hover" into a
     * second click on the journeys whose click uses a different variable.
     */
    const HOVER_TARGET: Record<string, string> = {
        J1: `[...document.querySelectorAll('button')].find(x=>/^Processing/.test((x.getAttribute('aria-label')||x.textContent||'').trim()))`,
        J2: `[...document.querySelectorAll('button')].find(x=>/^Financials/.test((x.getAttribute('aria-label')||x.textContent||'').trim()))`,
        /*
         * Queue rows bind onPointerEnter -> warmQueueRowOpportunityVm("queue_row_intent"), so a
         * programmatic .click() never fires the warm path and measures a route no pointer operator
         * takes. Without this, J5's cold number would be reported as the operator experience.
         */
        J5: `(() => { const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')]; if(rows.length<2) return null; const cur=rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected')); return rows[cur>=0?(cur+1)%rows.length:1]||null; })()`,
    };
    let hovered: boolean | null = null;
    if (process.env.OX_HOVER === "1") {
        const target = HOVER_TARGET[key];
        hovered = target
            ? ((await page.evaluate(`(() => {
                const el = ${target};
                if (!el) return false;
                for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) {
                    el.dispatchEvent(new MouseEvent(t, { bubbles: true }));
                }
                if (el.focus) el.focus();
                return true;
            })()`)) as boolean)
            : null;
        await page.waitForTimeout(Number(process.env.OX_HOVER_DWELL_MS || 600));
    }

    // T0 — the operator's click.
    const acted = await page.evaluate(`(() => { const w=window.__ox; w.arm(); return ${j.act}; })()`);

    let quietAt = 0;
    if (acted) {
        // Poll for quiescence rather than a fixed wait, so T5 is measured, not assumed.
        for (let i = 0; i < 60; i++) {
            await page.waitForTimeout(1000);
            const r = await page.evaluate(() => {
                const w = window as unknown as { __ox: { lastMutation: number } };
                return { last: w.__ox.lastMutation, now: Math.round(performance.now()) };
            });
            if (r.now - r.last > QUIET_MS) { quietAt = r.last; break; }
        }
    }

    const out = await page.evaluate(() => {
        const w = window as unknown as {
            __ox: { firstAt: Record<string, number>; timeline: Array<{ at: number; added: number; sig: string }>;
                    reqs: Array<{ at: number; end: number; name: string; size: number }>; t0: number; lastMutation: number };
        };
        const ox = w.__ox;
        return {
            t0: ox.t0, firstAt: ox.firstAt, lastMutation: ox.lastMutation,
            url: location.pathname,
            signedOut: !!document.querySelector('input[type="password"]'),
            timelineHead: ox.timeline.slice(0, 40),
            mutationBuckets: (() => {
                const b: Record<string, number> = {};
                for (const e of ox.timeline) { const k = String(Math.floor((e.at - ox.t0) / 250) * 250); b[k] = (b[k] || 0) + e.added; }
                return b;
            })(),
            reqsAfterT0: ox.reqs.filter((r) => r.at >= ox.t0).map((r) => ({ ...r, rel: r.at - ox.t0, dur: r.end - r.at })).slice(0, 40),
        };
    });

    console.log(`[ox] ${JSON.stringify({ journey: process.env.OX_JOURNEY, hover: process.env.OX_HOVER === "1", hovered, acted, quietAt, pre, ...out })}`);
});
