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
 * ── REFINEMENT (certification correction, pre-D1) ────────────────────────────────────────────
 * Three defects made the prior revision unable to grade the target. All three are corrected here.
 *
 * (1) INDEPENDENT FOCUS PANEL OBSERVATION.
 *     `FP.SURFACE` is NOT the Focus Panel — it is the two-column wrapper that OWNS both the queue
 *     column and the panel column (WorkUnitSurface.tsx nests <QueueRegion> inside <FocusPanelSurface>).
 *     Reading `FP.SURFACE`.textContent therefore reads THE QUEUE'S TEXT. Under the representative
 *     seed every New-Leads row carries status `open`, so the old U-O4 probe (/open|.../ over FP text)
 *     matched QUEUE content, and the old U-O5 probe matched a QUEUE ROW's button. A completely hollow
 *     Focus Panel passed. We now observe `[data-focus-panel-boundary]` — the panel column, a SIBLING
 *     of the queue — so Focus Panel content is proven independently of queue content.
 *
 * (2) AUTHORITATIVE EMPTY ≠ HONEST ERROR — and neither is inferred from prose.
 *     The old predicate tested /no |none|empty|nothing|error|failed/ over queue text, so an honest
 *     configuration message ("No process configured", "no active view") READ AS AUTHORITATIVE EMPTY,
 *     and — worse — `error|failed` was folded INTO the empty branch, which short-circuited the
 *     contract: AN HONEST ERROR COUNTED AS OPERATIONAL COMMIT. Terminal outcomes are now read from
 *     the runtime's own DOM contract, never from prose:
 *         error   ← [role="alert"] inside the queue region   (QueueRegion renderState "error")
 *         empty   ← [data-queue-empty="true"]                (QueueRegion renderState "empty")
 *         rows    ← WU.QUEUE_ROW present                     (QueueRegion renderState "rows")
 *         preparing ← none of the above (NON-terminal; time may never make this operational)
 *     `operational` and `empty` are terminal SUCCESS. `error` is a terminal outcome that is
 *     explicitly NOT an Operational Commit. This is what makes the harness satisfiable without
 *     letting a broken runtime buy a pass with an error message.
 *
 * (3) CONSTRUCTION ≠ RETENTION ≠ SETTLEMENT.
 *     The old `skeletonIn` matched `[aria-busy="true"], [class*="animate-pulse"]`, conflating a
 *     violation with two PERMITTED states, and would have failed a constitutionally correct runtime:
 *         construction (VIOLATION) — animate-pulse placeholder geometry standing in for content;
 *                                    the operator watching the application assemble itself.
 *         retention (PERMITTED)    — aria-busy over REAL retained content (WorkUnitSurface held mode,
 *                                    QueueRegion held rows during refetch). Retention IS continuity.
 *         settlement (PERMITTED)   — aria-busy on secondary content after commit (e.g. KPI pending).
 *     Only placeholder geometry counts as visible construction.
 *
 * The harness additionally observes `FocusPanelScopeState` (in_scope | no_active_view | out_of_scope).
 * `resolveFocusPanelScope` exists in lib/lifecycle/operationalProjection.ts but is NOT projected into
 * the DOM by the current runtime, so this check fails today for the correct constitutional reason and
 * becomes satisfiable when the Focus authority projects it.
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

/**
 * Observation selectors.
 *
 * Single-ownership presentation labels (doctrine: one label = one component) PLUS the runtime's own
 * DOM contract markers. NOTE the deliberate absence of `FP.SURFACE` as a content probe: it is the
 * two-column wrapper, not the Focus Panel (see REFINEMENT (1)).
 */
const L = {
    wsSurface: '[data-runtime-label="WS.SURFACE"]',
    wuSurface: '[data-runtime-label="WU.SURFACE"]',
    wuHeader: '[data-runtime-label="WU.HEADER"]',
    pills: '[data-runtime-label="WU.WORK_VIEW_PILLS"]',
    /** The active lens, stated by the runtime itself — not inferred from styling. */
    activePill: '[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][aria-selected="true"]',
    queue: '[data-runtime-label="WU.QUEUE"]',
    queueRow: '[data-runtime-label="WU.QUEUE_ROW"]',
    /** The Focus Panel column — a SIBLING of the queue column. Observing this excludes queue content. */
    fpRegion: "[data-focus-panel-boundary]",
    /** An open record inside the Focus Panel column. */
    fpRecord: '[data-inline-focus-panel="true"]',
    /** The "Select a record to begin" placeholder — structure held, no subject committed. */
    fpPlaceholder: '[data-inline-focus-panel="empty"]',
    /** Authoritative-empty marker rendered by QueueRegion renderState "empty". */
    queueEmpty: '[data-queue-empty="true"]',
    /** Client-side filter produced zero matches — NOT an authoritative empty lens. */
    queueNoMatches: '[data-queue-no-matches="true"]',
    /** FocusPanelScopeState projection. Absent in the current runtime — correctly fails today. */
    fpScope: "[data-focus-panel-scope]",
};

type Terminal = "operational" | "empty" | "error" | "preparing";

type Cert = {
    t0: number | null;
    acknowledgment_ms: number | null;
    transition_legibility_ms: number | null;
    operational_commit_ms: number | null;
    terminal: Terminal;
    terminal_ms: number | null;
    visible_construction_ms: number;
    retention_ms: number;
    continuity_breaks: number;
    blank_frames: number;
    false_empty_count: number;
    hollow_focus_panel_frames: number;
    unresolved_primary_action_frames: number;
    surface_reconstruction_count: number;
    scope_state: string | null;
    settlement_reflow: number;
    frames: number;
    operational_at_first_sight: boolean | null;
    wu_first_seen_ms: number | null;
    contract: Record<string, boolean>;
    diag: Record<string, unknown>;
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
            operational_commit_ms: null, terminal: "preparing", terminal_ms: null,
            visible_construction_ms: 0, retention_ms: 0, continuity_breaks: 0,
            blank_frames: 0, false_empty_count: 0, hollow_focus_panel_frames: 0,
            unresolved_primary_action_frames: 0, surface_reconstruction_count: 0,
            scope_state: null, settlement_reflow: 0, frames: 0,
            operational_at_first_sight: null, wu_first_seen_ms: null,
            contract: {}, diag: {}, timeline: [],
        } as unknown as Cert;
        w.__cert = m;
        const now = () => performance.now();
        const log = (e: string) => m.timeline.push({ t: Math.round(now() - (m.t0 ?? 0)), e });
        const txt = (el: Element | null) => (el?.textContent || "").replace(/\s+/g, " ").trim();

        // ── REFINEMENT (3): construction vs retention ───────────────────────────────────────
        /** VIOLATION: placeholder geometry standing in for content. */
        const constructionIn = (el: Element | null) => !!el?.querySelector('[class*="animate-pulse"]');
        /** PERMITTED: aria-busy over real retained content (hold) — continuity, not construction. */
        const retentionIn = (el: Element | null) =>
            !!el?.querySelector('[aria-busy="true"]') && !constructionIn(el);

        // ── REFINEMENT (2): authoritative queue truth, read from the DOM contract ───────────
        const queueTruth = (): Terminal => {
            const q = document.querySelector(S.queue);
            if (!q) return "preparing";
            // Honest error — a terminal outcome, and explicitly NOT an Operational Commit.
            if (q.querySelector('[role="alert"]')) return "error";
            // Authoritative empty — the lens resolved and admits nothing.
            if (q.querySelector(S.queueEmpty)) return "empty";
            // Rows present (settled, or held during refetch — both are real truth).
            if (q.querySelectorAll(S.queueRow).length > 0) return "operational";
            return "preparing";
        };

        /** FocusPanelScopeState — must be explicitly projected; never inferred. */
        const scopeState = () => {
            const el = document.querySelector(S.fpScope);
            const v = el?.getAttribute("data-focus-panel-scope") ?? null;
            return v === "in_scope" || v === "no_active_view" || v === "out_of_scope" ? v : null;
        };

        // ── THE RATIFIED WORK UNIT OPERATIONAL CONTRACT (U-O1…U-O5) ────────────────────────
        const evaluate = () => {
            const wu = document.querySelector(S.wuSurface);
            if (!wu) return { terminal: "preparing" as Terminal, ok: false, c: {} as Record<string, boolean> };

            const header = wu.querySelector(S.wuHeader);
            const activePill = wu.querySelector(S.activePill);
            const queue = wu.querySelector(S.queue);
            // The Focus Panel column — independent of the queue column.
            const fp = wu.querySelector(S.fpRegion);
            const fpRecord = fp?.querySelector(S.fpRecord) ?? null;

            const truth = queueTruth();
            const scope = scopeState();

            // U-O1 orientation: header identity present, not under construction, AND the runtime
            // names the active Work View itself (aria-selected tab), not merely "some pills exist".
            const uo1 =
                !!header && txt(header).length > 3 && !constructionIn(header) &&
                !!activePill && !!activePill.getAttribute("data-work-view-id");

            // U-O2 authoritative queue truth: a terminal lens outcome, never "not yet".
            const uo2 = truth === "operational" || truth === "empty";

            // U-O3 Record of Attention committed: the panel names a subject.
            //      An authoritative-empty lens has no subject to commit — permitted.
            const subject = fpRecord?.getAttribute("data-inline-focus-panel-subject") || null;
            const uo3 = truth === "empty" ? !!fp : !!subject;

            // U-O4 current business state present — the runtime's own resolution truth, read from the
            //      PANEL (never the queue). A named-but-unresolved panel is HOLLOW, not Operational.
            const resolved = fpRecord?.getAttribute("data-inline-focus-panel-resolved") === "true";
            const uo4 = truth === "empty" ? true : (resolved && !constructionIn(fp));

            // U-O5 truthful primary action: an enabled control inside the PANEL column (not a queue row).
            const uo5 =
                truth === "empty"
                    ? true
                    : !!fpRecord && [...fpRecord.querySelectorAll("button,[role=button]")].some(
                          (b) => !(b as HTMLButtonElement).disabled && txt(b).length > 0,
                      );

            // U-O6 explicit FocusPanelScopeState — projected, not inferred.
            const uo6 = scope != null;

            const c = { uo1, uo2, uo3, uo4, uo5, uo6 };

            // Terminal classification. `error` is terminal but NOT an Operational Commit.
            if (truth === "error") return { terminal: "error" as Terminal, ok: false, c };
            const ok = uo1 && uo2 && uo3 && uo4 && uo5 && uo6;
            const terminal: Terminal = ok ? (truth === "empty" ? "empty" : "operational") : "preparing";
            return { terminal, ok, c };
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

            // VISIBLE CONSTRUCTION (violation) vs RETENTION (permitted) — REFINEMENT (3).
            if (root && constructionIn(root)) m.visible_construction_ms += 16;
            else if (root && retentionIn(root)) m.retention_ms += 16;

            // FALSE EMPTY — an "empty" lens contradicted by the runtime's own authoritative total,
            // or asserted while the lens is still being constructed. Both are the runtime lying.
            const q = document.querySelector(S.queue);
            if (q?.querySelector(S.queueEmpty)) {
                const total = Number(q.getAttribute("data-queue-total") ?? "0");
                if (total > 0 || constructionIn(q)) m.false_empty_count++;
            }

            // HOLLOW FOCUS PANEL — a subject is named but no current business state resolved.
            const fp = document.querySelector(S.fpRegion);
            const fpRecord = fp?.querySelector(S.fpRecord) ?? null;
            if (fpRecord) {
                const named = !!fpRecord.getAttribute("data-inline-focus-panel-subject");
                const resolved = fpRecord.getAttribute("data-inline-focus-panel-resolved") === "true";
                if (named && !resolved) m.hollow_focus_panel_frames++;
                // UNRESOLVED PRIMARY ACTION — a resolved panel that still offers no truthful action.
                if (resolved) {
                    const actionable = [...fpRecord.querySelectorAll("button,[role=button]")].some(
                        (b) => !(b as HTMLButtonElement).disabled && txt(b).length > 0,
                    );
                    if (!actionable) m.unresolved_primary_action_frames++;
                }
            }

            // The Work Unit becoming visible at all — and whether it was Operational at first sight.
            if (wu && m.wu_first_seen_ms == null) {
                m.wu_first_seen_ms = t;
                const o = evaluate();
                m.operational_at_first_sight = o.ok;
                log(`WU_FIRST_SEEN terminal=${o.terminal} operational=${o.ok}`);
            }

            // TERMINAL OUTCOME — the ratified contract becomes true, or an honest error lands.
            if (m.terminal_ms == null) {
                const o = evaluate();
                if (o.terminal !== "preparing") {
                    m.terminal = o.terminal;
                    m.terminal_ms = t;
                    m.contract = o.c;
                    m.scope_state = (document.querySelector(S.fpScope)?.getAttribute("data-focus-panel-scope")) ?? null;
                    // Only `operational` and `empty` are an Operational Commit. `error` is not.
                    if (o.terminal === "operational" || o.terminal === "empty") m.operational_commit_ms = t;
                    log(`TERMINAL ${o.terminal}`);
                }
            }

            requestAnimationFrame(tick);
        };

        // ACK + LEGIBLE are two DISTINCT constitutional promises, measured on two DISTINCT elements:
        //   ACK      — "first visual response on the TOUCHED element"          (authorization line 254)
        //   LEGIBLE  — "first visual evidence of movement: the OUTGOING's yield" (line 255; line 535:
        //              "the outgoing surface, NEVER the incoming").
        w.__certArm = (rowSel: string) => {
            const el = document.querySelector(rowSel) as HTMLElement | null;
            if (!el) return false;

            // ── ACK. The touched element's first visual response. The canonical acknowledgment is
            //    `.motion-control:active { transform: scale(0.98) }` — a TRANSFORM — so the response set
            //    MUST include transform and outline, not just paint-color properties (the previous set
            //    omitted transform and was structurally blind to the canonical primitive). Timing is
            //    anchored to the transition/animation START, which is paint-accurate; a rAF poll
            //    quantizes to ~16.7ms frame boundaries, and that error is a third of the 50ms budget.
            const ackSig = () => {
                const c = getComputedStyle(el);
                return `${c.transform}|${c.outlineWidth}|${c.outlineColor}|${c.backgroundColor}|${c.boxShadow}|${c.borderColor}|${c.opacity}`;
            };

            // ── LEGIBLE. The OUTGOING surface's yield. Captured as a STABLE element reference at intent —
            //    the surface the operator is LEAVING — and watched for its recede. The previous harness
            //    watched `visibleRoot()`, which re-queries every frame and flips to the INCOMING surface
            //    at commit, so it could only ever report LEGIBLE == commit (line-535 violation).
            const outgoingSig = (elm: HTMLElement | null) => {
                if (!elm || !elm.isConnected) return null;
                const c = getComputedStyle(elm);
                return `${c.opacity}|${c.transform}|${c.filter}`;
            };

            let baseAck = ackSig();
            let outgoing: HTMLElement | null = null;
            let baseOutgoing: string | null = null;
            let intentTimelineTime = 0;

            const recordAck = (ms: number) => {
                if (m.acknowledgment_ms == null) { m.acknowledgment_ms = Math.max(0, ms); log("ACK"); }
            };
            // Paint-accurate ACK: the touched element's own transition/animation STARTING is the response.
            const onStart = (ev: Event) => {
                if (m.t0 != null && ev.target === el) recordAck((ev as AnimationEvent).timeStamp - m.t0);
            };
            el.addEventListener("transitionstart", onStart);
            el.addEventListener("animationstart", onStart);

            const ackTick = () => {
                if (m.t0 == null) return;
                // Fallback for an instant (non-transitioned) response — and the sole path for LEGIBLE.
                if (m.acknowledgment_ms == null && ackSig() !== baseAck) {
                    // Prefer the running animation's true start time over this frame's timestamp.
                    const anims = el.getAnimations ? el.getAnimations() : [];
                    const started = anims
                        .map((a) => a.startTime)
                        .filter((x): x is number => typeof x === "number" && x >= 0);
                    if (started.length && typeof document.timeline?.currentTime === "number") {
                        recordAck(Math.min(...started) - intentTimelineTime);
                    } else {
                        recordAck(now() - m.t0);
                    }
                }
                if (m.transition_legibility_ms == null && outgoing) {
                    const s = outgoingSig(outgoing);
                    if (s != null && s !== baseOutgoing) { m.transition_legibility_ms = now() - m.t0; log("LEGIBLE"); }
                }
                if (m.acknowledgment_ms != null && m.transition_legibility_ms != null) return;
                requestAnimationFrame(ackTick);
            };
            el.addEventListener("pointerdown", () => {
                if (m.t0 != null) return;
                baseAck = ackSig();
                // The outgoing surface = whatever the operator is looking at when intent lands. The
                // Surface Host renders it as the sole `[data-surface-slot]`; fall back to the surfaces.
                outgoing =
                    (document.querySelector('[data-surface-slot]') as HTMLElement | null) ||
                    (document.querySelector(S.wsSurface) as HTMLElement | null) ||
                    (document.querySelector(S.wuSurface) as HTMLElement | null);
                baseOutgoing = outgoingSig(outgoing);
                m.t0 = now();
                intentTimelineTime =
                    typeof document.timeline?.currentTime === "number" ? document.timeline.currentTime : now();
                log("INTENT");
                requestAnimationFrame(tick); requestAnimationFrame(ackTick);
            }, { capture: true, once: true });
            return true;
        };

        /** Post-hoc diagnosis — WHY the contract failed, in constitutional terms. */
        w.__certDiag = () => {
            const wu = document.querySelector(S.wuSurface);
            const fp = wu?.querySelector(S.fpRegion) ?? null;
            const fpRecord = fp?.querySelector(S.fpRecord) ?? null;
            const q = wu?.querySelector(S.queue) ?? null;
            return {
                wu_present: !!wu,
                active_work_view: wu?.querySelector(S.activePill)?.getAttribute("data-work-view-id") ?? null,
                queue_truth: queueTruth(),
                queue_total_attr: q?.getAttribute("data-queue-total") ?? null,
                queue_rows: q?.querySelectorAll(S.queueRow).length ?? 0,
                queue_authoritative_empty: !!q?.querySelector(S.queueEmpty),
                queue_error_alert: !!q?.querySelector('[role="alert"]'),
                fp_region_present: !!fp,
                fp_state_attr: fp?.getAttribute("data-focus-panel-state") ?? null,
                fp_record_open: !!fpRecord,
                fp_subject: fpRecord?.getAttribute("data-inline-focus-panel-subject") ?? null,
                fp_resolved: fpRecord?.getAttribute("data-inline-focus-panel-resolved") ?? null,
                fp_placeholder: !!fp?.querySelector(S.fpPlaceholder),
                focus_panel_scope_state: document.querySelector(S.fpScope)?.getAttribute("data-focus-panel-scope") ?? null,
                /** Proof the old probe was contaminated: FP.SURFACE text length vs panel-only text length. */
                contamination_fp_surface_chars: txt(document.querySelector('[data-runtime-label="FP.SURFACE"]')).length,
                contamination_fp_panel_chars: txt(fp).length,
            };
        };
    }, sel);
}

const read = (page: Page) => page.evaluate(() => (window as unknown as { __cert: Cert }).__cert);
const diag = (page: Page) => page.evaluate(() => (window as unknown as { __certDiag: () => Record<string, unknown> }).__certDiag());

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
        if (c.terminal_ms != null) break;
    }
    // allow the runtime its full chance to reach the ratified contract
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${EV}/cert-99-settled.png` });
    const c = await read(page);
    const d = await diag(page);
    const dupes = apiReqs.length - new Set(apiReqs).size;

    const report = {
        base_url: process.env.PLAYWRIGHT_BASE_URL,
        terminal: c.terminal,
        terminal_ms: c.terminal_ms == null ? null : Math.round(c.terminal_ms),
        acknowledgment_ms: c.acknowledgment_ms == null ? null : Math.round(c.acknowledgment_ms),
        transition_legibility_ms: c.transition_legibility_ms == null ? null : Math.round(c.transition_legibility_ms),
        operational_commit_ms: c.operational_commit_ms == null ? null : Math.round(c.operational_commit_ms),
        wu_first_seen_ms: c.wu_first_seen_ms == null ? null : Math.round(c.wu_first_seen_ms),
        operational_at_first_sight: c.operational_at_first_sight,
        visible_construction_ms: c.visible_construction_ms,
        retention_ms_permitted: c.retention_ms,
        continuity_breaks: c.continuity_breaks,
        blank_frames: c.blank_frames,
        false_empty_count: c.false_empty_count,
        hollow_focus_panel_frames: c.hollow_focus_panel_frames,
        unresolved_primary_action_frames: c.unresolved_primary_action_frames,
        surface_reconstruction_count: c.surface_reconstruction_count,
        focus_panel_scope_state: c.scope_state,
        settlement_reflow: c.settlement_reflow,
        contract_at_terminal: c.contract,
        critical_path_requests: apiReqs.length,
        critical_path_duplicate_requests: dupes,
        console_errors: consoleErrors.length,
        failed_requests: failed.filter((f) => !/_rsc/.test(f)).length,
        frames_sampled: c.frames,
        diagnosis: d,
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
    // An Operational Commit is `operational` or authoritative `empty`. An honest `error` is a
    // terminal outcome but NOT a commit — it can never buy a pass.
    const committed = c.terminal === "operational" || c.terminal === "empty";
    check("terminal outcome is a commit (operational|empty), not error/preparing", committed, `terminal=${c.terminal}`);
    check("acknowledgment_ms ≤ 50", (c.acknowledgment_ms ?? 1e9) <= BUDGET.acknowledgment_ms, `${report.acknowledgment_ms}`);
    check("transition_legibility_ms ≤ 100", (c.transition_legibility_ms ?? 1e9) <= BUDGET.transition_legibility_ms, `${report.transition_legibility_ms}`);
    check("visible_construction_ms = 0", c.visible_construction_ms === 0, `${c.visible_construction_ms} ms of the operator watching the app assemble itself (retention ${c.retention_ms} ms is permitted)`);
    check("continuity_breaks = 0", c.continuity_breaks === 0, `${c.continuity_breaks}`);
    check("operational at first sight", c.operational_at_first_sight === true, `WU first seen at ${report.wu_first_seen_ms} ms, operational=${c.operational_at_first_sight}`);
    check("cold operational_commit_ms ≤ 800 (p75)", (c.operational_commit_ms ?? 1e9) <= BUDGET.operational_commit_ms_cold_p75, `${report.operational_commit_ms}`);
    check("false_empty_count = 0", c.false_empty_count === 0, `${c.false_empty_count}`);
    check("focus panel not hollow", c.hollow_focus_panel_frames === 0, `${c.hollow_focus_panel_frames} frames with a named but unresolved subject`);
    check("primary action resolved", c.unresolved_primary_action_frames === 0, `${c.unresolved_primary_action_frames} frames resolved with no truthful action`);
    check("FocusPanelScopeState projected", c.scope_state != null, `${c.scope_state ?? "NOT PROJECTED — resolveFocusPanelScope exists in lib but never reaches the DOM"}`);
    check("surface_reconstruction_count = 0", c.surface_reconstruction_count === 0, `${c.surface_reconstruction_count}`);
    check("settlement_reflow = 0", c.settlement_reflow === 0, `${c.settlement_reflow}`);
    check("no critical-path duplicate requests", dupes === 0, `${dupes} duplicates of ${apiReqs.length}`);
    console.log("[CERT VERDICTS]\n  " + verdicts.join("\n  "));
    console.log("[CERT DIAGNOSIS] " + JSON.stringify(d, null, 1));
    fs.writeFileSync(`${EV}/verdicts.txt`, verdicts.join("\n"));

    if (ENFORCE) {
        expect.soft(committed, "terminal outcome is a commit").toBe(true);
        expect.soft(c.acknowledgment_ms ?? 1e9, "acknowledgment_ms").toBeLessThanOrEqual(BUDGET.acknowledgment_ms);
        expect.soft(c.transition_legibility_ms ?? 1e9, "transition_legibility_ms").toBeLessThanOrEqual(BUDGET.transition_legibility_ms);
        expect.soft(c.visible_construction_ms, "visible_construction_ms").toBe(0);
        expect.soft(c.continuity_breaks, "continuity_breaks").toBe(0);
        expect.soft(c.operational_at_first_sight, "operational at first sight").toBe(true);
        expect.soft(c.operational_commit_ms ?? 1e9, "cold operational_commit_ms").toBeLessThanOrEqual(BUDGET.operational_commit_ms_cold_p75);
        expect.soft(c.false_empty_count, "false_empty_count").toBe(0);
        expect.soft(c.hollow_focus_panel_frames, "hollow focus panel").toBe(0);
        expect.soft(c.unresolved_primary_action_frames, "unresolved primary action").toBe(0);
        expect.soft(c.scope_state, "FocusPanelScopeState projected").not.toBeNull();
        expect.soft(c.surface_reconstruction_count, "surface_reconstruction_count").toBe(0);
        expect.soft(dupes, "critical-path duplicate requests").toBe(0);
    }
});
