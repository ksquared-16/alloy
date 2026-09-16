/**
 * AI RESIDUAL AUTHORITY V1 — MOUNTED CERTIFICATION.
 *
 * `ai.enrichment.use` authorizes AI COMPUTATION AND PROPOSAL. It is not a domain authority, and a
 * domain authority is not a licence to propose. The sharpest case below is WORK CONFIGURER: a real,
 * granted capability holder who must still be refused here — if AI authority had quietly become a
 * superset, that case is what catches it.
 *
 * The doors are the three this slice converged. They previously answered to `requireAdminOrOps()`
 * alone — portal ADMISSION — while the sibling door to the same `task_assist_proposals` row required
 * the key through the Trust seam.
 *
 * STATUS CONTRACT. Gates run before handlers read bodies, so 403 with `required_permission` is an
 * AUTHORITY refusal; any other status is admission. Ids below are deliberately absent, so no case
 * can mutate real data to earn its result.
 *
 * A FAILED SIGN-IN IS A FAILED TEST, never a skip.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "ai-residual-authority");
const PASSWORD = "alloy-local-cert";
const ABSENT_PROPOSAL = "99999999-0000-4000-8000-000000000701";

const PERSONAS = {
    aiUser:         { email: "cert.aiuser@northwind.invalid",       propose: true  },
    defaultAdmin:   { email: "cert.defaultadmin@northwind.invalid", propose: true  },
    defaultOps:     { email: "cert.ops@northwind.invalid",          propose: true  },
    /* Holds fields/layouts-class domain authority via work.configure — and no AI key. */
    workConfigurer: { email: "cert.workconfig@northwind.invalid",   propose: false },
    titularAdmin:   { email: "cert.worktitular@northwind.invalid",  propose: false },
    portalOnly:     { email: "cert.portalonly@northwind.invalid",   propose: false },
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

type Probe = { status: number; refusedByAuthority: boolean };

async function probe(call: Promise<{ status: () => number; text: () => Promise<string> }>): Promise<Probe> {
    const res = await call;
    const status = res.status();
    if (status !== 403) return { status, refusedByAuthority: false };
    let body = "";
    try { body = await res.text(); } catch { /* unreadable body is not an authority refusal */ }
    return { status, refusedByAuthority: /ai\.enrichment\.use|AI_ENRICHMENT_FORBIDDEN/.test(body) };
}

const no = { data: {}, failOnStatusCode: false } as const;

async function door(r: APIRequestContext, which: "create" | "approve" | "reject"): Promise<Probe> {
    const base = "/api/admin/ai/task-assist/proposals";
    switch (which) {
        case "create":  return probe(r.post(base, no));
        case "approve": return probe(r.post(`${base}/${ABSENT_PROPOSAL}/approve`, no));
        case "reject":  return probe(r.post(`${base}/${ABSENT_PROPOSAL}/reject`, no));
    }
}

const DOORS = ["create", "approve", "reject"] as const;

test.beforeAll(() => fs.mkdirSync(EVIDENCE, { recursive: true }));

test.describe("AI residual authority — mounted", () => {
    for (const name of Object.keys(PERSONAS) as PersonaName[]) {
        const p = PERSONAS[name];
        test(`${name}: may${p.propose ? "" : " NOT"} propose, on the real product`, async ({ browser }) => {
            const s = await signIn(browser, p.email);
            try {
                const observed: Record<string, number> = {};
                for (const which of DOORS) {
                    const r = await door(s.request, which);
                    observed[which] = r.status;
                    if (p.propose) {
                        expect(r.refusedByAuthority, `${name} holds ai.enrichment.use; ${which} must not refuse on authority (got ${r.status})`).toBe(false);
                        expect(r.status, `${name} must be authenticated at ${which}`).not.toBe(401);
                    } else {
                        expect(r.refusedByAuthority, `${name} lacks ai.enrichment.use; ${which} must refuse on authority (got ${r.status})`).toBe(true);
                    }
                }
                await s.page.goto("/workspace");
                await s.page.waitForLoadState("domcontentloaded");
                await s.page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
                expect(s.page.url(), `${name} holds portal.access and must reach the workspace`).not.toMatch(/\/login/);
                fs.writeFileSync(path.join(EVIDENCE, `${name}.json`),
                    JSON.stringify({ persona: name, email: p.email, expected: p, observed }, null, 2));
            } finally {
                await s.close();
            }
        });
    }

    /**
     * AI IS NOT A DOMAIN SUPERUSER. The AI user may propose all day and still must not reach a
     * domain mutation. `work-units` POST answers to `work.configure`, which the AI user does not
     * hold — so the same session that is admitted above is refused here.
     */
    test("AI authority does not open a domain door", async ({ browser }) => {
        const s = await signIn(browser, PERSONAS.aiUser.email);
        try {
            expect((await door(s.request, "create")).refusedByAuthority, "AI user proposes").toBe(false);
            const domain = await s.request.post("/api/admin/work-units", no);
            expect(domain.status(), "and is refused at a domain door").toBe(403);
            const body = await domain.text();
            expect(body, "refused for the DOMAIN key, not the AI one").toContain("work.configure");
        } finally {
            await s.close();
        }
    });

    /**
     * W-17 through the canonical Access paths: the domain role opens the domain door on the next
     * request and closes it again, while AI proposal authority is untouched throughout.
     */
    test("W-17: adding a domain role opens domain apply; AI proposal authority is unaffected", async ({ browser }) => {
        const AI_USER_ID = "c0000000-0000-4000-8000-00000000d0c4";
        const WORK_CONFIGURER_ROLE = "mcert_work_configurer";
        const admin = await signIn(browser, PERSONAS.defaultAdmin.email);

        const ask = async () => {
            const s = await signIn(browser, PERSONAS.aiUser.email);
            try {
                const dom = await s.request.post("/api/admin/work-units", no);
                return {
                    propose: (await door(s.request, "create")).refusedByAuthority,
                    domain: dom.status() === 403,
                };
            } finally { await s.close(); }
        };

        try {
            const before = await ask();
            expect(before.propose, "AI user proposes from the start").toBe(false);
            expect(before.domain, "and is refused the domain door").toBe(true);

            const added = await admin.request.post(`/api/admin/users/${AI_USER_ID}/roles`,
                { data: { role: WORK_CONFIGURER_ROLE }, failOnStatusCode: false });
            expect(added.status(), "canonical Access path must accept the assignment").toBeLessThan(400);

            const opened = await ask();
            expect(opened.domain, "the domain role opens the domain door").toBe(false);
            expect(opened.propose, "and AI proposal authority is unaffected").toBe(false);

            const removed = await admin.request.delete(
                `/api/admin/users/${AI_USER_ID}/roles/${encodeURIComponent(WORK_CONFIGURER_ROLE)}`,
                { failOnStatusCode: false });
            expect(removed.status(), "canonical Access path must accept the removal").toBeLessThan(400);

            const closed = await ask();
            expect(closed.domain, "removing it closes the domain door again").toBe(true);
            expect(closed.propose, "AI proposal authority still unaffected").toBe(false);
        } finally {
            await admin.request.delete(
                `/api/admin/users/${AI_USER_ID}/roles/${encodeURIComponent(WORK_CONFIGURER_ROLE)}`,
                { failOnStatusCode: false });
            await admin.close();
        }
    });

    /**
     * CROSS-ORG, ON A REAL ROW — AND NOT WHAT I FIRST WROTE.
     *
     * My first version knocked with an empty payload and expected 403/404. It got 400, which was
     * correct behaviour and a wrong test. A foreign administrator genuinely HOLDS
     * `ai.enrichment.use` — in their OWN organization — so the capability gate admits them, exactly
     * as it should: a capability answers "may this principal do this KIND of thing", never "does
     * this row belong to them". Isolation is a row-level fact enforced after admission, and an empty
     * payload dies in validation long before reaching it.
     *
     * So this creates a REAL proposal in the certification organization through the real product,
     * lets the foreign admin attack it, and then proves the row is untouched.
     */
    test("a cross-org admin cannot reach this organization's proposal", async ({ browser }) => {
        const OPPORTUNITY = "00000000-0000-4000-8000-400000000001";
        const SUGGESTION = {
            version: 1,
            agent_key: "task_assist",
            suggestion_id: "c".repeat(48),
            generated_at_iso: "2026-05-14T12:00:00.000Z",
            org_id: "00000000-0000-4000-8000-000000000001",
            actor_user_id: "c0000000-0000-4000-8000-00000000d0c5",
            source_surface: "opportunity_drawer",
            task_type: "draft_sms",
            entity_type: "opportunities",
            entity_id: OPPORTUNITY,
            context_summary: "cert",
            /*
             * A real, ELIGIBLE candidate. An empty list fails Task Assist V1 validation with
             * no_recipient_candidates / no_eligible_recipient_for_channel, and the create then 422s
             * — which would leave this whole tenant case proving nothing.
             */
            recipient_candidates: [
                { person_id: "44444444-4444-4444-8444-444444444444", display_label: "Cert Person", has_sms: true, has_email: true },
            ],
            /* Must be null at propose time — the model proposes candidates, the operator selects. */
            selected_recipient: null,
            channel: "sms",
            draft_subject: null,
            draft_body: "cert",
            scheduled_for_iso: null,
            reminder_due_at_iso: null,
            assumptions: [],
            missing_inputs: [],
            warnings: [],
            validation_errors: [],
            confidence: { mode: "deterministic" },
            approval_required: true,
            apply_intent: { kind: "none" },
        };

        const owner = await signIn(browser, PERSONAS.defaultAdmin.email);
        const foreign = await signIn(browser, "cert.otherorg@adapter.invalid");
        try {
            const created = await owner.request.post("/api/admin/ai/task-assist/proposals", {
                data: { payload: SUGGESTION }, failOnStatusCode: false,
            });
            const createdBody = await created.text();
            expect(created.status(), `the owner must be able to create one: ${createdBody.slice(0, 300)}`).toBeLessThan(400);
            const id = JSON.parse(createdBody).proposal?.id as string;
            expect(id, "a real proposal id").toBeTruthy();

            for (const verb of ["approve", "reject"]) {
                const res = await foreign.request.post(
                    `/api/admin/ai/task-assist/proposals/${id}/${verb}`, { data: {}, failOnStatusCode: false });
                expect([403, 404], `foreign admin ${verb} must be refused or not-found, got ${res.status()}`)
                    .toContain(res.status());
            }

            /* The row must survive the attempt — refusal, not a silent state change. */
            const after = await owner.request.get(
                `/api/admin/ai/task-assist/proposals?entity_type=opportunities&entity_id=${OPPORTUNITY}`,
                { failOnStatusCode: false });
            expect(after.status()).toBe(200);
            const rows = JSON.parse(await after.text()).proposals as Array<{ id: string; status: string }>;
            const mine = rows.find((r) => r.id === id);
            expect(mine, "the owning org still sees its row").toBeTruthy();
            expect(mine!.status, "and its state is unchanged by the foreign attempt").toBe("draft");
        } finally {
            await foreign.close();
            await owner.close();
        }
    });
});
