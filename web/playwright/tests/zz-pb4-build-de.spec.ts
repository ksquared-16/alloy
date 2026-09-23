/**
 * §21 + §22 — two more certification children in the SAME household, shaped so their outstanding
 * sets are exactly 2 and exactly 3.
 *
 * Weekly periods tile from the accepted term's effective start, and the accept takes its effective
 * date from `as_of`. So a term effective 2026-09-15 has begun periods 09-15 and 09-22 — two — and
 * one effective 2026-09-08 has 09-08, 09-15 and 09-22 — three. Nothing is fabricated: the dates
 * are ordinary enrolment dates and the periods are whatever the canonical tiling makes of them.
 *
 * Same recipe as the first specimen, which is the point — it is now a known path, not a search.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const CUSTOMER = "e1c9afe0-5e8d-4077-904d-bb8e748a4fd4";   // PBCert Automation household
const OPP = "7aa18e83-eea7-432c-af4b-684a1cef9386";
const SITE = "1a5644a7-45c4-413b-9021-5f556118b6e2";
const PROGRAM = "5e9e715a-eb8f-4534-bcfe-a8a74ed883d9";

/*
 * D and E replace A and B for the post-repair proofs. A and B are not reusable: the defective
 * wake billed each of them one week PAST its outstanding set, so their outstanding counts are now
 * zero and neither can demonstrate a one-period or two-period bill again. C is untouched — it was
 * refused, so it still holds exactly three unconverged periods.
 */
const SPECIMENS = [
    { tag: "D_one_period",  first: "Pbfour", start: "2026-09-22" },
    { tag: "E_two_periods", first: "Pbfive", start: "2026-09-15" },
];

test("build B and C", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const r = await page.evaluate(async (c) => {
        const out: Array<Record<string, unknown>> = [];
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); return { s: x.status, j: await j(x) }; };
        const post = async (u: string, b: unknown) => { const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };
        const patch = async (u: string, b: unknown) => { const x = await fetch(u, { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };

        for (const sp of c.specimens) {
            const step: Record<string, unknown> = { tag: sp.tag, start: sp.start };
            const child = await post("/api/admin/customer-members", {
                customer_id: c.customer, display_name: `${sp.first} Automation`,
                relationship: "child", first_name: sp.first, last_name: "Automation", dob: "2020-04-01",
            });
            const cmId = /"id":"([0-9a-f-]{36})"/.exec(JSON.stringify(child.j))?.[1] ?? null;
            step.cmId = cmId;
            if (!cmId) { out.push({ ...step, stopped: "no child" }); continue; }

            const ocm = await post("/api/admin/opportunity-customer-members", {
                opportunity_id: c.opp, customer_member_id: cmId,
            });
            const ocmId = /"id":"([0-9a-f-]{36})"/.exec(JSON.stringify(ocm.j))?.[1] ?? null;
            step.ocmId = ocmId;
            if (!ocmId) { out.push({ ...step, stopped: "no ocm" }); continue; }

            await patch(`/api/admin/opportunity-customer-members/${ocmId}`, {
                schedule_type: "custom", program_category_id: c.program,
                location_id: c.site, start_date: sp.start,
            });

            const agreement = await post("/api/admin/child-enrollment-agreements", {
                customer_member_id: cmId, site_location_id: c.site, opportunity_id: c.opp,
                opportunity_customer_member_id: ocmId, customer_id: c.customer, start_date: sp.start,
                source_key: "periodic_billing_certification",
                metadata: { certification: "periodic_billing", not_human_qa_fixture: true },
            });
            step.agreementId = (agreement.j as { agreement?: { id?: string } })?.agreement?.id ?? null;

            /* Resolve and spend the key in one breath, and never re-declare the cadence. */
            let accepted: unknown = null;
            for (let attempt = 1; attempt <= 3; attempt += 1) {
                const priced = await get(`/api/admin/financial-config/opportunity/${c.opp}?as_of=${sp.start}`);
                const mine = ((priced.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
                    .find((a) => a.opportunityCustomerMemberId === ocmId) ?? null;
                type Opt = { sourceId?: string; cadenceKey?: string; amountCents?: number };
                const opts: Opt[] = [...(mine?.recommended ? [mine.recommended as Opt] : []), ...((mine?.applicable as Opt[]) ?? [])];
                const weekly = opts.find((o) => o.cadenceKey === "weekly") ?? null;
                if (!weekly?.sourceId || !mine?.resolutionKey) { step.pricingState = mine?.state; step.pricingReason = mine?.noMatchReason; break; }
                const res = await post("/api/admin/actions/execute", {
                    action_key: "enrollment.pricing.accept",
                    entity_type: "opportunity_customer_member", entity_id: ocmId,
                    mode: "execute", confirmation: { confirmed: true },
                    payload: {
                        opportunity_customer_member_id: ocmId,
                        resolution_key: mine.resolutionKey,
                        selected_source_id: weekly.sourceId,
                        as_of: sp.start,
                    },
                });
                accepted = res;
                if (res.s === 200) break;
            }
            step.accept = JSON.stringify(accepted).slice(0, 400);
            out.push(step);
        }
        return out;
    }, { customer: CUSTOMER, opp: OPP, site: SITE, program: PROGRAM, specimens: SPECIMENS });

    log(JSON.stringify(r, null, 1).slice(0, 5000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/specimens-de.json`, JSON.stringify(r, null, 2));
});
