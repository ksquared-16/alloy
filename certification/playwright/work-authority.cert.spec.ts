/**
 * WORK AUTHORITY V1 — MOUNTED CERTIFICATION.
 *
 * Eight handlers were converged onto two new capabilities, and the Director model is that these
 * are DIFFERENT POWERS:
 *
 *   `work.configure`  defines what operational work EXISTS — the queue definition, the work units.
 *   `work.operate`    performs work inside a process already running — completing stage work,
 *                     closing a family, recording participant decisions, executing a workflow run.
 *
 * Admin holds both. Ops holds `work.operate` ONLY. There is deliberately no `work.manage` spanning
 * the two and no `work.assign`; assignment stays per product surface under Assignments Authority
 * Model V1.
 *
 * This file is the MOUNTED proof, and it exists because the direct proof could not be the whole
 * story: the direct suite mocks the grant resolver, so it proves the gate's logic but not that the
 * deployed capability reaches a real signed-in operator through the real product. It could not run
 * at all until `20260916030000` applied, because before that the keys did not exist in any database.
 *
 * THE STATUS CONTRACT. Every gate runs before its handler reads a body, so:
 *   403  = the gate refused        → the persona lacks authority
 *   anything else (400/404/409/200) = the gate ADMITTED → authority was sufficient
 * A 400 from a deliberately empty payload is therefore a PASS for an authorized persona. Ids below
 * are deliberately absent, so no case can mutate real data to earn its result.
 *
 * A FAILED SIGN-IN IS A FAILED TEST, never a skip. An earlier mounted matrix in this program
 * `continue`d past sign-in failures and reported a green half-matrix.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "work-authority");
const PASSWORD = "alloy-local-cert";

/** Deliberately absent. The gate runs first, so a refusal is authority and never data. */
const ABSENT_WORK_UNIT = "99999999-0000-4000-8000-000000000901";
const ABSENT_WORKFLOW = "99999999-0000-4000-8000-000000000902";

const PERSONAS = {
    configurer:   { email: "cert.workconfig@northwind.invalid",   configure: true,  operate: false },
    operator:     { email: "cert.workoperate@northwind.invalid",  configure: false, operate: true  },
    titular:      { email: "cert.worktitular@northwind.invalid",  configure: false, operate: false },
    portalOnly:   { email: "cert.portalonly@northwind.invalid",   configure: false, operate: false },
    defaultAdmin: { email: "cert.defaultadmin@northwind.invalid", configure: true,  operate: true  },
    defaultOps:   { email: "cert.ops@northwind.invalid",          configure: false, operate: true  },
    bpConfigurer: { email: "cert.bpconfig@northwind.invalid",     configure: false, operate: false },
    wfWriter:     { email: "cert.wfwriter@northwind.invalid",     configure: false, operate: false },
    aiUser:       { email: "cert.aiuser@northwind.invalid",       configure: false, operate: false },
} as const;
type PersonaName = keyof typeof PERSONAS;

type Session = { page: Page; request: APIRequestContext; close: () => Promise<void> };

async function signIn(browser: Browser, email: string): Promise<Session> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 90_000 });
    return { page, request: page.request, close: () => context.close() };
}

const no = { data: {}, failOnStatusCode: false } as const;

/**
 * A REAL row in the certification organization. The tenant case needs one: an empty payload dies in
 * validation before the handler ever reaches data, so it can prove nothing about isolation.
 */
const REAL_WORK_UNIT = "00000000-0000-4000-8000-000000000030";

/**
 * 403 IS NOT ONE ANSWER. `agent/v0/queue-definition` gates authority FIRST and then asks
 * `agentV0Enabled()`, which also answers 403 — as FEATURE_DISABLED. Treating every 403 as an
 * authority refusal made an admitted caller look refused, and worse, it would let a REMOVED gate
 * hide behind a disabled feature. So refusal is identified by its SHAPE, not its status.
 */
type Probe = { status: number; refusedByAuthority: boolean };

async function probe(call: Promise<{ status: () => number; text: () => Promise<string> }>): Promise<Probe> {
    const res = await call;
    const status = res.status();
    if (status !== 403) return { status, refusedByAuthority: false };
    let body = "";
    try { body = await res.text(); } catch { /* an unreadable body is not an authority refusal */ }
    const feature = /FEATURE_DISABLED/.test(body);
    return { status, refusedByAuthority: !feature };
}

/** The four doors that DEFINE work. */
async function configureDoor(r: APIRequestContext, door: string, id = ABSENT_WORK_UNIT): Promise<Probe> {
    const U = `/api/admin/work-units/${id}`;
    switch (door) {
        case "queue-definition": return probe(r.post("/api/admin/agent/v0/queue-definition", no));
        case "work-unit-create": return probe(r.post("/api/admin/work-units", no));
        case "work-unit-edit":   return probe(r.patch(U, no));
        case "work-unit-remove": return probe(r.delete(U, { failOnStatusCode: false }));
    }
    throw new Error(`unknown configure door ${door}`);
}

/** The four doors that PERFORM work. */
async function operateDoor(r: APIRequestContext, door: string): Promise<Probe> {
    switch (door) {
        case "complete-stage-work":  return probe(r.post("/api/admin/lifecycle-builder/complete-stage-work", no));
        case "family-close":         return probe(r.post("/api/admin/lifecycle-builder/family-close", no));
        case "participant-decisions":return probe(r.post("/api/admin/lifecycle-builder/participant-decisions", no));
        case "workflow-run":         return probe(r.post(`/api/admin/workflows/${ABSENT_WORKFLOW}/run`, no));
    }
    throw new Error(`unknown operate door ${door}`);
}

const CONFIGURE_DOORS = ["queue-definition", "work-unit-create", "work-unit-edit", "work-unit-remove"];
const OPERATE_DOORS = ["complete-stage-work", "family-close", "participant-decisions", "workflow-run"];

test.beforeAll(() => fs.mkdirSync(EVIDENCE, { recursive: true }));

test.describe("Work Authority V1 — mounted", () => {
    for (const name of Object.keys(PERSONAS) as PersonaName[]) {
        const p = PERSONAS[name];

        test(`${name}: configure=${p.configure} operate=${p.operate}, on the real product`, async ({ browser }) => {
            const s = await signIn(browser, p.email);
            try {
                const observed: Record<string, number> = {};

                for (const door of CONFIGURE_DOORS) {
                    const r = await configureDoor(s.request, door);
                    observed[`configure:${door}`] = r.status;
                    if (p.configure) {
                        expect(r.refusedByAuthority, `${name} holds work.configure and must not be refused at ${door} (got ${r.status})`).toBe(false);
                        expect(r.status, `${name} must be authenticated at ${door}`).not.toBe(401);
                    } else {
                        expect(r.refusedByAuthority, `${name} lacks work.configure and must be refused at ${door} (got ${r.status})`).toBe(true);
                    }
                }

                for (const door of OPERATE_DOORS) {
                    const r = await operateDoor(s.request, door);
                    observed[`operate:${door}`] = r.status;
                    if (p.operate) {
                        expect(r.refusedByAuthority, `${name} holds work.operate and must not be refused at ${door} (got ${r.status})`).toBe(false);
                        expect(r.status, `${name} must be authenticated at ${door}`).not.toBe(401);
                    } else {
                        expect(r.refusedByAuthority, `${name} lacks work.operate and must be refused at ${door} (got ${r.status})`).toBe(true);
                    }
                }

                /*
                 * MOUNTED SURFACES. My Tasks and the workspace that carries Focus Panel Current Work
                 * must be reachable by anyone admitted to the portal — Work authority governs the
                 * OPERATIONS, not portal admission, and conflating the two would be the same
                 * role-title mistake this program keeps repairing.
                 */
                await s.page.goto("/adminV2/tasks");
                await s.page.waitForLoadState("domcontentloaded");
                const tasksUrl = s.page.url();
                await s.page.screenshot({ path: path.join(EVIDENCE, `${name}-my-tasks.png`), fullPage: true });
                expect(tasksUrl, `${name} holds portal.access, so My Tasks must not bounce to login`).not.toMatch(/\/login/);

                await s.page.goto("/workspace");
                await s.page.waitForLoadState("domcontentloaded");
                await s.page.screenshot({ path: path.join(EVIDENCE, `${name}-current-work.png`), fullPage: true });
                expect(s.page.url(), `${name} must reach the workspace carrying Current Work`).not.toMatch(/\/login/);

                fs.writeFileSync(
                    path.join(EVIDENCE, `${name}.json`),
                    JSON.stringify({ persona: name, email: p.email, expected: p, observed, tasksUrl }, null, 2),
                );
            } finally {
                await s.close();
            }
        });
    }

    /**
     * THE SEPARATION, STATED AS ITS OWN CASE. The ops package depends on this: ops is seeded
     * `work.operate` and must not gain `work.configure` by being ops.
     */
    test("configure and operate do not imply one another, mounted", async ({ browser }) => {
        const cfg = await signIn(browser, PERSONAS.configurer.email);
        const opr = await signIn(browser, PERSONAS.operator.email);
        try {
            expect((await configureDoor(cfg.request, "work-unit-create")).refusedByAuthority, "configurer defines work").toBe(false);
            expect((await operateDoor(cfg.request, "family-close")).refusedByAuthority, "configurer must NOT operate").toBe(true);
            expect((await operateDoor(opr.request, "family-close")).refusedByAuthority, "operator operates").toBe(false);
            expect((await configureDoor(opr.request, "work-unit-create")).refusedByAuthority, "operator must NOT define").toBe(true);
        } finally {
            await cfg.close();
            await opr.close();
        }
    });

    /**
     * TENANT. A cross-org administrator is a full admin — in ANOTHER organization. Holding
     * `work.*` there must not reach this organization's work, and the workflow-run door is the
     * one that matters most: it drives `executeWorkflowRun`, which writes across six domains.
     */
    /**
     * W-17 COMPOSITION, THROUGH THE CANONICAL ACCESS PATHS.
     *
     * The direct suite already proves this logic, but it mocks the grant resolver, so it proves
     * what the gate DECIDES and not what a real access change DELIVERS. This case changes access
     * the way an administrator changes it — POST/DELETE on /api/admin/users/{id}/roles, the same
     * routes the role editor drives — and then asks the product again.
     *
     * No direct grant-table edit, and no TTL wait: each re-ask uses a FRESH session, so a stale
     * cached context cannot make a closed door look open or an open one look closed.
     */
    test("W-17: adding the operator role opens operate on the next request, removing it closes", async ({ browser }) => {
        const CONFIGURER_USER = "c0000000-0000-4000-8000-00000000d0c1";
        const OPERATOR_ROLE = "mcert_work_operator";

        const admin = await signIn(browser, PERSONAS.defaultAdmin.email);
        const ask = async () => {
            const s = await signIn(browser, PERSONAS.configurer.email);
            try {
                return {
                    operate: (await operateDoor(s.request, "family-close")).refusedByAuthority,
                    configure: (await configureDoor(s.request, "work-unit-create")).refusedByAuthority,
                };
            } finally {
                await s.close();
            }
        };

        try {
            const before = await ask();
            expect(before.operate, "configurer starts unable to operate").toBe(true);
            expect(before.configure, "configurer starts able to configure").toBe(false);

            const added = await admin.request.post(`/api/admin/users/${CONFIGURER_USER}/roles`, {
                data: { role: OPERATOR_ROLE },
                failOnStatusCode: false,
            });
            expect(added.status(), "the canonical Access path must accept the assignment").toBeLessThan(400);

            const opened = await ask();
            expect(opened.operate, "adding the operator role must OPEN operate on the next request").toBe(false);
            expect(opened.configure, "and configure must survive the composition").toBe(false);

            const removed = await admin.request.delete(
                `/api/admin/users/${CONFIGURER_USER}/roles/${encodeURIComponent(OPERATOR_ROLE)}`,
                { failOnStatusCode: false },
            );
            expect(removed.status(), "the canonical Access path must accept the removal").toBeLessThan(400);

            const closed = await ask();
            expect(closed.operate, "removing the operator role must CLOSE operate on the next request").toBe(true);
            expect(closed.configure, "and configure must still remain").toBe(false);
        } finally {
            /* Leave the persona exactly as the fixture provisions it, whatever happened above. */
            await admin.request.delete(
                `/api/admin/users/${CONFIGURER_USER}/roles/${encodeURIComponent(OPERATOR_ROLE)}`,
                { failOnStatusCode: false },
            );
            await admin.close();
        }
    });

    test("a cross-org admin is admitted by the gate and still cannot touch this org's row", async ({ browser }) => {
        /*
         * THIS IS THE POINT OF THE CASE, AND IT IS NOT WHAT I FIRST WROTE.
         *
         * A cross-org administrator HOLDS work.configure and work.operate — in their OWN
         * organization. So the capability gate admits them, correctly: the gate answers "may this
         * principal do this KIND of thing", not "does this row belong to them". Isolation is a
         * row-level fact enforced after admission, by ctx.orgId and assertRowOrg.
         *
         * An empty payload therefore proves nothing here: it dies in validation (400) before the
         * handler reaches any data. The proof needs a REAL row owned by the certification
         * organization, and the foreign admin must not be able to read or change it.
         */
        const foreign = await signIn(browser, "cert.otherorg@adapter.invalid");
        try {
            const edit = await configureDoor(foreign.request, "work-unit-edit", REAL_WORK_UNIT);
            expect([403, 404], `foreign admin editing this org's work unit must be refused or not-found, got ${edit.status}`).toContain(edit.status);

            const remove = await configureDoor(foreign.request, "work-unit-remove", REAL_WORK_UNIT);
            expect([403, 404], `foreign admin deleting this org's work unit must be refused or not-found, got ${remove.status}`).toContain(remove.status);

            const read = await foreign.request.get(`/api/admin/work-units/${REAL_WORK_UNIT}`, { failOnStatusCode: false });
            expect([403, 404], `foreign admin reading this org's work unit must be refused or not-found, got ${read.status()}`).toContain(read.status());

            /* And the row must still be there afterwards — refusal, not a silent delete. */
            const owner = await signIn(browser, PERSONAS.defaultAdmin.email);
            try {
                const still = await owner.request.get(`/api/admin/work-units/${REAL_WORK_UNIT}`, { failOnStatusCode: false });
                expect(still.status(), "the owning org's row must survive the foreign attempt").toBe(200);
            } finally {
                await owner.close();
            }
        } finally {
            await foreign.close();
        }
    });
});
