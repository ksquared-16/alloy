/**
 * §2–§7 — a FRESH priceable certification specimen, built in the order pricing actually requires.
 *
 * ── WHY THE PREVIOUS ONE FAILED, AND WHAT THAT CHANGED HERE ───────────────────────────────────
 *
 * Pricing reads `attendanceType` from ONE place: `opportunity_customer_members.schedule_type`.
 * `assignmentPricingFacts` gives program and location a fallback (committed placement, else the
 * assignment row) but attendance has none. The last specimen got program and location from a
 * placement and never set schedule_type, so it stayed `missing_required_input` no matter what else
 * was built — and once an operational schedule existed, `schedule.create` refused to supersede it.
 *
 * So the facts are set on the OCM itself, through the governed inquiry-child patch route, BEFORE
 * anything operational exists. No schedule.create, no placement, nothing to supersede.
 *
 * Every step is a governed product route. No SQL, no manual financial row.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const SITE = "1a5644a7-45c4-413b-9021-5f556118b6e2";           // North Campus
const PROGRAM = "5e9e715a-eb8f-4534-bcfe-a8a74ed883d9";        // School Age at that site
const START = "2026-09-22";                                     // today UTC — anchors weekly periods

test("build fresh specimen", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);

    const r = await page.evaluate(async (c) => {
        const steps: Array<Record<string, unknown>> = [];
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const post = async (u: string, b: unknown) => { const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };
        const patch = async (u: string, b: unknown) => { const x = await fetch(u, { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); return { s: x.status, j: await j(x) }; };

        // 1 — the lead: household + opportunity.
        const lead = await post("/api/admin/actions/execute", {
            action_key: "create_lead", entity_type: "opportunity", entity_id: "",
            mode: "execute", confirmation: { confirmed: true },
            payload: {
                first_name: "PBCert", last_name: "Automation",
                email: "pbcert.automation@periodic-billing-cert.invalid", phone: "555-0199",
            },
        });
        const opportunityId = (lead.j as { data?: { affected_id?: string } })?.data?.affected_id ?? null;
        steps.push({ step: "create_lead", status: lead.s, opportunityId, body: JSON.stringify(lead.j).slice(0, 500) });
        if (!opportunityId) return { steps, stopped: "no opportunity id" };

        // 2 — the opportunity's customer (household).
        const opp = await get(`/api/admin/opportunities/${opportunityId}`);
        const customerId = (opp.j as { opportunity?: { customer_id?: string }; customer_id?: string })?.opportunity?.customer_id
            ?? (opp.j as { customer_id?: string })?.customer_id ?? null;
        steps.push({ step: "opportunity", status: opp.s, customerId, body: JSON.stringify(opp.j).slice(0, 400) });
        if (!customerId) return { steps, stopped: "no customer id" };

        // 3 — the child.
        const child = await post("/api/admin/customer-members", {
            customer_id: customerId, display_name: "Pbchild Automation",
            relationship: "child", first_name: "Pbchild", last_name: "Automation", dob: "2020-04-01",
        });
        const customerMemberId = (child.j as { member?: { id?: string }; id?: string })?.member?.id
            ?? (child.j as { id?: string })?.id ?? null;
        steps.push({ step: "customer_member", status: child.s, customerMemberId, body: JSON.stringify(child.j).slice(0, 400) });
        if (!customerMemberId) return { steps, stopped: "no customer member id" };

        // 4 — the child on the opportunity: the assignment row pricing reads.
        const ocm = await post("/api/admin/opportunity-customer-members", {
            opportunity_id: opportunityId, customer_member_id: customerMemberId,
        });
        const ocmId = (ocm.j as { member?: { id?: string }; id?: string })?.member?.id
            ?? (ocm.j as { id?: string })?.id ?? null;
        steps.push({ step: "ocm", status: ocm.s, ocmId, body: JSON.stringify(ocm.j).slice(0, 400) });
        if (!ocmId) return { steps, stopped: "no ocm id" };

        // 5 — THE PRICING FACTS, on the row that owns them.
        const facts = await patch(`/api/admin/opportunity-customer-members/${ocmId}`, {
            schedule_type: "full_time",
            program_category_id: c.program,
            location_id: c.site,
            start_date: c.start,
        });
        steps.push({ step: "ocm_facts", status: facts.s, body: JSON.stringify(facts.j).slice(0, 500) });

        // 6 — the enrolment, which is what makes a period billable rather than merely priced.
        const agreement = await post("/api/admin/child-enrollment-agreements", {
            customer_member_id: customerMemberId, site_location_id: c.site,
            opportunity_id: opportunityId, opportunity_customer_member_id: ocmId,
            customer_id: customerId, start_date: c.start,
            source_key: "periodic_billing_certification",
            metadata: { certification: "periodic_billing", not_human_qa_fixture: true },
        });
        const agreementId = (agreement.j as { agreement?: { id?: string } })?.agreement?.id ?? null;
        steps.push({ step: "agreement", status: agreement.s, agreementId, body: JSON.stringify(agreement.j).slice(0, 300) });

        // 7 — what tuition now resolves.
        const priced = await get(`/api/admin/financial-config/opportunity/${opportunityId}`);
        const mine = ((priced.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === ocmId) ?? null;
        steps.push({ step: "pricing", status: priced.s, state: mine?.state, facts: mine?.facts,
            factSources: mine?.factSources, resolutionKey: mine?.resolutionKey,
            recommended: JSON.stringify(mine?.recommended ?? null).slice(0, 400),
            applicable: JSON.stringify(mine?.applicable ?? []).slice(0, 900),
            reason: mine?.noMatchReason ?? null });

        return { steps, ids: { opportunityId, customerId, customerMemberId, ocmId, agreementId } };
    }, { site: SITE, program: PROGRAM, start: START });

    log(JSON.stringify(r, null, 1).slice(0, 7000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/fresh-specimen-build.json`, JSON.stringify(r, null, 2));
});
