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

/** The four doors that DEFINE work. */
async function configureDoor(r: APIRequestContext, door: string): Promise<number> {
    const U = `/api/admin/work-units/${ABSENT_WORK_UNIT}`;
    switch (door) {
        case "queue-definition": return (await r.post("/api/admin/agent/v0/queue-definition", no)).status();
        case "work-unit-create": return (await r.post("/api/admin/work-units", no)).status();
        case "work-unit-edit":   return (await r.patch(U, no)).status();
        case "work-unit-remove": return (await r.delete(U, { failOnStatusCode: false })).status();
    }
    throw new Error(`unknown configure door ${door}`);
}

/** The four doors that PERFORM work. */
async function operateDoor(r: APIRequestContext, door: string): Promise<number> {
    switch (door) {
        case "complete-stage-work":  return (await r.post("/api/admin/lifecycle-builder/complete-stage-work", no)).status();
        case "family-close":         return (await r.post("/api/admin/lifecycle-builder/family-close", no)).status();
        case "participant-decisions":return (await r.post("/api/admin/lifecycle-builder/participant-decisions", no)).status();
        case "workflow-run":         return (await r.post(`/api/admin/workflows/${ABSENT_WORKFLOW}/run`, no)).status();
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
                    const status = await configureDoor(s.request, door);
                    observed[`configure:${door}`] = status;
                    if (p.configure) {
                        expect(status, `${name} holds work.configure and must pass ${door}`).not.toBe(403);
                        expect(status, `${name} must be authenticated at ${door}`).not.toBe(401);
                    } else {
                        expect(status, `${name} lacks work.configure and must be refused at ${door}`).toBe(403);
                    }
                }

                for (const door of OPERATE_DOORS) {
                    const status = await operateDoor(s.request, door);
                    observed[`operate:${door}`] = status;
                    if (p.operate) {
                        expect(status, `${name} holds work.operate and must pass ${door}`).not.toBe(403);
                        expect(status, `${name} must be authenticated at ${door}`).not.toBe(401);
                    } else {
                        expect(status, `${name} lacks work.operate and must be refused at ${door}`).toBe(403);
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
            expect(await configureDoor(cfg.request, "work-unit-create"), "configurer defines work").not.toBe(403);
            expect(await operateDoor(cfg.request, "family-close"), "configurer must NOT operate").toBe(403);
            expect(await operateDoor(opr.request, "family-close"), "operator operates").not.toBe(403);
            expect(await configureDoor(opr.request, "work-unit-create"), "operator must NOT define").toBe(403);
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
    test("a cross-org admin cannot reach this organization's work", async ({ browser }) => {
        const foreign = await signIn(browser, "cert.otherorg@adapter.invalid");
        try {
            for (const door of OPERATE_DOORS) {
                const status = await operateDoor(foreign.request, door);
                expect([403, 404], `cross-org admin at ${door} must be refused or not-found, got ${status}`).toContain(status);
            }
            for (const door of CONFIGURE_DOORS) {
                const status = await configureDoor(foreign.request, door);
                expect([403, 404], `cross-org admin at ${door} must be refused or not-found, got ${status}`).toContain(status);
            }
        } finally {
            await foreign.close();
        }
    });
});
