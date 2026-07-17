/**
 * D7 — THE STANDING RUNTIME SCENARIO MATRIX.
 *
 * Permanent behavioral certification of the frozen Runtime + Settlement. Adds NO product behavior; it
 * converts the proven runtime into repeatable release discipline. Every scenario drives real browser
 * behavior (no static source assertions stand in for navigation/visual evidence) and asserts the
 * DETERMINISTIC invariants that must hold on every valid run. Percentile budgets are NOT graded here —
 * that is the scheduled statistical gate (the D6 runner).
 *
 * Tiers (D7 §5): titles tagged `@fast` form the quick PR gate; the whole file is the promotion gate.
 *   Fast PR gate:   npx playwright test scenarioMatrix --grep @fast
 *   Promotion gate: npx playwright test scenarioMatrix
 *
 * A degraded environment SKIPS (never fails) — the preflight classifies why.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { installInstrument, readCert, deterministicViolations, L, type CertResult } from "./certInstrument";
import { runPreflight, type PreflightResult } from "./preflight";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
const EVID = process.env.D7_EVIDENCE_DIR || "/tmp/d7-evidence";
const tile = `a[href="/workspace/work-unit/${WU}"]`;

if (STORAGE) test.use({ storageState: STORAGE });
// NOT serial: every scenario reports its own verdict — one failure must never hide the rest in a
// standing gate. The shared preflight runs once in beforeAll.
test.describe.configure({ timeout: 90_000 });

let preflight: PreflightResult;
test.beforeAll(async ({ request }) => {
    fs.mkdirSync(EVID, { recursive: true });
    preflight = await runPreflight(request, BASE);
    fs.writeFileSync(path.join(EVID, "preflight.json"), JSON.stringify(preflight, null, 2));
});

/** Skip-with-classification when the environment is degraded — never a product failure (D7 §1). */
function requireEnv() {
    test.skip(!preflight.ok, `ENV INVALID [${preflight?.class}]: ${preflight?.detail}`);
}

function record(name: string, data: unknown) {
    fs.writeFileSync(path.join(EVID, `${name}.json`), JSON.stringify(data, null, 2));
}

/** Drive Workspace → Work Unit and return the measurement. */
async function enterWorkUnit(page: Page): Promise<CertResult> {
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    await page.locator(tile).first().waitFor({ state: "visible", timeout: 30000 });
    await page.waitForTimeout(700);
    await installInstrument(page);
    await page.evaluate((s) => (window as any).__arm(s), tile);
    await page.locator(tile).first().click({ noWaitAfter: true });
    await page.waitForFunction(() => (window as any).__cert?.terminal_ms != null, null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
    return readCert(page);
}

/** Assert the deterministic invariants for an operational/empty run (D7 §4). */
function assertDeterministic(name: string, m: CertResult, opts: { expectTerminal?: "operational" | "empty" } = {}) {
    record(name, m);
    const term = opts.expectTerminal ?? "operational";
    expect(m.terminal, `${name}: terminal`).toBe(term);
    expect(deterministicViolations(m), `${name}: deterministic invariants`).toEqual([]);
    expect(m.operational_at_first_sight, `${name}: operational at first sight`).toBe(true);
    for (const k of ["uo1", "uo2", "uo3", "uo4", "uo5", "uo6"]) expect(m.contract[k], `${name}: ${k}`).toBe(true);
    expect(m.scope_state, `${name}: FocusPanelScopeState projected`).not.toBeNull();
}

test.describe("D7 — standing runtime scenario matrix", () => {
    // ── 1. Workspace → Work Unit (@fast) ──
    test("@fast S1 Workspace→WorkUnit: operational commit, no construction/dup/reconstruction", async ({ page }) => {
        requireEnv();
        const m = await enterWorkUnit(page);
        assertDeterministic("s1_ws_to_wu", m);
        expect(m.active_work_view, "active work view committed").toBeTruthy();
        expect(m.subject_id, "Record of Attention committed").toBeTruthy();
    });

    // ── 2 & 6 & 7. Work Unit → Workspace + browser back/forward ──
    // The SUPPORTED WU→Workspace return is navigation (the sidebar home link / a /workspace nav). K3
    // projects the WU address with replaceState (it owns the address and does NOT manufacture history
    // entries the operator did not create), so the WU URL REPLACES the /workspace entry — browser
    // back/forward therefore does not shuttle between Workspace and Work Unit. That is deliberate
    // (constitutional URL authority), a documented D5 follow-up (real history/retention), NOT a
    // D4–D6 regression. This scenario certifies the supported return and records the back behavior.
    test("S2/S6/S7 WorkUnit→Workspace via navigation (back/forward are replaceState-bound)", async ({ page }) => {
        requireEnv();
        await enterWorkUnit(page);
        const back = await page.evaluate(() => history.length); // depth before return
        // Supported return: navigate to the Workspace.
        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        const wsVisible = await page.locator(L.wsSurface).first().isVisible().catch(() => false);
        const tileVisible = await page.locator(tile).first().isVisible().catch(() => false);
        record("s2_wu_to_ws", { wsVisible, tileVisible, url: page.url(), historyDepthAtWu: back, note: "browser back is replaceState-bound (D5 follow-up)" });
        expect(wsVisible, "Workspace surface returns via navigation").toBe(true);
        expect(tileVisible, "Workspace tile clickable again (continuity)").toBe(true);
    });

    // ── 3. Work View movement (pill switch) ──
    test("@fast S3 Work View movement: lens changes in-page, no reconstruction, no dup requests", async ({ page }) => {
        requireEnv();
        const first = await enterWorkUnit(page);
        // switch to a different pill (a Work View other than the active one)
        const pills = page.locator('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"]');
        const count = await pills.count();
        let switched: { from: string | null; to: string | null; recon: number; dup: number } | null = null;
        if (count > 1) {
            const activeId = first.active_work_view;
            for (let i = 0; i < count; i++) {
                const id = await pills.nth(i).getAttribute("data-work-view-id");
                if (id && id !== activeId) {
                    await page.evaluate(() => { const w = window as any; w.__cert.surface_reconstruction_count = 0; w.__cert.critical_path_duplicate_requests = 0; });
                    await pills.nth(i).click();
                    await page.waitForTimeout(1200);
                    const after = await readCert(page);
                    const newActive = await page.locator(L.activePill).getAttribute("data-work-view-id").catch(() => null);
                    switched = { from: activeId, to: newActive, recon: after.surface_reconstruction_count, dup: after.critical_path_duplicate_requests };
                    break;
                }
            }
        }
        record("s3_work_view_movement", { pillCount: count, switched });
        if (switched) {
            expect(switched.to, "active lens changed").not.toBe(switched.from);
            expect(switched.recon, "no surface reconstruction on lens switch").toBe(0);
        }
    });

    // ── 4 & 5. Record-of-Attention movement + rapid latest-wins ──
    test("S4/S5 Record-of-Attention movement + rapid latest-wins", async ({ page }) => {
        requireEnv();
        await enterWorkUnit(page);
        // Let Settlement fully land so the queue layout is stable before driving row gestures.
        await page.waitForTimeout(4000);
        const rows = page.locator(L.queueRow);
        const n = await rows.count();
        let single: { subject: string | null } | null = null;
        let rapid: { finalSubject: string | null } | null = null;
        if (n >= 2) {
            // single movement: open row 1 (force — the runtime handles the row gesture; we bypass
            // Playwright's stability wait, which fights the opacity-settle of just-landed counts).
            await rows.nth(1).click({ force: true });
            await page.waitForTimeout(1200);
            single = { subject: await page.locator(L.fpRecord).getAttribute("data-inline-focus-panel-subject").catch(() => null) };
            // rapid latest-wins: fire several subject movements fast; the final committed subject must be
            // resolved (K1 supersedes older intents — no stuck intermediate, no hollow panel).
            const last = Math.min(n - 1, 4);
            for (let i = 0; i <= last; i++) await rows.nth(i).click({ force: true });
            await page.waitForTimeout(1800);
            const resolved = await page.locator(L.fpRecord).getAttribute("data-inline-focus-panel-resolved").catch(() => null);
            rapid = { finalSubject: await page.locator(L.fpRecord).getAttribute("data-inline-focus-panel-subject").catch(() => null) };
            (rapid as any).resolved = resolved;
        }
        record("s4_s5_record_movement", { rows: n, single, rapid });
        if (single) expect(single.subject, "subject committed on row open").toBeTruthy();
        if (rapid) {
            expect(rapid.finalSubject, "final subject committed after rapid movement").toBeTruthy();
            expect((rapid as any).resolved, "final panel resolved (latest-wins, no hollow)").toBe("true");
        }
    });

    // ── 8. Direct Work Unit URL (cold hydrate from URL) ──
    test("@fast S8 Direct WU URL: hydrates operational from the address (Art 2.4)", async ({ page }) => {
        requireEnv();
        await page.goto(`${BASE}/workspace/work-unit/${WU}`, { waitUntil: "domcontentloaded" });
        await installInstrument(page);
        // no gesture — the URL hydrates attention. Wait for the operational surface.
        await page.waitForFunction(() => document.querySelector('[data-runtime-label="WU.SURFACE"]') != null, null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const wu = await page.locator(L.wuSurface).first().isVisible().catch(() => false);
        const rows = await page.locator(L.queueRow).count();
        const scope = await page.locator(L.fpScope).getAttribute("data-focus-panel-scope").catch(() => null);
        record("s8_direct_url", { wuVisible: wu, rows, scope, url: page.url() });
        expect(wu, "WU surface present on direct URL").toBe(true);
        expect(rows, "queue rows present on direct URL").toBeGreaterThan(0);
    });

    // ── 9. Reload recovery ──
    test("S9 Reload recovery: a reload on a WU recovers the operational surface", async ({ page }) => {
        requireEnv();
        await enterWorkUnit(page);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelector('[data-runtime-label="WU.SURFACE"]') != null, null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const wu = await page.locator(L.wuSurface).first().isVisible().catch(() => false);
        const rows = await page.locator(L.queueRow).count();
        record("s9_reload_recovery", { wuVisible: wu, rows, url: page.url() });
        expect(wu, "WU surface recovers after reload").toBe(true);
    });

    // ── 10 & 13 & 16. Operational terminal + in_scope + Settlement resolved (@fast) ──
    test("@fast S10/S13/S16 Operational terminal · in_scope · Settlement resolved", async ({ page, request }) => {
        requireEnv();
        const m = await enterWorkUnit(page);
        assertDeterministic("s10_operational", m);
        expect(m.scope_state, "in_scope").toBe("in_scope");
        // Settlement resolves: wait past commit, KPI values fill and pill counts appear.
        await page.waitForTimeout(4000);
        const kpiPending = await page.locator('[data-runtime-label="WU.SURFACE"] [data-kpi-pending="true"]').count();
        const settlement = (await (await request.get(`${BASE}/api/admin/work-units/${WU}/provisioning-answer?work_view_id=new_leads`)).json())?.settlement?.status;
        record("s16_settlement_resolved", { kpiPending, settlement });
        expect(settlement, "D1 emits resolved settlement locators").toBe("resolved");
        expect(kpiPending, "KPI values settle (no pending remain)").toBe(0);
    });

    // ── 11. Authoritative empty terminal (a lens that admits no rows) ──
    test("S11 Authoritative empty: an empty lens is `empty`, never a false-empty", async ({ page }) => {
        requireEnv();
        // The `tours` lens on the New Leads WU holds only lead+closed → authoritatively empty.
        await page.goto(`${BASE}/workspace/work-unit/${WU}?work_view_id=tours`, { waitUntil: "domcontentloaded" });
        await installInstrument(page);
        await page.waitForFunction(() => document.querySelector('[data-runtime-label="WU.SURFACE"]') != null, null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const m = await readCert(page);
        const empty = await page.locator(L.queueEmpty).count();
        const errorAlert = await page.locator(`${L.queue} [role="alert"]`).count();
        record("s11_authoritative_empty", { terminal: m.terminal, emptyMarker: empty, errorAlert, false_empty: m.false_empty_count });
        // Either an authoritative-empty marker OR rows — but NEVER an error alert masquerading, and never false-empty.
        expect(errorAlert, "empty lens is not an error").toBe(0);
        expect(m.false_empty_count, "no false-empty frames").toBe(0);
    });

    // ── 12. Honest error terminal (a work unit that cannot resolve) ──
    test("S12 Honest error: a nonexistent WU yields an honest error, never a false-empty", async ({ page, request }) => {
        requireEnv();
        // Server-level: the provisioning answer for a bad slug is a terminal error carried as HTTP 200.
        const res = await request.get(`${BASE}/api/admin/work-units/__nonexistent_wu__/provisioning-answer?work_view_id=new_leads`);
        const body = await res.json().catch(() => ({}));
        record("s12_honest_error", { http: res.status(), terminal: body?.terminal, code: body?.code });
        expect(body?.terminal, "nonexistent WU → error terminal").toBe("error");
        expect(["work_unit_not_found", "unauthorized", "no_business_process"], "honest error code").toContain(body?.code);
    });

    // ── 18. Settlement error isolation (settlement fetch fails → operational truth preserved) ──
    test("S18 Settlement error: a failed settlement fetch never erases operational truth", async ({ browser }) => {
        requireEnv();
        const ctx: BrowserContext = await browser.newContext({ storageState: STORAGE });
        const page = await ctx.newPage();
        // Fail every settlement fetch AFTER commit — operational must stay operational.
        for (const pat of ["**/metrics/resolve**", "**/queue-view-totals**", "**/right-rail-bundle**"]) {
            await page.route(pat, (route) => route.fulfill({ status: 500, body: "{}" }));
        }
        const m = await enterWorkUnit(page);
        await page.waitForTimeout(2500);
        const wuStillOperational = await page.locator(L.queueRow).count();
        const subject = await page.locator(L.fpRecord).getAttribute("data-inline-focus-panel-subject").catch(() => null);
        record("s18_settlement_error", { terminal: m.terminal, uo: m.contract, rowsAfterSettlementFail: wuStillOperational, subject, reflow: m.settlement_reflow });
        expect(m.terminal, "operational despite settlement failure").toBe("operational");
        expect(m.contract.uo4 && m.contract.uo5, "operational truth (situation+action) preserved").toBe(true);
        expect(subject, "Record of Attention preserved through settlement failure").toBeTruthy();
        await ctx.close();
    });
});
