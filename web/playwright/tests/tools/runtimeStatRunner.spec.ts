/**
 * D6 — STATISTICAL RUNTIME PERFORMANCE RUNNER.
 *
 * The constitutional budgets are percentiles (ack p99, legibility p95, commit p75); a single cold
 * sample cannot establish or refute them. This runner collects MANY samples of the Workspace → Work
 * Unit gesture in one browser process (fresh page per sample, no screenshots, minimal settle) and
 * writes one JSONL line per sample to `RC_STAT_OUT`.
 *
 * It ports the D4-corrected certification instrument VERBATIM (same selectors, same ack/legible/commit
 * measurement, same U-O1..U-O6 contract) so its numbers match `runtime-certification.spec.ts`. It never
 * changes the runtime or the measurement — it only repeats it. Validated against the authoritative
 * harness on a shared sample (see the D6 report).
 *
 * Env: RC_STAT_N (samples, default 20), RC_STAT_MODE ("cold"|"warm", label only), RC_STAT_OUT (jsonl
 * path), PLAYWRIGHT_BASE_URL, PLAYWRIGHT_STORAGE_STATE, WU_SLUG_A. "cold" vs "warm" is the caller's
 * server/DB warmth; both use a fresh page per sample.
 */
import { test, type Page } from "@playwright/test";
import * as fs from "fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
const N = Number(process.env.RC_STAT_N || "20");
const MODE = process.env.RC_STAT_MODE || "warm";
const OUT = process.env.RC_STAT_OUT || "/tmp/rc-stat.jsonl";

const L = {
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

if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 20 * 60 * 1000 });

/** Install the instrument (ported verbatim from runtime-certification.spec.ts). */
async function install(page: Page, S: typeof L) {
    await page.evaluate((S) => {
        const w = window as any;
        const m: any = {
            t0: null, acknowledgment_ms: null, transition_legibility_ms: null,
            operational_commit_ms: null, terminal: "preparing", terminal_ms: null,
            visible_construction_ms: 0, retention_ms: 0, continuity_breaks: 0, blank_frames: 0,
            false_empty_count: 0, hollow_focus_panel_frames: 0, unresolved_primary_action_frames: 0,
            surface_reconstruction_count: 0, scope_state: null, settlement_reflow: 0, frames: 0,
            operational_at_first_sight: null, wu_first_seen_ms: null, contract: {},
            critical_path_requests: 0, critical_path_duplicate_requests: 0,
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
        // settlement reflow observer
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries() as any[]) {
                    if (!e.hadRecentInput && m.operational_commit_ms != null && e.value > 0.001) m.settlement_reflow += 1;
                }
            }).observe({ type: "layout-shift", buffered: true } as any);
        } catch {}
        // critical-path request de-dup counting
        try {
            const seen = new Set<string>();
            new PerformanceObserver((l) => {
                for (const e of l.getEntries() as any[]) {
                    const u = String(e.name || "");
                    if (!/\/api\/admin\/work-units\/[^/]+\/provisioning-answer/.test(u)) continue;
                    if (m.terminal_ms != null) continue; // critical path = up to terminal
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
            if (m.terminal_ms == null) { const o = evaluate(); if (o.terminal !== "preparing") { m.terminal = o.terminal; m.terminal_ms = t; m.contract = o.c; m.scope_state = scopeState(); if (o.terminal === "operational" || o.terminal === "empty") m.operational_commit_ms = t; } }
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
    }, S);
}

async function measure(page: Page, tileSel: string) {
    await page.locator(tileSel).first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(500);
    await install(page, L);
    await page.evaluate((s) => (window as any).__arm(s), tileSel);
    await page.locator(tileSel).first().click({ noWaitAfter: true });
    await page.waitForFunction(() => (window as any).__cert?.terminal_ms != null, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    return page.evaluate(() => (window as any).__cert);
}

test("statistical run", async ({ browser }) => {
    fs.mkdirSync(require("path").dirname(OUT), { recursive: true });
    const tileSel = `a[href="/workspace/work-unit/${WU}"]`;
    let ok = 0, bad = 0;
    // WARM mode reuses ONE context+page (client caches hot): return to the Workspace between samples via
    // history-back (no reload), which the runtime adopts through its popstate→K1 adapter. COLD mode uses
    // a fresh context per sample (cold client). Both run against the same warm server.
    const warm = MODE === "warm";
    const ctx = warm ? await browser.newContext({ storageState: STORAGE }) : null;
    const page = warm ? await ctx!.newPage() : null;
    if (warm) {
        await page!.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
        await measure(page!, tileSel).catch(() => {}); // one unrecorded warm-up cycle
        await page!.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
    for (let i = 0; i < N; i++) {
        const sctx = warm ? ctx! : await browser.newContext({ storageState: STORAGE });
        const p = warm ? page! : await sctx.newPage();
        try {
            if (!warm) {
                await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
            } else if (!(await p.locator(tileSel).first().isVisible().catch(() => false))) {
                await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
            }
            const m = await measure(p, tileSel);
            const rec = {
                i, mode: MODE, ts: Date.now(),
                ack: m.acknowledgment_ms, legible: m.transition_legibility_ms, commit: m.operational_commit_ms,
                wu_first_seen: m.wu_first_seen_ms, terminal: m.terminal,
                construction: m.visible_construction_ms, reflow: m.settlement_reflow, recon: m.surface_reconstruction_count,
                continuity_breaks: m.continuity_breaks, false_empty: m.false_empty_count,
                cp_requests: m.critical_path_requests, cp_dupes: m.critical_path_duplicate_requests,
                op_first_sight: m.operational_at_first_sight, scope: m.scope_state,
                uo: m.contract, uo_all: ["uo1", "uo2", "uo3", "uo4", "uo5", "uo6"].every((k) => m.contract[k]),
            };
            const valid = m.terminal === "operational" || m.terminal === "empty";
            if (valid) ok++; else bad++;
            fs.appendFileSync(OUT, JSON.stringify({ ...rec, valid }) + "\n");
            if (warm) await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {}); // return to Workspace for the next sample
        } catch (e) {
            bad++;
            fs.appendFileSync(OUT, JSON.stringify({ i, mode: MODE, ts: Date.now(), valid: false, error: String(e).slice(0, 120) }) + "\n");
        } finally {
            if (!warm) await sctx.close();
        }
    }
    if (warm) await ctx!.close();
    console.log(`\n@@STAT@@ mode=${MODE} n=${N} valid=${ok} invalid=${bad} out=${OUT}`);
});
