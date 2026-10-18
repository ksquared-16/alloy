/**
 * WHICH CHILD IS THIS FEE FOR? — the Financials charge index names the child a household-billed charge
 * records (staging, ZZQA1496Q: Ava's $75 registration fee and Ben's $75 registration fee both read
 * "Household"). The child is a LABEL: the charge stays the household's — no member id, amount or status
 * changes — and a child outside the charge's household or org is never named.
 */
import { describe, expect, it } from "vitest";

import { resolveFinancialWorkQueue } from "@/lib/financials/workspace/resolveFinancialWorkQueue";

type Row = Record<string, unknown>;

function fake(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                order: () => api,
                limit: () => api,
                then: (res: (v: unknown) => void) => res({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
            };
            return api;
        },
    };
}

const ORG = "org-1";
const fee = (id: string, household: string, subject: string | null) => ({
    id, org_id: ORG, billable_source_type: "customer", billable_source_id: household, charge_category: "registration_fee", charge_type: "one_time",
    description: "Registration fee", amount_cents: 7500, currency_code: "usd", service_date: null, billable_on: null, status: "posted",
    metadata: subject ? { charge_template_key: "registration_fee", subject_customer_member_id: subject } : {}, created_at: "2026-10-18T00:00:00Z",
});
const tables = () => ({
    charges: [fee("ch-ava", "house-q", "ava"), fee("ch-ben", "house-q", "ben"), fee("ch-forged", "house-q", "other-kid"), fee("ch-plain", "house-q", null)],
    customers: [{ id: "house-q", org_id: ORG, name: "ZZQA1496Q Family" }],
    customer_members: [
        { id: "ava", org_id: ORG, customer_id: "house-q", display_name: "Ava ZZQA1496Q" },
        { id: "ben", org_id: ORG, customer_id: "house-q", display_name: "Ben ZZQA1496Q" },
        { id: "other-kid", org_id: ORG, customer_id: "house-other", display_name: "Someone Else" },
    ],
});

async function index() {
    const q = await resolveFinancialWorkQueue(fake(tables()) as never, { orgId: ORG, siteScope: "all", allowedSiteLocationIds: [], statuses: ["posted"] } as never);
    return new Map(q.rows.map((r) => [r.chargeId, r]));
}

describe("registration fees name their child; the money stays the household's", () => {
    it("sibling fees are separately identifiable", async () => {
        const rows = await index();
        expect(rows.get("ch-ava")?.childName).toBe("Ava ZZQA1496Q");
        expect(rows.get("ch-ben")?.childName).toBe("Ben ZZQA1496Q");
    });

    it("the label moves nothing: same household, no member id, same amount", async () => {
        const ava = (await index()).get("ch-ava")!;
        expect(ava.customerId).toBe("house-q");
        expect(ava.customerMemberId).toBeNull();
        expect(ava.amountCents).toBe(7500);
    });

    it("a child from another household is never named; a fee with no child stays Household", async () => {
        const rows = await index();
        expect(rows.get("ch-forged")?.childName).toBeNull();
        expect(rows.get("ch-plain")?.childName).toBeNull();
    });
});
