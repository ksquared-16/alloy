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
    scoped: { email: "cert.bpscoped@northwind.invalid" },
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
            // Holds both keys, but is restricted to one domain. Against the deliberately absent
            // NO_DEPT it is refused by SCOPE (404), never by authority — which is why it is excluded
            // from the capability matrix below and proven separately in PHASE 6.
            scoped: [],
            configurer: CONFIGURE,
            activator: ACTIVATE,
            composed: ALL,
            titular: [],
            portalOnly: [],
        };
        for (const [name, p] of Object.entries(PERSONAS) as [keyof typeof PERSONAS, { email: string }][]) {
            if (name === "scoped") continue;
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

    test("PHASE 6 — a capability does not bypass department scope", async ({ browser }) => {
        /*
         * THE CLAIM THIS SLICE MUST NOT QUIETLY BREAK.
         *
         * The product language stopped saying Department. The SCOPE dimension did not move, and
         * `departmentIdAllowed` still runs in every one of these handlers. `cert.bpscoped` holds
         * BOTH business process keys and is restricted to one operational domain, so the only thing
         * separating the two ids below is scope.
         *
         * The fixture provisions two plain grouping rows for exactly this: without a domain the
         * principal MAY reach and one it may not, "restricted" proves nothing. A refusal against a
         * merely non-existent id would be indistinguishable from a lookup miss.
         *
         * Doors are the ones whose scope check precedes body validation, so the answer is about
         * scope and not about an empty payload. 404 is the canonical refusal here — an out-of-scope
         * domain must not even be admitted to exist.
         */
        const ALLOWED = "c0000000-0000-4000-8000-0000000000a1";
        const DENIED = "c0000000-0000-4000-8000-0000000000a2";
        const doors: Door[] = ["builder", "requirements", "activate"];

        const s = await signIn(browser, PERSONAS.scoped.email);
        expect(s.signedIn, "the scoped persona must reach the portal").toBe(true);

        for (const door of doors) {
            const inScope = await knock(s.request, door, ALLOWED);
            record("scopedAllowed", door, inScope);
            expect(
                inScope,
                `a capability holder must NOT be refused inside its own operational domain at ${door}; got ${inScope}`,
            ).not.toBe(403);
            expect(
                inScope,
                `its own domain must not read as out of scope at ${door}; got ${inScope}`,
            ).not.toBe(404);

            const outOfScope = await knock(s.request, door, DENIED);
            record("scopedDenied", door, outOfScope);
            expect(
                outOfScope,
                `an out-of-scope operational domain must be refused at ${door}; got ${outOfScope}`,
            ).toBe(404);
        }
        await s.close();
    });

    test("PHASE 7 — a foreign organization's id is refused even holding both keys", async ({ browser }) => {
        /*
         * No widening across the org boundary. The composed persona has scope "all" INSIDE its own
         * tenant, so this is the org check answering rather than the department dimension. Doors are
         * restricted to those whose scope/lookup precedes body validation: `actionsMatrix` parses
         * its rows first and would answer 400 about the payload, which proves nothing about tenancy.
         */
        const s = await signIn(browser, PERSONAS.composed.email);
        for (const door of ["builder", "requirements", "activate"] as Door[]) {
            const status = await knock(s.request, door, FOREIGN_DEPT);
            record("composedForeign", door, status);
            expect(
                [403, 404].includes(status),
                `a foreign organization's id must be refused at ${door}; got ${status}`,
            ).toBe(true);
        }
        await s.close();
    });

    test("PHASE 8 — no Departments product destination survives, and Business Process still works", async ({ page }) => {
        /*
         * THE RETIREMENT, SEEN RATHER THAN GREPPED.
         *
         * This runs as the seeded operator (the `certify` project's stored session), because an
         * unauthenticated probe answers 307 to /login for every path and would "prove" the
         * retirement of pages that still exist.
         *
         * The convergence census found the settings entry registered in CONFIGURATION_WORKSPACE_DOMAINS
         * and then filtered straight back out by `advanced: true` — present in the table, absent from
         * the rail. So a nav assertion alone was never enough: the typed URL has to be gone too.
         */
        await page.goto("/organization", { waitUntil: "domcontentloaded" });
        const nav = page.getByRole("main").or(page.locator("body"));
        await expect(
            nav.getByRole("link", { name: /^Departments$/ }),
            "the configuration navigation must not offer a Departments destination",
        ).toHaveCount(0);

        // The typed URL, as an authenticated operator. Retired means not-found, not a rendered page.
        for (const url of ["/settings/departments", "/adminV2/settings/departments"]) {
            const res = await page.goto(url, { waitUntil: "domcontentloaded" });
            const status = res?.status() ?? 0;
            const body = await page.locator("body").innerText().catch(() => "");
            expect(
                status === 404 || /not found|404/i.test(body),
                `${url} must be retired for a signed-in operator; got ${status}`,
            ).toBe(true);
            expect(
                body,
                `${url} must not still render the Departments management screen`,
            ).not.toMatch(/Teams and organizational structure/);
        }

        // The legacy URL lands on the canonical owner rather than dead-ending.
        await page.goto("/legacy-admin/system/departments", { waitUntil: "domcontentloaded" });
        expect(page.url(), "the legacy Departments URL must land on Business Process").toContain("/organization/processes");

        // And the surfaces this slice must NOT have broken still load.
        for (const url of ["/organization/processes", "/organization/access"]) {
            const res = await page.goto(url, { waitUntil: "domcontentloaded" });
            expect(res?.status(), `${url} must still serve`).toBeLessThan(400);
        }
    });

    test("PHASE 9 — a grant reaches the holder on their next request, and a revoke removes it at once", async ({ browser, page }) => {
        /*
         * D2 / CACHE, FOR THE NEW CAPABILITIES.
         *
         * "The grant committed" and "the person has it" are different claims, and the gap between
         * them is a cache. So the change is made by the OPERATOR in one context and observed by the
         * TARGET in their own signed-in session — the same shape d2-access-change-audit uses.
         *
         * `mcert_bp_titular` is the subject precisely because it is the role LABELLED Admin that
         * holds nothing: it starts refused, which makes the grant below non-vacuous, and it must end
         * refused, which makes the revoke non-vacuous too.
         *
         * There is deliberately NO wait anywhere in this test. Every assertion is the target's very
         * next authoritative request after the operator's save returns. If the cache were not
         * invalidated on commit, or invalidated before it, this is where it shows.
         */
        const ROLE = "mcert_bp_titular";
        const setKeys = async (keys: string[]) => {
            const res = await page.request.patch(`/api/admin/rbac/roles/${ROLE}`, {
                data: { permission_keys: keys },
                failOnStatusCode: false,
            });
            expect(res.status(), await res.text()).toBeLessThan(400);
        };

        const target = await signIn(browser, PERSONAS.titular.email);
        expect(target.signedIn, "the target must reach the portal to observe anything").toBe(true);
        try {
            // NON-VACUITY: refused before the grant, or the grant proves nothing.
            expect(await knock(target.request, "builder"), "the titular admin must start refused").toBe(403);

            await setKeys(["portal.access", "business_process.configure"]);
            const afterGrant = await knock(target.request, "builder");
            record("d2GrantThenProbe", "builder", afterGrant);
            expect(
                afterGrant,
                `the grant must reach the holder on their next request without a TTL wait; got ${afterGrant}`,
            ).not.toBe(403);

            // Configure still must not open activation — the split survives a live grant.
            expect(await knock(target.request, "activate"), "configure alone must not activate").toBe(403);

            await setKeys(["portal.access"]);
            const afterRevoke = await knock(target.request, "builder");
            record("d2RevokeThenProbe", "builder", afterRevoke);
            expect(
                afterRevoke,
                `the revoke must deny immediately, not after a TTL; got ${afterRevoke}`,
            ).toBe(403);
        } finally {
            // Leave the fixture as the next run expects to find it, however this ended.
            await setKeys(["portal.access"]);
            await target.close();
        }
    });
});
