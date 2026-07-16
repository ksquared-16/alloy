/**
 * ALLOY RUNTIME CERTIFICATION — the permanent K4 harness.
 *
 * Governing: docs/platform/runtime/runtime-realization-architecture.md (Constitution, frozen)
 *            docs/platform/runtime/alloy-runtime-kernel.md (Kernel: K1 K2 K3 K4)
 *            docs/platform/runtime/runtime-implementation-authorization.md (ratified contracts + budgets)
 *
 * THIS HARNESS GRADES THE OPERATOR, NOT THE MACHINE.
 *
 * It measures Operational Commit as the ratified Work Unit Operational Contract (U-O1…U-O5) becoming
 * true in the rendered world — NOT as a readiness attribute, a request finishing, or a spinner
 * disappearing. A harness keyed to `data-surface-ready` would pass a runtime that reveals a hollow
 * Work Unit; that is precisely the failure this harness exists to catch (Spec §7.5).
 *
 * DESTRUCTIVE BY OBLIGATION (Authorization Part 9 §6): this harness MUST fail the pre-migration
 * runtime. If it passes the current runtime, it is invalid and its results are void.
 *
 * Run (authenticated, production build):
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3013 \
 *   PLAYWRIGHT_STORAGE_STATE=<slot storage-state.json> \
 *   WU_SLUG_A=new-leads npx playwright test playwright/tests/runtime-certification.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";

const STORAGE_STATE = process.env.PLAYWRIGHT_STORAGE_STATE;
if (STORAGE_STATE) test.use({ storageState: STORAGE_STATE });
const WU = process.env.WU_SLUG_A || "new-leads";
const EV = process.env.RC_EVIDENCE_DIR || "/tmp/rc-cert";
/** Set to "1" to assert the ratified budgets (the target). Unset = measure-and-report (baseline). */
const ENFORCE = process.env.RC_ENFORCE === "1";

/** Ratified operator budgets — Authorization Part 8.3. */
const BUDGET = {
    acknowledgment_ms: 50,
    transition_legibility_ms: 100,
    visible_construction_ms: 0,
    continuity_breaks: 0,
    operational_commit_ms_cold_p75: 800,
    operational_commit_ms_warm: 100,
    false_empty_count: 0,
    surface_reconstruction_count: 0,
    superseded_result_violations: 0,
    settlement_reflow: 0,
    critical_path_duplicate_requests: 0,
};

/** Single-ownership presentation labels (doctrine: one label = one component). */
const L = {
    wsSurface: '[data-runtime-label="WS.SURFACE"]',
    wuSurface: '[data-runtime-label="WU.SURFACE"]',
    wuHeader: '[data-runtime-label="WU.HEADER"]',
    pills: '[data-runtime-label="WU.WORK_VIEW_PILLS"]',
    queue: '[data-runtime-label="WU.QUEUE"]',
    queueRow: '[data-runtime-label="WU.QUEUE_ROW"]',
    focusPanel: '[data-runtime-label="FP.SURFACE"]',
};

type Cert = {
    t0: number | null;
    acknowledgment_ms: number | null;
    transition_legibility_ms: number | null;
    operational_commit_ms: number | null;
    visible_construction_ms: number;
    continuity_breaks: number;
    blank_frames: number;
    false_empty_count: number;
    surface_reconstruction_count: number;
    attention_focus_divergence_ms: number | null;
    settlement_reflow: number;
    frames: number;
    operational_at_first_sight: boolean | null;
    wu_first_seen_ms: number | null;
    contract: Record<string, boolean>;
    timeline: Array<{ t: number; e: string }>;
};

/**
 * The in-page instrument. Installed immediately before the operator gesture.
 * The Operational predicate below IS the ratified contract — change it only when the contract changes.
 */
async function install(page: Page, sel: typeof L) {
    await page.evaluate((S) => {
        const w = window as unknown as Record<string, unknown>;
        const m: Cert = {
            t0: null, acknowledgment_ms: null, transition_legibility_ms: null,
            operational_commit_ms: null, visible_construction_ms: 0, continuity_breaks: 0,
            blank_frames: 0, false_empty_count: 0, surface_reconstruction_count: 0,
            attention_focus_divergence_ms: null, settlement_reflow: 0, frames: 0,
            operational_at_first_sight: null, wu_first_seen_ms: null,
            contract: {}, timeline: [],
        } as unknown as Cert;
        w.__cert = m;
        const now = () => performance.now();
        const log = (e: string) => m.timeline.push({ t: Math.round(now() - (m.t0 ?? 0)), e });
        const txt = (el: Element | null) => (el?.textContent || "").replace(/\s+/g, " ").trim();
        const skeletonIn = (el: Element | null) =>
            !!el?.querySelector('[aria-busy="true"], [class*="animate-pulse"]');

        // ── THE RATIFIED WORK UNIT OPERATIONAL CONTRACT (U-O1…U-O5) ──────────────────────
        const operational = () => {
            const wu = document.querySelector(S.wuSurface);
            if (!wu) return { ok: false, c: {} as Record<string, boolean> };
            const header = wu.querySelector(S.wuHeader);
            const pills = wu.querySelector(S.pills);
            const queue = wu.querySelector(S.queue);
            const fp = wu.querySelector(S.focusPanel);
            const rows = wu.querySelectorAll(S.queueRow);
            const queueText = txt(queue);
            const fpText = txt(fp);

            // U-O1 orientation: header identity present and not a skeleton; a lens is indicated.
            const uo1 = !!header && txt(header).length > 3 && !skeletonIn(header) && !!pills && txt(pills).length > 0;
            // U-O2 queue truth: real rows, OR an authoritative empty/error (never "not yet").
            const authoritativeEmptyOrError =
                !!queue && !skeletonIn(queue) && /no |none|empty|nothing|error|failed/i.test(queueText) && queueText.length > 0;
            const uo2 = (rows.length > 0 && !skeletonIn(queue)) || authoritativeEmptyOrError;
            // U-O3 subject committed: the Focus Panel names a subject.
            const uo3 = !!fp && fpText.length > 3 && !/select a record to begin/i.test(fpText);
            // U-O4 current business state present (NOT identity alone — a hollow panel is not Operational).
            const uo4 = !!fp && !skeletonIn(fp) && /current work|blocked|open|overdue|progress|requirement|state/i.test(fpText);
            // U-O5 primary action reachable: an enabled control inside the Focus Panel.
            const uo5 = !!fp && [...fp.querySelectorAll("button,[role=button]")].some(
                (b) => !(b as HTMLButtonElement).disabled && txt(b).length > 0,
            );
            const c = { uo1, uo2, uo3, uo4, uo5 };
            // Authoritative-empty short-circuit: an empty lens is Operational without a subject.
            const ok = uo1 && (authoritativeEmptyOrError || (uo2 && uo3 && uo4 && uo5));
            return { ok, c };
        };

        // ── Layout-shift after commit (settlement reflow) ──
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
                    if (!e.hadRecentInput && m.operational_commit_ms != null && e.value > 0.001) m.settlement_reflow += 1;
                }
            }).observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
        } catch { /* unsupported */ }

        let lastWs: Element | null = null, lastWu: Element | null = null;
        const visibleRoot = () =>
            document.querySelector('[data-surface-slot="outgoing"]') ||
            document.querySelector('[data-surface-slot="current"]') ||
            document.querySelector(S.wuSurface) ||
            document.querySelector(S.wsSurface);

        const tick = () => {
            if (m.t0 == null) return;
            const t = now() - m.t0;
            m.frames++;
            const ws = document.querySelector(S.wsSurface);
            const wu = document.querySelector(S.wuSurface);
            const root = visibleRoot();

            // continuity: a frame where the operator sees neither surface
            if (!ws && !wu) { m.blank_frames++; m.continuity_breaks++; }
            // surface reconstruction: instance identity changed
            if (ws && lastWs && ws !== lastWs) { m.surface_reconstruction_count++; m.continuity_breaks++; log("RECONSTRUCT ws"); }
            if (wu && lastWu && wu !== lastWu) { m.surface_reconstruction_count++; m.continuity_breaks++; log("RECONSTRUCT wu"); }
            if (ws) lastWs = ws; if (wu) lastWu = wu;

            // VISIBLE CONSTRUCTION: the operator can see the application assembling itself.
            if (root && skeletonIn(root)) m.visible_construction_ms += 16;

            // The Work Unit becoming visible at all — and whether it was Operational at first sight.
            if (wu && m.wu_first_seen_ms == null) {
                m.wu_first_seen_ms = t;
                const o = operational();
                m.operational_at_first_sight = o.ok;
                log(`WU_FIRST_SEEN operational=${o.ok}`);
            }
            // OPERATIONAL COMMIT — the ratified contract becomes true.
            if (m.operational_commit_ms == null) {
                const o = operational();
                if (o.ok) {
                    m.operational_commit_ms = t;
                    m.contract = o.c;
                    m.attention_focus_divergence_ms = t;
                    log("OPERATIONAL_COMMIT");
                }
            }
            // False empty: an "empty" while a non-authoritative load is still in flight.
            const q = document.querySelector(S.queue);
            if (q && /no records|nothing here|0 results/i.test(txt(q)) && skeletonIn(q)) m.false_empty_count++;

            requestAnimationFrame(tick);
        };

        // Transition legibility: the first visible change ANYWHERE in the operational surface after intent.
        w.__certArm = (rowSel: string) => {
            const el = document.querySelector(rowSel) as HTMLElement | null;
            if (!el) return false;
            const sig = () => { const c = getComputedStyle(el); return `${c.backgroundColor}|${c.boxShadow}|${c.borderColor}|${c.opacity}`; };
            const rootSig = () => { const r = visibleRoot() as HTMLElement | null; if (!r) return ""; const c = getComputedStyle(r); return `${c.opacity}|${c.transform}|${c.filter}`; };
            let baseRow = sig(), baseRoot = rootSig();
            const ackTick = () => {
                if (m.t0 == null) return;
                if (m.acknowledgment_ms == null && sig() !== baseRow) { m.acknowledgment_ms = now() - m.t0; log("ACK"); }
                if (m.transition_legibility_ms == null && rootSig() !== baseRoot) { m.transition_legibility_ms = now() - m.t0; log("LEGIBLE"); }
                if (m.acknowledgment_ms != null && m.transition_legibility_ms != null) return;
                requestAnimationFrame(ackTick);
            };
            el.addEventListener("pointerdown", () => {
                if (m.t0 != null) return;
                baseRow = sig(); baseRoot = rootSig();
                m.t0 = now(); log("INTENT");
                requestAnimationFrame(tick); requestAnimationFrame(ackTick);
            }, { capture: true, once: true });
            return true;
        };
    }, sel);
}

const read = (page: Page) => page.evaluate(() => (window as unknown as { __cert: Cert }).__cert);

test("RUNTIME CERTIFICATION — cold Workspace → Work View → Work Unit", async ({ page }) => {
    test.setTimeout(240_000);
    fs.mkdirSync(EV, { recursive: true });
    const consoleErrors: string[] = [];
    const failed: string[] = [];
    const apiReqs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
    page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url().slice(0, 100)}`));
    page.on("response", (r) => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`); });
    page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) apiReqs.push(u.pathname + u.search.slice(0, 40)); });

    await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
    if (/\/login/.test(page.url())) { test.skip(true, "no authenticated session"); return; }
    const tileSel = `a[href="/workspace/work-unit/${WU}"]`;
    await page.locator(tileSel).first().waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${EV}/cert-00-workspace.png` });

    await install(page, L);
    await page.evaluate((s) => (window as unknown as { __certArm: (x: string) => boolean }).__certArm(s), tileSel);
    apiReqs.length = 0;

    // ── THE OPERATOR GESTURE ──
    await page.locator(tileSel).first().click({ noWaitAfter: true });
    for (const ms of [100, 300, 700, 1200, 2000, 3000, 4500, 6000, 8000, 10000]) {
        await page.waitForTimeout(ms === 100 ? 100 : 200);
        await page.screenshot({ path: `${EV}/cert-t${String(ms).padStart(5, "0")}.png` }).catch(() => {});
        const c = await read(page);
        if (c.operational_commit_ms != null) break;
    }
    // allow the runtime its full chance to reach the ratified contract
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${EV}/cert-99-settled.png` });
    const c = await read(page);
    const dupes = apiReqs.length - new Set(apiReqs).size;

    const report = {
        base_url: process.env.PLAYWRIGHT_BASE_URL,
        acknowledgment_ms: c.acknowledgment_ms == null ? null : Math.round(c.acknowledgment_ms),
        transition_legibility_ms: c.transition_legibility_ms == null ? null : Math.round(c.transition_legibility_ms),
        operational_commit_ms: c.operational_commit_ms == null ? null : Math.round(c.operational_commit_ms),
        wu_first_seen_ms: c.wu_first_seen_ms == null ? null : Math.round(c.wu_first_seen_ms),
        operational_at_first_sight: c.operational_at_first_sight,
        visible_construction_ms: c.visible_construction_ms,
        continuity_breaks: c.continuity_breaks,
        blank_frames: c.blank_frames,
        false_empty_count: c.false_empty_count,
        surface_reconstruction_count: c.surface_reconstruction_count,
        attention_focus_divergence_ms: c.attention_focus_divergence_ms == null ? null : Math.round(c.attention_focus_divergence_ms),
        settlement_reflow: c.settlement_reflow,
        contract_at_commit: c.contract,
        critical_path_requests: apiReqs.length,
        critical_path_duplicate_requests: dupes,
        console_errors: consoleErrors.length,
        failed_requests: failed.filter((f) => !/_rsc/.test(f)).length,
        frames_sampled: c.frames,
        timeline: c.timeline.slice(0, 20),
    };
    console.log("[CERT] " + JSON.stringify(report, null, 1));
    fs.writeFileSync(`${EV}/certification.json`, JSON.stringify(report, null, 2));

    // ── THE RATIFIED OPERATOR CONTRACT ──
    const verdicts: string[] = [];
    const check = (name: string, pass: boolean, detail: string) => {
        verdicts.push(`${pass ? "PASS" : "FAIL"}  ${name}  — ${detail}`);
        return pass;
    };
    check("acknowledgment_ms ≤ 50", (c.acknowledgment_ms ?? 1e9) <= BUDGET.acknowledgment_ms, `${report.acknowledgment_ms}`);
    check("transition_legibility_ms ≤ 100", (c.transition_legibility_ms ?? 1e9) <= BUDGET.transition_legibility_ms, `${report.transition_legibility_ms}`);
    check("visible_construction_ms = 0", c.visible_construction_ms === 0, `${c.visible_construction_ms} ms of the operator watching the app assemble itself`);
    check("continuity_breaks = 0", c.continuity_breaks === 0, `${c.continuity_breaks}`);
    check("operational at first sight", c.operational_at_first_sight === true, `WU first seen at ${report.wu_first_seen_ms} ms, operational=${c.operational_at_first_sight}`);
    check("cold operational_commit_ms ≤ 800 (p75)", (c.operational_commit_ms ?? 1e9) <= BUDGET.operational_commit_ms_cold_p75, `${report.operational_commit_ms}`);
    check("false_empty_count = 0", c.false_empty_count === 0, `${c.false_empty_count}`);
    check("surface_reconstruction_count = 0", c.surface_reconstruction_count === 0, `${c.surface_reconstruction_count}`);
    check("settlement_reflow = 0", c.settlement_reflow === 0, `${c.settlement_reflow}`);
    check("no critical-path duplicate requests", dupes === 0, `${dupes} duplicates of ${apiReqs.length}`);
    console.log("[CERT VERDICTS]\n  " + verdicts.join("\n  "));
    fs.writeFileSync(`${EV}/verdicts.txt`, verdicts.join("\n"));

    if (ENFORCE) {
        expect.soft(c.acknowledgment_ms ?? 1e9, "acknowledgment_ms").toBeLessThanOrEqual(BUDGET.acknowledgment_ms);
        expect.soft(c.transition_legibility_ms ?? 1e9, "transition_legibility_ms").toBeLessThanOrEqual(BUDGET.transition_legibility_ms);
        expect.soft(c.visible_construction_ms, "visible_construction_ms").toBe(0);
        expect.soft(c.continuity_breaks, "continuity_breaks").toBe(0);
        expect.soft(c.operational_at_first_sight, "operational at first sight").toBe(true);
        expect.soft(c.operational_commit_ms ?? 1e9, "cold operational_commit_ms").toBeLessThanOrEqual(BUDGET.operational_commit_ms_cold_p75);
        expect.soft(c.false_empty_count, "false_empty_count").toBe(0);
        expect.soft(c.surface_reconstruction_count, "surface_reconstruction_count").toBe(0);
        expect.soft(dupes, "critical-path duplicate requests").toBe(0);
    }
});
