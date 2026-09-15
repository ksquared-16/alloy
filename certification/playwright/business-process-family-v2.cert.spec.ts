/**
 * BUSINESS PROCESS FAMILY CONVERGENCE V2 — ENROLLMENT PROCESS + LIFECYCLE CATALOG.
 *
 * V1 proved the business-process capabilities work. This file proves they were given to the right
 * eleven routes, which is a different claim and the harder one.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──
 *
 * Every one of these routes used to ask `ctx.role !== "admin"`, so every one of them behaved
 * identically and no test could tell them apart. Rehoming them onto two keys makes them behave
 * DIFFERENTLY from each other, and a difference nobody measures is a difference nobody maintains.
 *
 * ── THE PROOF THIS FILE IS NAMED FOR (PHASE 2) ──
 *
 * `enrollment-process/stage-work-unit/route.ts` holds three handlers and TWO capabilities. POST and
 * PATCH take `business_process.configure`; DELETE takes `business_process.activate`, because DELETE
 * takes a live builder-owned enrollment pipeline work unit offline while the other two only edit the
 * definition. So a configurer may shape a pipeline it may not stop, and an activator may stop one it
 * may not shape. That is a Director decision about business consequence, and PHASE 2 is the only
 * thing standing between it and a future reader who "fixes" the file into one capability per route.
 *
 * ── HOW A REFUSAL IS READ ──
 *
 * 403 is the gate refusing; anything else is the gate ADMITTING, because every gate here runs before
 * its handler reads a body. An admitted persona therefore lands on 400 ("department_id is required"),
 * and that 400 is a PASS. Probes send empty bodies for this reason, and for one more: with no body,
 * `cleanup-test` computes `dry_run = body.confirm !== true` as TRUE, so even a fully authorized probe
 * against it removes nothing. PHASE 7 measures that rather than trusting it.
 *
 * Personas come from `fixtures/access-personas.mjs`; run
 * `node ../certification/playwright/fixtures/access-personas.mjs setup` from `web/` first, and
 * RESTART the certification server afterwards — a direct grant write does not invalidate the
 * server's access-bundle cache, so a stale bundle would refuse a persona that now holds the key.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "business-process-family-v2");
const PASSWORD = "alloy-local-cert";

/** Deliberately absent. The gate runs first, so a refusal here is authority and never data. */
const NO_DEPT = "99999999-0000-4000-8000-000000000201";

const PERSONAS = {
    configurer: { email: "cert.bpconfig@northwind.invalid" },
    activator: { email: "cert.bpactivate@northwind.invalid" },
    composed: { email: "cert.bpowner@northwind.invalid" },
    titular: { email: "cert.bptitular@northwind.invalid" },
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
} as const;

const OPS = { email: "cert.ops@northwind.invalid" };

type Door =
    | "stageActions" | "stageRuntimeConfig" | "workUnitCreate" | "workUnitUpdate" | "statusStages"
    | "workUnitDeactivate" | "attachRecords" | "cleanupTest" | "catalogDelete"
    | "repairWorkUnits" | "repairVisibility";

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
    const E = "/api/admin/enrollment-process";
    const L = "/api/admin/lifecycle-catalog";
    switch (door) {
        // ── DEFINITION. These five shape what the process IS. ──
        case "stageActions": return (await r.post(`${E}/stage-actions`, no)).status();
        case "stageRuntimeConfig": return (await r.post(`${E}/stage-runtime-config`, no)).status();
        case "workUnitCreate": return (await r.post(`${E}/stage-work-unit`, no)).status();
        case "workUnitUpdate": return (await r.patch(`${E}/stage-work-unit`, no)).status();
        case "statusStages": return (await r.patch(`${E}/status-stages`, no)).status();
        // ── OPERATION. These six change what is RUNNING. ──
        case "workUnitDeactivate": return (await r.delete(`${E}/stage-work-unit`, no)).status();
        case "attachRecords": return (await r.post(`${L}/attach-records`, no)).status();
        case "cleanupTest": return (await r.post(`${L}/cleanup-test`, no)).status();
        case "catalogDelete": return (await r.post(`${L}/delete`, no)).status();
        case "repairWorkUnits": return (await r.post(`${L}/repair-work-units`, no)).status();
        case "repairVisibility": return (await r.post(`${L}/repair`, no)).status();
    }
}

const admitted = (s: number) => s !== 403;

const CONFIGURE: Door[] = ["stageActions", "stageRuntimeConfig", "workUnitCreate", "workUnitUpdate", "statusStages"];
const ACTIVATE: Door[] = ["workUnitDeactivate", "attachRecords", "cleanupTest", "catalogDelete", "repairWorkUnits", "repairVisibility"];
const ALL: Door[] = [...CONFIGURE, ...ACTIVATE];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Business Process family authority — enrollment process and lifecycle catalog", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — each capability opens its own family and no other", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            configurer: CONFIGURE,
            activator: ACTIVATE,
            composed: ALL,
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

    test("PHASE 2 — ONE ROUTE FILE, TWO CAPABILITIES: stage-work-unit does not imply itself", async ({ browser }) => {
        /*
         * The Director decision, measured. If someone later collapses this file onto a single
         * capability, exactly this test fails and nothing else does.
         */
        const configurer = await signIn(browser, PERSONAS.configurer.email);
        expect(configurer.signedIn).toBe(true);
        const cPost = await knock(configurer.request, "workUnitCreate");
        const cPatch = await knock(configurer.request, "workUnitUpdate");
        const cDelete = await knock(configurer.request, "workUnitDeactivate");
        await configurer.close();

        const activator = await signIn(browser, PERSONAS.activator.email);
        expect(activator.signedIn).toBe(true);
        const aPost = await knock(activator.request, "workUnitCreate");
        const aPatch = await knock(activator.request, "workUnitUpdate");
        const aDelete = await knock(activator.request, "workUnitDeactivate");
        await activator.close();

        const composed = await signIn(browser, PERSONAS.composed.email);
        expect(composed.signedIn).toBe(true);
        const xPost = await knock(composed.request, "workUnitCreate");
        const xPatch = await knock(composed.request, "workUnitUpdate");
        const xDelete = await knock(composed.request, "workUnitDeactivate");
        await composed.close();

        expect(admitted(cPost), "configurer may CREATE a stage work unit").toBe(true);
        expect(admitted(cPatch), "configurer may EDIT a stage work unit").toBe(true);
        expect(admitted(cDelete), "configurer may NOT take a running work unit offline").toBe(false);

        expect(admitted(aDelete), "activator may take a running work unit offline").toBe(true);
        expect(admitted(aPost), "activator may NOT create a stage work unit").toBe(false);
        expect(admitted(aPatch), "activator may NOT edit a stage work unit").toBe(false);

        expect([xPost, xPatch, xDelete].every(admitted), "the composed role holds all three").toBe(true);
    });

    test("PHASE 3 — the role LABEL carries nothing", async ({ browser }) => {
        /*
         * `mcert_bp_titular` is DISPLAYED as Admin and holds no process capability. If any door opens
         * for it, authority is still being read off a title somewhere upstream of these routes.
         */
        const s = await signIn(browser, PERSONAS.titular.email);
        expect(s.signedIn).toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("titular", door, status);
            expect(admitted(status), `a role merely NAMED Admin opened ${door} (${status})`).toBe(false);
        }
        await s.close();
    });

    test("PHASE 4 — default ops is refused, exactly as it was before the convergence", async ({ browser }) => {
        /*
         * Compatibility, measured in the direction where it can actually break.
         *
         * THE DEFAULT ADMIN IS NOT SIGNED IN HERE, and that is deliberate rather than an omission:
         * this tenant has no same-org admin persona (the only `role: "admin"` fixture belongs to
         * OTHER_ORG and exists to prove tenant isolation). Inventing one to sign in would prove less
         * than the two instruments that already cover it — PHASE 1 shows the composed persona opens
         * all eleven doors with these two keys, and `grantSeedEnumeration` locks that the admin
         * default package enumerates both. Admin holds the keys; the keys open the doors.
         *
         * Ops is the direction that CAN regress, because widening the default package would open
         * eleven destructive routes to every operations user at once. Every one of these answered ops
         * 403 under the role literal, and ops receives neither key, so it still does.
         */
        const o = await signIn(browser, OPS.email);
        expect(o.signedIn, "ops must still reach the portal").toBe(true);
        for (const door of ALL) {
            const status = await knock(o.request, door);
            record("defaultOps", door, status);
            expect(status, `ops reached ${door} (${status}) — the default package widened`).toBe(403);
        }
        await o.close();
    });

    test("PHASE 5 — the keys are the SAME keys V1 shipped, not new ones", async ({ browser }) => {
        /*
         * Cross-family, deliberately. The V1 doors and the V2 doors are opened by ONE persona holding
         * ONE key each. If this slice had quietly minted a second configure key, the configurer would
         * open V2's definition doors and fail V1's, or the reverse.
         */
        const s = await signIn(browser, PERSONAS.configurer.email);
        expect(s.signedIn).toBe(true);
        const v1Builder = (await s.request.patch(`/api/admin/departments/${NO_DEPT}/lifecycle-builder`, {
            data: {}, failOnStatusCode: false,
        })).status();
        const v2Definition = await knock(s.request, "stageRuntimeConfig");
        record("configurer", "v1LifecycleBuilder", v1Builder);
        expect(admitted(v1Builder), "the V1 configure door").toBe(true);
        expect(admitted(v2Definition), "the V2 configure door, same key").toBe(true);
        await s.close();

        const a = await signIn(browser, PERSONAS.activator.email);
        expect(a.signedIn).toBe(true);
        const v1Activate = (await a.request.patch(`/api/admin/departments/${NO_DEPT}/lifecycle-activation`, {
            data: {}, failOnStatusCode: false,
        })).status();
        record("activator", "v1LifecycleActivation", v1Activate);
        expect(admitted(v1Activate), "the V1 activate door").toBe(true);
        expect(admitted(await knock(a.request, "repairVisibility")), "the V2 activate door, same key").toBe(true);
        await a.close();
    });

    test("PHASE 6 — the portal persona reaches none of it", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.portalOnly.email);
        expect(s.signedIn).toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("portalOnly", door, status);
            expect(admitted(status), `a portal-only principal reached ${door} (${status})`).toBe(false);
        }
        await s.close();
    });

    test("PHASE 7 — cleanup-test admits, and still removes nothing", async ({ browser }) => {
        /*
         * Gating a destructive route is only half the answer. The other half is that the route is
         * bounded even for someone who IS authorized: with no `confirm: true`, cleanup-test runs as a
         * dry run. A certification that only measured the 403 would not notice if that bound were
         * removed, so this reads the authorized response instead.
         */
        const s = await signIn(browser, PERSONAS.composed.email);
        expect(s.signedIn).toBe(true);
        const res = await s.request.post("/api/admin/lifecycle-catalog/cleanup-test", {
            data: {}, failOnStatusCode: false,
        });
        record("composed", "cleanupTestAuthorizedStatus", res.status());
        expect(res.status(), "an authorized caller is admitted").not.toBe(403);
        if (res.status() === 200) {
            const body = (await res.json()) as { dry_run?: boolean; removed?: { deleted: boolean }[] };
            expect(body.dry_run, "no confirm:true means DRY RUN").toBe(true);
            expect(
                (body.removed ?? []).every((r) => r.deleted === false),
                "a dry run must report candidates without having deleted them",
            ).toBe(true);
        }
        await s.close();
    });
});
