/**
 * WORKFLOWS AUTHORITY CONVERGENCE V1 — AUTHORING AUTOMATION IS NOT FIRING IT.
 *
 * Five Workflow configuration handlers asked `requireAdmin()`, which is `auth.role !== "admin"` — a
 * ROLE TITLE. `ops.workflows.write` sat in the catalog, granted to admin in every organization and
 * to ops in two of three, enforced by exactly one route: the Workflow Assist apply path that AI +
 * Agent Authority V2 activated. So this file proves two things:
 *
 *   1. the five routes now answer to `ops.workflows.write` and to nothing else — in particular a
 *      custom Workflow author with NO privileged title is admitted, and a role LABELLED "Workflow
 *      Administrator" with no grant is refused;
 *   2. the key did NOT spread to workflow EXECUTION. `POST /workflows/[id]/run` drives
 *      `executeWorkflowRun`, which writes assignments, contacts, vendors, schedules, messages and
 *      jobs. A Workflow author must not reach six other product domains through it, so the run door
 *      must answer the SAME for the author as it did before — this slice did not give it authority
 *      and must not have taken any away either.
 *
 * 403 is the gate refusing; anything else is the gate admitting, because every gate runs before the
 * handler reads its body. A 400, 404 or 409 is therefore a PASS for an authorized persona.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "workflow-authority");
const PASSWORD = "alloy-local-cert";

/** Deliberately absent ids: the gate runs first, so a refusal is authority and never data. */
const NO_WORKFLOW = "99999999-0000-4000-8000-000000000401";

const PERSONAS = {
    writer: { email: "cert.wfwriter@northwind.invalid" },
    titular: { email: "cert.wftitular@northwind.invalid" },
    adjacent: { email: "cert.wfadjacent@northwind.invalid" },
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
} as const;

type Door = "create" | "edit" | "remove" | "actions" | "conditions";
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
    const W = `/api/admin/workflows/${NO_WORKFLOW}`;
    switch (door) {
        case "create": return (await r.post("/api/admin/workflows", no)).status();
        case "edit": return (await r.patch(W, no)).status();
        case "remove": return (await r.delete(W, { failOnStatusCode: false })).status();
        case "actions": return (await r.put(`${W}/actions`, no)).status();
        case "conditions": return (await r.put(`${W}/conditions`, no)).status();
    }
}

/** Execution, which this slice deliberately does NOT own. */
const runDoor = (r: APIRequestContext) =>
    r.post(`/api/admin/workflows/${NO_WORKFLOW}/run`, { data: {}, failOnStatusCode: false }).then((x) => x.status());

const admitted = (s: number) => s !== 403;
const ALL: Door[] = ["create", "edit", "remove", "actions", "conditions"];

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

test.describe.configure({ mode: "serial" });

test.describe("Workflow authority, and the execution line it must not cross", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — ops.workflows.write opens all five, and nothing else does", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            writer: ALL,
            titular: [],
            adjacent: [],
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

    test("PHASE 2 — the role LABEL carries nothing", async ({ browser }) => {
        /*
         * `mcert_wf_titular` is labelled "Workflow Administrator" and granted only `portal.access`.
         * Under the role-title gate this persona's LABEL was not what mattered either — `requireAdmin`
         * read the compatibility role — but the point stands for the product: a name is not a grant.
         */
        const s = await signIn(browser, PERSONAS.titular.email);
        expect(s.signedIn, "the titular admin must still reach the portal").toBe(true);
        for (const door of ALL) {
            expect(await knock(s.request, door), `a role NAMED Workflow Administrator must be refused at ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 3 — adjacent configuration authority does not imply Workflow authority", async ({ browser }) => {
        /*
         * `wfAdjacent` holds `business_process.configure` and `fields.manage`. Both configure the
         * organization, both sit beside Workflows in the product, and neither may open it.
         */
        const s = await signIn(browser, PERSONAS.adjacent.email);
        expect(s.signedIn).toBe(true);
        for (const door of ALL) {
            expect(await knock(s.request, door), `business_process.configure must not open ${door}`).toBe(403);
        }
        await s.close();
    });

    test("PHASE 4 — EXECUTION is not configuration, and this slice changed nothing there", async ({ browser }) => {
        /*
         * The run door drives a cross-domain engine. The Workflow AUTHOR must not have gained it,
         * and must not have lost anything either: its authority is unchanged portal admission, which
         * is recorded as WORK_AUTHORITY_MODEL_DEBT rather than repaired here.
         *
         * So the assertion is deliberately about EQUALITY, not about a fixed code: the author and a
         * portal-only principal must be treated the SAME at this door, because neither holds any
         * execution authority — there is none to hold.
         */
        const w = await signIn(browser, PERSONAS.writer.email);
        const writerRun = await runDoor(w.request);
        record("writer", "run", writerRun);
        await w.close();

        const p = await signIn(browser, PERSONAS.portalOnly.email);
        const portalRun = await runDoor(p.request);
        record("portalOnly", "run", portalRun);
        await p.close();

        expect(
            admitted(writerRun),
            "the run door must not have become a Workflow-authority door",
        ).toBe(admitted(portalRun));
    });
});
