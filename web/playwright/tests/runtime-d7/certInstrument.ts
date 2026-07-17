/**
 * D7 — the shared Runtime certification INSTRUMENT.
 *
 * This is the D4-corrected measurement, extracted verbatim so the standing scenario matrix, the fast
 * PR gate, and the D6 statistical runner all measure IDENTICALLY. The authoritative harness
 * (`runtime-certification.spec.ts`) keeps its own inline copy by design; this module is validated to
 * produce the same numbers. It measures; it never changes the runtime.
 *
 * Selectors are single-ownership presentation labels + the runtime's own DOM contract markers.
 */
import type { Page } from "@playwright/test";

export const L = {
    wsSurface: '[data-runtime-label="WS.SURFACE"]',
    wuSurface: '[data-runtime-label="WU.SURFACE"]',
    wuHeader: '[data-runtime-label="WU.HEADER"]',
    activePill: '[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][aria-selected="true"]',
    queue: '[data-runtime-label="WU.QUEUE"]',
    queueRow: '[data-runtime-label="WU.QUEUE_ROW"]',
    fpRegion: "[data-focus-panel-boundary]",
    fpRecord: '[data-inline-focus-panel="true"]',
    queueEmpty: '[data-queue-empty="true"]',
    fpScope: "[data-focus-panel-scope]",
};

export type CertResult = {
    t0: number | null;
    acknowledgment_ms: number | null;
    transition_legibility_ms: number | null;
    operational_commit_ms: number | null;
    terminal: "operational" | "empty" | "error" | "preparing";
    terminal_ms: number | null;
    visible_construction_ms: number;
    retention_ms: number;
    continuity_breaks: number;
    blank_frames: number;
    false_empty_count: number;
    hollow_focus_panel_frames: number;
    surface_reconstruction_count: number;
    scope_state: string | null;
    settlement_reflow: number;
    frames: number;
    operational_at_first_sight: boolean | null;
    wu_first_seen_ms: number | null;
    contract: Record<string, boolean>;
    critical_path_requests: number;
    critical_path_duplicate_requests: number;
    // identity capture — for Work View / Record-of-Attention / Context Frame preservation checks
    active_work_view: string | null;
    subject_id: string | null;
    context_frame: string | null;
    projected_url: string | null;
};

/** Install the in-page instrument. Ported verbatim from the authoritative harness. */
export async function installInstrument(page: Page) {
    await page.evaluate((S) => {
        const w = window as any;
        const m: any = {
            t0: null, acknowledgment_ms: null, transition_legibility_ms: null, operational_commit_ms: null,
            terminal: "preparing", terminal_ms: null, visible_construction_ms: 0, retention_ms: 0,
            continuity_breaks: 0, blank_frames: 0, false_empty_count: 0, hollow_focus_panel_frames: 0,
            surface_reconstruction_count: 0, scope_state: null, settlement_reflow: 0, frames: 0,
            operational_at_first_sight: null, wu_first_seen_ms: null, contract: {},
            critical_path_requests: 0, critical_path_duplicate_requests: 0,
            active_work_view: null, subject_id: null, context_frame: null, projected_url: null,
        };
        w.__cert = m;
        const now = () => performance.now();
        const txt = (el: Element | null) => (el?.textContent || "").replace(/\s+/g, " ").trim();
        const constructionIn = (el: Element | null) => !!el?.querySelector('[class*="animate-pulse"]');
        const retentionIn = (el: Element | null) => !!el?.querySelector('[aria-busy="true"]') && !constructionIn(el);
        const queueTruth = () => {
            const q = document.querySelector(S.queue);
            if (!q) return "preparing";
            if (q.querySelector('[role="alert"]')) return "error";
            if (q.querySelector(S.queueEmpty)) return "empty";
            if (q.querySelectorAll(S.queueRow).length > 0) return "operational";
            return "preparing";
        };
        const scopeState = () => {
            const v = document.querySelector(S.fpScope)?.getAttribute("data-focus-panel-scope") ?? null;
            return v === "in_scope" || v === "no_active_view" || v === "out_of_scope" ? v : null;
        };
        const evaluate = () => {
            const wu = document.querySelector(S.wuSurface);
            if (!wu) return { terminal: "preparing", ok: false, c: {} };
            const header = wu.querySelector(S.wuHeader);
            const activePill = wu.querySelector(S.activePill);
            const fp = wu.querySelector(S.fpRegion);
            const fpRecord = fp?.querySelector(S.fpRecord) ?? null;
            const truth = queueTruth();
            const scope = scopeState();
            const uo1 = !!header && txt(header).length > 3 && !constructionIn(header) && !!activePill && !!activePill.getAttribute("data-work-view-id");
            const uo2 = truth === "operational" || truth === "empty";
            const subject = fpRecord?.getAttribute("data-inline-focus-panel-subject") || null;
            const uo3 = truth === "empty" ? !!fp : !!subject;
            const resolved = fpRecord?.getAttribute("data-inline-focus-panel-resolved") === "true";
            const uo4 = truth === "empty" ? true : (resolved && !constructionIn(fp));
            const uo5 = truth === "empty" ? true : !!fpRecord && [...fpRecord.querySelectorAll("button,[role=button]")].some((b: any) => !b.disabled && txt(b).length > 0);
            const uo6 = scope != null;
            const c = { uo1, uo2, uo3, uo4, uo5, uo6 };
            if (truth === "error") return { terminal: "error", ok: false, c };
            const ok = uo1 && uo2 && uo3 && uo4 && uo5 && uo6;
            return { terminal: ok ? (truth === "empty" ? "empty" : "operational") : "preparing", ok, c };
        };
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries() as any[]) if (!e.hadRecentInput && m.operational_commit_ms != null && e.value > 0.001) m.settlement_reflow += 1;
            }).observe({ type: "layout-shift", buffered: true } as any);
        } catch {}
        try {
            const seen = new Set<string>();
            new PerformanceObserver((l) => {
                for (const e of l.getEntries() as any[]) {
                    const u = String(e.name || "");
                    if (!/\/api\/admin\/work-units\/[^/]+\/provisioning-answer/.test(u)) continue;
                    if (m.terminal_ms != null) continue;
                    m.critical_path_requests += 1;
                    const key = u.split("?")[0] + "|" + (new URL(u, location.href).searchParams.get("work_view_id") || "");
                    if (seen.has(key)) m.critical_path_duplicate_requests += 1; else seen.add(key);
                }
            }).observe({ type: "resource", buffered: true } as any);
        } catch {}
        let lastWs: Element | null = null, lastWu: Element | null = null;
        const visibleRoot = () =>
            document.querySelector('[data-surface-slot="outgoing"]') || document.querySelector('[data-surface-slot="current"]') ||
            document.querySelector(S.wuSurface) || document.querySelector(S.wsSurface);
        const tick = () => {
            if (m.t0 == null) return;
            const t = now() - m.t0; m.frames++;
            const ws = document.querySelector(S.wsSurface), wu = document.querySelector(S.wuSurface), root = visibleRoot();
            if (!ws && !wu) { m.blank_frames++; m.continuity_breaks++; }
            if (ws && lastWs && ws !== lastWs) { m.surface_reconstruction_count++; m.continuity_breaks++; }
            if (wu && lastWu && wu !== lastWu) { m.surface_reconstruction_count++; m.continuity_breaks++; }
            if (ws) lastWs = ws; if (wu) lastWu = wu;
            if (root && constructionIn(root)) m.visible_construction_ms += 16; else if (root && retentionIn(root)) m.retention_ms += 16;
            const q = document.querySelector(S.queue);
            if (q?.querySelector(S.queueEmpty)) { const total = Number(q.getAttribute("data-queue-total") ?? "0"); if (total > 0 || constructionIn(q)) m.false_empty_count++; }
            const fp = document.querySelector(S.fpRegion), fpRecord = fp?.querySelector(S.fpRecord) ?? null;
            if (fpRecord) {
                const named = !!fpRecord.getAttribute("data-inline-focus-panel-subject");
                const resolved = fpRecord.getAttribute("data-inline-focus-panel-resolved") === "true";
                if (named && !resolved) m.hollow_focus_panel_frames++;
            }
            if (wu && m.wu_first_seen_ms == null) { m.wu_first_seen_ms = t; const o = evaluate(); m.operational_at_first_sight = o.ok; }
            if (m.terminal_ms == null) {
                const o = evaluate();
                if (o.terminal !== "preparing") {
                    m.terminal = o.terminal; m.terminal_ms = t; m.contract = o.c; m.scope_state = scopeState();
                    if (o.terminal === "operational" || o.terminal === "empty") m.operational_commit_ms = t;
                    // identity capture at terminal
                    m.active_work_view = wu?.querySelector(S.activePill)?.getAttribute("data-work-view-id") ?? null;
                    m.subject_id = document.querySelector(S.fpRecord)?.getAttribute("data-inline-focus-panel-subject") ?? null;
                    m.context_frame = wu?.getAttribute("data-context-frame") ?? null;
                    m.projected_url = location.pathname + location.search;
                }
            }
            requestAnimationFrame(tick);
        };
        w.__arm = (rowSel: string) => {
            const el = document.querySelector(rowSel) as HTMLElement | null;
            if (!el) return false;
            const ackSig = () => { const c = getComputedStyle(el); return `${c.transform}|${c.outlineWidth}|${c.outlineColor}|${c.backgroundColor}|${c.boxShadow}|${c.borderColor}|${c.opacity}`; };
            const outgoingSig = (elm: HTMLElement | null) => { if (!elm || !elm.isConnected) return null; const c = getComputedStyle(elm); return `${c.opacity}|${c.transform}|${c.filter}`; };
            let baseAck = ackSig(); let outgoing: HTMLElement | null = null; let baseOutgoing: string | null = null; let intentTimelineTime = 0;
            const recordAck = (ms: number) => { if (m.acknowledgment_ms == null) m.acknowledgment_ms = Math.max(0, ms); };
            const onStart = (ev: any) => { if (m.t0 != null && ev.target === el) recordAck(ev.timeStamp - m.t0); };
            el.addEventListener("transitionstart", onStart); el.addEventListener("animationstart", onStart);
            const ackTick = () => {
                if (m.t0 == null) return;
                if (m.acknowledgment_ms == null && ackSig() !== baseAck) {
                    const anims = el.getAnimations ? el.getAnimations() : [];
                    const started = anims.map((a) => a.startTime).filter((x: any) => typeof x === "number" && x >= 0) as number[];
                    if (started.length && typeof document.timeline?.currentTime === "number") recordAck(Math.min(...started) - intentTimelineTime);
                    else recordAck(now() - m.t0);
                }
                if (m.transition_legibility_ms == null && outgoing) { const s = outgoingSig(outgoing); if (s != null && s !== baseOutgoing) m.transition_legibility_ms = now() - m.t0; }
                if (m.acknowledgment_ms != null && m.transition_legibility_ms != null) return;
                requestAnimationFrame(ackTick);
            };
            el.addEventListener("pointerdown", () => {
                if (m.t0 != null) return;
                baseAck = ackSig();
                outgoing = (document.querySelector('[data-surface-slot]') as HTMLElement | null) || (document.querySelector(S.wsSurface) as HTMLElement | null) || (document.querySelector(S.wuSurface) as HTMLElement | null);
                baseOutgoing = outgoingSig(outgoing);
                m.t0 = now();
                intentTimelineTime = typeof document.timeline?.currentTime === "number" ? (document.timeline.currentTime as number) : now();
                requestAnimationFrame(tick); requestAnimationFrame(ackTick);
            }, { capture: true, once: true });
            return true;
        };
    }, L);
}

/** Read the collected measurement. */
export async function readCert(page: Page): Promise<CertResult> {
    return page.evaluate(() => (window as any).__cert);
}

/** The deterministic invariants every VALID operational/empty run must satisfy (D7 §4). */
export function deterministicViolations(m: CertResult): string[] {
    const v: string[] = [];
    if (m.visible_construction_ms !== 0) v.push(`visible_construction=${m.visible_construction_ms}`);
    if (m.critical_path_duplicate_requests !== 0) v.push(`duplicate_requests=${m.critical_path_duplicate_requests}`);
    if (m.surface_reconstruction_count !== 0) v.push(`reconstruction=${m.surface_reconstruction_count}`);
    if (m.continuity_breaks !== 0) v.push(`continuity_breaks=${m.continuity_breaks}`);
    if (m.false_empty_count !== 0) v.push(`false_empty=${m.false_empty_count}`);
    if (m.hollow_focus_panel_frames !== 0) v.push(`hollow_focus_panel=${m.hollow_focus_panel_frames}`);
    return v;
}
