/** §2–§7 continued: child, OCM, pricing facts on the OCM, agreement, resolution. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const OPP = "7aa18e83-eea7-432c-af4b-684a1cef9386";
const SITE = "1a5644a7-45c4-413b-9021-5f556118b6e2";
const PROGRAM = "5e9e715a-eb8f-4534-bcfe-a8a74ed883d9";
const START = "2026-09-22";

test("continue specimen", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const r = await page.evaluate(async (c) => {
        const steps: Array<Record<string, unknown>> = [];
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const post = async (u: string, b: unknown) => { const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };
        const patch = async (u: string, b: unknown) => { const x = await fetch(u, { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); return { s: x.status, j: await j(x) }; };

        const drawer = await get(`/api/admin/view-models/drawer/opportunity/${c.opp}`);
        const flat = JSON.stringify(drawer.j);
        const customerId = /"customer_id":"([0-9a-f-]{36})"/.exec(flat)?.[1]
            ?? /"customerId":"([0-9a-f-]{36})"/.exec(flat)?.[1] ?? null;
        steps.push({ step: "drawer", status: drawer.s, customerId });
        if (!customerId) return { steps, stopped: "no customer id", sample: flat.slice(0, 900) };

        const child = await post("/api/admin/customer-members", {
            customer_id: customerId, display_name: "Pbchild Automation",
            relationship: "child", first_name: "Pbchild", last_name: "Automation", dob: "2020-04-01",
        });
        const cmId = /"id":"([0-9a-f-]{36})"/.exec(JSON.stringify(child.j))?.[1] ?? null;
        steps.push({ step: "customer_member", status: child.s, cmId, body: JSON.stringify(child.j).slice(0, 300) });
        if (!cmId) return { steps, stopped: "no customer member" };

        const ocm = await post("/api/admin/opportunity-customer-members", {
            opportunity_id: c.opp, customer_member_id: cmId,
        });
        const ocmId = /"id":"([0-9a-f-]{36})"/.exec(JSON.stringify(ocm.j))?.[1] ?? null;
        steps.push({ step: "ocm", status: ocm.s, ocmId, body: JSON.stringify(ocm.j).slice(0, 300) });
        if (!ocmId) return { steps, stopped: "no ocm" };

        const facts = await patch(`/api/admin/opportunity-customer-members/${ocmId}`, {
            schedule_type: "full_time", program_category_id: c.program,
            location_id: c.site, start_date: c.start,
        });
        steps.push({ step: "ocm_facts", status: facts.s, body: JSON.stringify(facts.j).slice(0, 400) });

        const agreement = await post("/api/admin/child-enrollment-agreements", {
            customer_member_id: cmId, site_location_id: c.site, opportunity_id: c.opp,
            opportunity_customer_member_id: ocmId, customer_id: customerId, start_date: c.start,
            source_key: "periodic_billing_certification",
            metadata: { certification: "periodic_billing", not_human_qa_fixture: true },
        });
        const agreementId = (agreement.j as { agreement?: { id?: string } })?.agreement?.id ?? null;
        steps.push({ step: "agreement", status: agreement.s, agreementId });

        const priced = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
        const mine = ((priced.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === ocmId) ?? null;
        steps.push({ step: "pricing", status: priced.s, state: mine?.state, facts: mine?.facts,
            factSources: mine?.factSources, resolutionKey: mine?.resolutionKey,
            recommended: JSON.stringify(mine?.recommended ?? null).slice(0, 500),
            applicable: JSON.stringify(mine?.applicable ?? []).slice(0, 900),
            reason: mine?.noMatchReason ?? null });

        return { steps, ids: { opportunityId: c.opp, customerId, cmId, ocmId, agreementId } };
    }, { opp: OPP, site: SITE, program: PROGRAM, start: START });

    log(JSON.stringify(r, null, 1).slice(0, 7000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/fresh-specimen-continue.json`, JSON.stringify(r, null, 2));
});
