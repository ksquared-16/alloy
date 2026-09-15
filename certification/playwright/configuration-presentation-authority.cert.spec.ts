/**
 * CONFIGURATION PRESENTATION CONVERGENCE V1.
 *
 * Eighteen direct Configuration routes stopped asking `ctx.role !== "admin"` and started asking the
 * three keys the Configuration model already owned. This file proves the three families stay apart,
 * and proves the one claim the slice actually rests on.
 *
 * ── THE CLAIM THIS FILE EXISTS TO TEST (PHASE 5) ──
 *
 * Default ops gains these direct routes. That is approved as AUTHORITY PATH CONVERGENCE rather than
 * widening, and the approval is conditional on ops having *already* been able to cause the same
 * material configuration effect through a capability-authorized path. So PHASE 5 does not assert
 * that ops is admitted and stop there — it shows ops holding the very keys the canonical
 * configuration contract requires for the same operations, and then shows the direct route agreeing.
 * If ops did not already hold them, this test fails and the convergence argument fails with it.
 *
 * ── HOW A REFUSAL IS READ ──
 *
 * 403 is the gate refusing; anything else is the gate ADMITTING, because every gate runs before its
 * handler reads a body. An admitted persona lands on 400, and that 400 is a PASS.
 *
 * ── ONE DOOR ANSWERS 403 TO EVERYONE, AND IT IS NOT AUTHORITY ──
 *
 * `queue-row-layout` checks a Layout V2 feature flag BEFORE it resolves a caller at all, so on a
 * stack where the flag is off it refuses the default admin too. A matrix that read that as "admin
 * denied" would be reporting a flag as an authority finding, so the probe reads the body and reports
 * the door as flag-disabled instead of scoring it.
 *
 * Personas come from `fixtures/access-personas.mjs`; run
 * `node ../certification/playwright/fixtures/access-personas.mjs setup` from `web/` first, and
 * RESTART the certification server afterwards — a direct grant write does not invalidate the
 * server's access-bundle cache.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "configuration-presentation-authority");
const PASSWORD = "alloy-local-cert";

/** Deliberately absent. The gate runs first, so a refusal here is authority and never data. */
const NO_ID = "99999999-0000-4000-8000-000000000301";

const PERSONAS = {
    layout: { email: "cert.cfglaymgr@northwind.invalid" },
    section: { email: "cert.cfgsecmgr@northwind.invalid" },
    field: { email: "cert.cfgfldmgr@northwind.invalid" },
    optionOnly: { email: "cert.cfgoptmgr@northwind.invalid" },
    titular: { email: "cert.cfgtitular@northwind.invalid" },
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
} as const;

const OPS = { email: "cert.ops@northwind.invalid" };

type Door =
    | "kpiListOrg" | "kpiCreate" | "kpiUpdate" | "kpiDelete"
    | "surfaceWorkUnitHeader" | "surfaceWorkspaceHeader" | "surfaceWorkspaceProcesses"
    | "recordOverviewLayout" | "bpLayoutAssign" | "bpLayoutSeed" | "queueRowLayout"
    | "sectionCreate" | "sectionUpdate" | "sectionDelete" | "drawerSections" | "drawerOrder"
    | "fieldVisibility" | "drawerFieldPlacements";

type Session = { page: Page; request: APIRequestContext; signedIn: boolean; close: () => Promise<void> };

async function signIn(browser: Browser, email: string): Promise<Session> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let signedIn = true;
    try {
        await page.waitForURL("**/workspace**", { timeout: 90_000 });
    } catch {
        signedIn = false;
    }
    return { page, request: page.request, signedIn, close: () => context.close() };
}

async function knock(r: APIRequestContext, door: Door): Promise<number> {
    const no = { data: {}, failOnStatusCode: false } as const;
    const K = "/api/admin/workspace-kpi-placements";
    const S = "/api/admin/surfaces";
    const D = "/api/admin/record-drawer-layouts";
    switch (door) {
        // ── LAYOUT PRESENTATION / PLACEMENT ──
        case "kpiListOrg": return (await r.get(`${K}?list=org`, { failOnStatusCode: false })).status();
        case "kpiCreate": return (await r.post(K, no)).status();
        case "kpiUpdate": return (await r.patch(K, no)).status();
        case "kpiDelete": return (await r.delete(`${K}?id=${NO_ID}`, { failOnStatusCode: false })).status();
        case "surfaceWorkUnitHeader": return (await r.put(`${S}/work-unit-header`, no)).status();
        case "surfaceWorkspaceHeader": return (await r.put(`${S}/workspace-header`, no)).status();
        case "surfaceWorkspaceProcesses": return (await r.put(`${S}/workspace-processes`, no)).status();
        case "recordOverviewLayout": return (await r.put("/api/admin/config/record-overview-layout", no)).status();
        case "bpLayoutAssign": return (await r.put("/api/admin/business-process-layout-assignments", no)).status();
        case "bpLayoutSeed": return (await r.post("/api/admin/business-process-layout-assignments", no)).status();
        case "queueRowLayout": return (await r.post(`/api/admin/queue-row-layout/${NO_ID}`, no)).status();
        // ── SECTION CONFIGURATION ──
        case "sectionCreate": return (await r.post("/api/admin/field-sections", no)).status();
        case "sectionUpdate": return (await r.patch(`/api/admin/field-sections/${NO_ID}`, no)).status();
        case "sectionDelete": return (await r.delete(`/api/admin/field-sections/${NO_ID}`, { failOnStatusCode: false })).status();
        case "drawerSections": return (await r.patch(`${D}/opportunity-workflow-v1-sections`, no)).status();
        case "drawerOrder": return (await r.patch(`${D}/opportunity-workflow-v1-order`, no)).status();
        // ── FIELD-SEMANTIC CONFIGURATION ──
        case "fieldVisibility": return (await r.put("/api/admin/config/field-definition-visibility", no)).status();
        case "drawerFieldPlacements": return (await r.patch(`${D}/opportunity-workflow-v1-field-placements`, no)).status();
    }
}

const admitted = (s: number) => s !== 403;

const LAYOUTS: Door[] = ["kpiListOrg", "kpiCreate", "kpiUpdate", "kpiDelete", "surfaceWorkUnitHeader",
    "surfaceWorkspaceHeader", "surfaceWorkspaceProcesses", "recordOverviewLayout", "bpLayoutAssign", "bpLayoutSeed"];
const SECTIONS: Door[] = ["sectionCreate", "sectionUpdate", "sectionDelete", "drawerSections", "drawerOrder"];
const FIELDS: Door[] = ["fieldVisibility", "drawerFieldPlacements"];
/** Scored doors. `queueRowLayout` is measured and reported but not scored — see the header. */
const ALL: Door[] = [...LAYOUTS, ...SECTIONS, ...FIELDS];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Configuration presentation authority — layouts, sections and fields", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — each capability opens its own family and no other", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            layout: LAYOUTS,
            section: SECTIONS,
            field: FIELDS,
            // Holds option_sets.manage — a real Configuration capability, and the wrong one here.
            optionOnly: [],
            titular: [],
            portalOnly: [],
        };
        for (const [who, persona] of Object.entries(PERSONAS)) {
            const s = await signIn(browser, persona.email);
            expect(s.signedIn, `${who} could not sign in; an unauthenticated 403 would fake a pass`).toBe(true);
            const allowed = new Set(owns[who as keyof typeof PERSONAS]);
            for (const door of ALL) {
                const status = await knock(s.request, door);
                record(who, door, status);
                expect(
                    admitted(status),
                    `${who} at ${door}: expected ${allowed.has(door) ? "ADMITTED" : "REFUSED"}, got ${status}`,
                ).toBe(allowed.has(door));
            }
            await s.close();
        }
    });

    test("PHASE 2 — a wrong Configuration capability is still the wrong one", async ({ browser }) => {
        /*
         * option_sets.manage is not a lesser capability; it is a sibling. If the three families had
         * been collapsed into one "configuration" idea, this persona would open all eighteen doors.
         */
        const s = await signIn(browser, PERSONAS.optionOnly.email);
        expect(s.signedIn).toBe(true);
        for (const door of ALL) {
            expect(admitted(await knock(s.request, door)), `option_sets.manage opened ${door}`).toBe(false);
        }
        await s.close();
    });

    test("PHASE 3 — the role LABEL carries nothing", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.titular.email);
        expect(s.signedIn).toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            expect(admitted(status), `a role NAMED Admin opened ${door} (${status})`).toBe(false);
        }
        await s.close();
    });

    test("PHASE 4 — the default admin keeps every one of them", async ({ request }) => {
        /*
         * The seeded operator is this tenant's real `admin`. It is the principal the old role literal
         * admitted, so it is the principal this slice must not have cost anything.
         */
        for (const door of ALL) {
            const status = await knock(request, door);
            record("seededOperatorAdmin", door, status);
            expect(admitted(status), `the default admin lost ${door} (${status})`).toBe(true);
        }
    });

    test("PHASE 5 — OPS CONVERGENCE: the authority was already ops's, by a different path", async ({ browser }) => {
        /*
         * The compatibility proof the Director's approval is conditional on, in two halves.
         *
         * HALF ONE — the canonical path was already open to ops. `/api/admin/rbac/permissions` is
         * read here through ops's own session: the keys it reports are the keys the configuration
         * proposal contract requires for create_section, set_field_requirement and
         * expose_field_on_layout. Ops holding them is what makes the direct route agreement a
         * convergence rather than a widening.
         *
         * HALF TWO — the direct route now agrees.
         */
        const s = await signIn(browser, OPS.email);
        expect(s.signedIn, "ops must still reach the portal").toBe(true);

        const res = await s.request.get("/api/admin/rbac/grants?role_key=ops", { failOnStatusCode: false });
        expect(res.ok(), "ops must be able to read its own role's grants for this proof to mean anything").toBe(true);
        const held = ((await res.json()) as { permission_keys?: string[] }).permission_keys ?? [];
        for (const key of ["layouts.manage", "sections.manage", "fields.manage"] as const) {
            record("opsHeldKeys", key, held.includes(key) ? 1 : 0);
            expect(
                held.includes(key),
                `ops does not hold ${key}, so admitting it at the direct route would be WIDENING, not convergence`,
            ).toBe(true);
        }

        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("defaultOps", door, status);
            expect(admitted(status), `ops was refused at ${door} (${status}) — convergence incomplete`).toBe(true);
        }
        await s.close();
    });

    test("PHASE 6 — portal admission alone opens nothing", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.portalOnly.email);
        expect(s.signedIn).toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("portalOnly", door, status);
            expect(admitted(status), `a portal-only principal reached ${door} (${status})`).toBe(false);
        }
        await s.close();
    });

    test("PHASE 7 — the KPI runtime read was not tightened", async ({ browser }) => {
        /*
         * Only the `?list=org` CONFIGURATION listing moved onto layouts.manage. The surface-scoped
         * read the workspace KPI strip performs is a different branch of the same handler and was
         * never gated; a slice that quietly took it would break the strip for every operator who is
         * not a layout manager. Measured against the persona with no configuration capability at all.
         */
        const s = await signIn(browser, PERSONAS.portalOnly.email);
        expect(s.signedIn).toBe(true);
        const runtime = await s.request.get("/api/admin/workspace-kpi-placements?surface=workspace", {
            failOnStatusCode: false,
        });
        record("portalOnly", "kpiRuntimeRead", runtime.status());
        expect(runtime.status(), "the workspace KPI strip read must stay open").not.toBe(403);
        await s.close();
    });

    test("PHASE 8 — the flag-gated door is reported, not scored", async ({ request }) => {
        /*
         * `queue-row-layout` answers its Layout V2 feature flag before it resolves a caller, so when
         * the flag is off it refuses the default admin too. That is a flag, not an authority finding,
         * and saying so is the honest result — scoring it would put a false negative in the matrix.
         */
        const res = await request.post(`/api/admin/queue-row-layout/${NO_ID}`, { data: {}, failOnStatusCode: false });
        const body = await res.text();
        const flagOff = res.status() === 403 && body.includes("Layout V2 config is not enabled");
        record("seededOperatorAdmin", "queueRowLayout", res.status());
        record("seededOperatorAdmin", "queueRowLayoutFlagDisabled", flagOff ? 1 : 0);
        if (flagOff) {
            test.info().annotations.push({
                type: "note",
                description: "queue-row-layout: Layout V2 flag is OFF on this stack; the capability gate is unreachable here and is covered by the repo lock and route inventory instead.",
            });
        } else {
            expect(admitted(res.status()), "with the flag on, the default admin must be admitted").toBe(true);
        }
    });
});
