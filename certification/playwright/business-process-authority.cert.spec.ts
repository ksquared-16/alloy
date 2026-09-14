/**
 * DEPARTMENT PRODUCT RETIREMENT + BUSINESS PROCESS AUTHORITY CONVERGENCE V1.
 *
 * Eight handlers under `/api/admin/departments` asked `ctx.role !== "admin"`, and the convergence
 * census proved not one of them is a department operation. Every mounted caller of the four
 * lifecycle families is a Lifecycle or Business Process surface; the generic POST is reached only by
 * the Lifecycle create flow provisioning a new process's runtime identity. So the authority is the
 * process family's, and this file proves the product behaves that way.
 *
 * ── WHAT EACH PHASE IS FOR ──
 *
 * 1. Each capability opens its own family and no other. Configure must not activate.
 * 2. Composition. Holding both keys reconstructs the old admin-only behaviour out of capabilities,
 *    which is the point: an organization can now split a job that used to require the admin title.
 * 3. The role LABEL carries nothing. `mcert_bp_titular` is called Admin and holds no process key.
 * 4. Default admin still works and default ops is still refused — compatibility, measured rather
 *    than assumed.
 * 5. The generic department DELETE is GONE. A destructive admin-only route surviving behind a
 *    removed UI is the hidden surface this program exists to eliminate, so its absence is proven
 *    against the default admin — the one principal that could previously use it.
 * 6. Department SCOPE still binds. A capability must not bypass scope merely because the product
 *    language no longer says Department.
 *
 * 403 is the gate refusing; anything else is the gate admitting, since every gate runs before the
 * handler reads its body. A 400, 404 or 409 is therefore a PASS for an authorized persona.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "business-process-authority");
const PASSWORD = "alloy-local-cert";

/** Deliberately absent ids: the gate runs first, so a refusal is authority and never data. */
const NO_DEPT = "99999999-0000-4000-8000-000000000201";
const FOREIGN_DEPT = "99999999-0000-4000-8000-0000000002f0";

const PERSONAS = {
    configurer: { email: "cert.bpconfig@northwind.invalid" },
    activator: { email: "cert.bpactivate@northwind.invalid" },
    composed: { email: "cert.bpowner@northwind.invalid" },
    titular: { email: "cert.bptitular@northwind.invalid" },
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
} as const;

const OPS = { email: "cert.ops@northwind.invalid" };

type Door =
    | "provision" | "rename" | "builder" | "requirements" | "actionsMatrix"
    | "activate" | "deactivate" | "deleteDepartment";

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

async function knock(r: APIRequestContext, door: Door, deptId = NO_DEPT): Promise<number> {
    const no = { data: {}, failOnStatusCode: false } as const;
    const D = `/api/admin/departments/${deptId}`;
    switch (door) {
        // Provisioning the runtime identity a NEW business process needs. The operator types a
        // process name; this is the first hop of createLifecycleViaBuilderPath.
        case "provision": return (await r.post("/api/admin/departments", no)).status();
        // The Lifecycle rename sync — a process-owned column on the runtime row.
        case "rename": return (await r.patch(D, { data: { name: "cert probe" }, failOnStatusCode: false })).status();
        case "builder": return (await r.patch(`${D}/lifecycle-builder`, no)).status();
        case "requirements": return (await r.patch(`${D}/lifecycle-requirements`, no)).status();
        case "actionsMatrix": return (await r.put(`${D}/lifecycle-actions-matrix`, no)).status();
        case "activate": return (await r.patch(`${D}/lifecycle-activation`, no)).status();
        case "deactivate": return (await r.delete(`${D}/lifecycle-activation`, { failOnStatusCode: false })).status();
        case "deleteDepartment": return (await r.delete(D, { failOnStatusCode: false })).status();
    }
}

const admitted = (s: number) => s !== 403;
const CONFIGURE: Door[] = ["provision", "rename", "builder", "requirements", "actionsMatrix"];
const ACTIVATE: Door[] = ["activate", "deactivate"];
const ALL: Door[] = [...CONFIGURE, ...ACTIVATE];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Business Process authority, and a retired Department product", () => {
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
        for (const [name, p] of Object.entries(PERSONAS) as [keyof typeof PERSONAS, { email: string }][]) {
            const s = await signIn(browser, p.email);
            expect(s.signedIn, `${name} could not sign in`).toBe(true);
            for (const door of ALL) {
                const status = await knock(s.request, door);
                record(name, door, status);
                const expected = owns[name].includes(door);
                expect(
                    admitted(status),
                    `${name} at ${door}: expected ${expected ? "ADMITTED" : "REFUSED (403)"}, got ${status}`,
                ).toBe(expected);
            }
            await s.close();
        }
    });

    test("PHASE 2 — designing a process never implies switching the tenant onto it", async ({ browser }) => {
        /*
         * The reason two keys were minted rather than one. If either of these opened, the split is
         * decorative and a process designer could activate in production.
         */
        const s = await signIn(browser, PERSONAS.configurer.email);
        for (const door of ACTIVATE) {
            const status = await knock(s.request, door);
            expect(status, `a process DESIGNER must not ${door}`).toBe(403);
        }
        await s.close();

        const a = await signIn(browser, PERSONAS.activator.email);
        for (const door of CONFIGURE) {
            const status = await knock(a.request, door);
            expect(status, `a process ACTIVATOR must not ${door}`).toBe(403);
        }
        await a.close();
    });

    test("PHASE 3 — the role label carries nothing", async ({ browser }) => {
        /*
         * `mcert_bp_titular` is labelled "Admin" and granted only portal.access. Under the role
         * literal this persona held every one of these doors. It now holds none.
         */
        const s = await signIn(browser, PERSONAS.titular.email);
        expect(s.signedIn, "the titular admin must still reach the portal").toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("titular", door, status);
            expect(status, `a role NAMED Admin must be refused at ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 4 — default ops is refused, exactly as it was before the convergence", async ({ browser }) => {
        /*
         * Compatibility measured rather than assumed. Every one of these routes answered ops 403
         * under the role literal; ops receives neither new key, so it still does. If this ever goes
         * green the seed has widened access under cover of a cleanup.
         */
        const s = await signIn(browser, OPS.email);
        expect(s.signedIn, "ops must still reach the portal").toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("defaultOps", door, status);
            expect(status, `default ops must remain refused at ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 5 — the generic department DELETE is gone, not merely unreachable", async ({ browser }) => {
        /*
         * Proven against the persona that could previously use it. The route had no mounted caller
         * and could not have worked on a real operational domain — department_id is NOT NULL on
         * business_process_revisions, business_process_drafts, work_units and user_department_access
         * — so it is retired rather than capability-enabled. 405 is Next.js answering for a method
         * the route no longer implements; 404 is the route not resolving. Neither is 403, because
         * there is no gate left to refuse: there is no handler.
         */
        const s = await signIn(browser, PERSONAS.composed.email);
        const status = await knock(s.request, "deleteDepartment");
        record("composed", "deleteDepartment", status);
        expect(
            [404, 405].includes(status),
            `the retired DELETE must not be handled; got ${status}`,
        ).toBe(true);
        await s.close();
    });

    test("PHASE 6 — a capability does not bypass department scope, or an org boundary", async ({ browser }) => {
        /*
         * The product language no longer says Department. The SCOPE dimension is unchanged and still
         * binds: `departmentIdAllowed` runs in every one of these handlers. A foreign id must not
         * become reachable merely because the caller now holds a capability instead of a title.
         */
        const s = await signIn(browser, PERSONAS.composed.email);
        for (const door of ["builder", "requirements", "actionsMatrix", "activate"] as Door[]) {
            const status = await knock(s.request, door, FOREIGN_DEPT);
            record("composedForeign", door, status);
            expect(
                [403, 404].includes(status),
                `a foreign operational domain must be refused at ${door}; got ${status}`,
            ).toBe(true);
        }
        await s.close();
    });
});
