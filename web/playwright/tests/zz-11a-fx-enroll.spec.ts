/**
 * The generator named its own two obstacles, precisely, which is what a good refusal does:
 *
 *   79f8011d · cadence_not_billed_by_this_run   — a WEEKLY term, and the run bills monthly
 *   cf044308 · assignment_not_enrolled          — the accepted term carries no enrollment agreement
 *
 * The second is a fixture gap: `enrollment_pricing_terms.enrollment_agreement_id` is stamped at
 * ACCEPT time from the assignment's agreement, and there was none. So the agreement is created
 * through the enrollment-decision authority, and the terms are re-accepted with `supersede` so the
 * new term carries it. Superseding is the canonical way to replace a live term on the same date —
 * the card itself sends that flag — and nothing is edited in place.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const FX = {
    opportunity: "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a",
    site: "1a5644a7-45c4-413b-9021-5f556118b6e2",
    start: "2026-09-01",
    a: { ocm: "79f8011d-a236-4054-bee7-af10f1dbc632", member: "e408fa51-7261-43c4-8e60-555d17fc9888", source: "5532489d-eed3-4080-9477-f47a94fde1c6", key: "2f92ec30" },
    b: { ocm: "cf044308-3ee4-47ab-a8fb-205eb172aa48", member: "46105cd4-6030-417d-a7cb-faf409071c0d", source: "96a67825-18ac-4b53-a1e2-f4686c28e7c6", key: "b2e43fd1" },
};

test("agreements, then re-accept", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const out = await page.evaluate(async (fx) => {
        const post = async (u: string, body: unknown) => {
            const r = await fetch(u, {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" }, body: JSON.stringify(body),
            });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const agreement = (c: { ocm: string; member: string }) =>
            post("/api/admin/child-enrollment-agreements", {
                customer_member_id: c.member,
                site_location_id: fx.site,
                opportunity_id: fx.opportunity,
                opportunity_customer_member_id: c.ocm,
                start_date: fx.start,
                source_key: "thread_11a_recurring_certification",
            });

        const agA = await agreement(fx.a);
        const agB = await agreement(fx.b);

        const cfg1 = await fetch(`/api/admin/financial-config/opportunity/${fx.opportunity}?t=${Date.now()}`, { credentials: "include", cache: "no-store" });
        const cfgBody1 = (await cfg1.json().catch(() => null)) as { assignments?: Array<Record<string, unknown>> } | null;

        const accept = (c: { ocm: string; source: string }, key: string) =>
            post("/api/admin/actions/execute", {
                action_key: "enrollment.pricing.accept",
                entity_type: "opportunity_customer_member",
                entity_id: c.ocm,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {
                    opportunity_customer_member_id: c.ocm,
                    resolution_key: key,
                    selected_source_id: c.source,
                    as_of: fx.start,
                    supersede: true,
                },
            });

        // The resolution key may have moved with the agreement — take it from the fresh read.
        const keyOf = (ocm: string) =>
            ((cfgBody1?.assignments ?? []).find((a) => a.opportunityCustomerMemberId === ocm)?.resolutionKey as string | undefined);
        const sourceOf = (ocm: string) =>
            (((cfgBody1?.assignments ?? []).find((a) => a.opportunityCustomerMemberId === ocm)?.recommended as { sourceId?: string } | null)?.sourceId);

        const acceptA = await accept({ ocm: fx.a.ocm, source: sourceOf(fx.a.ocm) ?? fx.a.source }, keyOf(fx.a.ocm) ?? fx.a.key);
        const acceptB = await accept({ ocm: fx.b.ocm, source: sourceOf(fx.b.ocm) ?? fx.b.source }, keyOf(fx.b.ocm) ?? fx.b.key);

        const cfg2 = await fetch(`/api/admin/financial-config/opportunity/${fx.opportunity}?t=${Date.now()}`, { credentials: "include", cache: "no-store" });
        const cfgBody2 = (await cfg2.json().catch(() => null)) as { assignments?: Array<Record<string, unknown>> } | null;

        return {
            agA: { status: agA.status, id: (agA.body as { agreement?: { id?: string } } | null)?.agreement?.id ?? null, err: agA.status >= 400 ? agA.body : null },
            agB: { status: agB.status, id: (agB.body as { agreement?: { id?: string } } | null)?.agreement?.id ?? null, err: agB.status >= 400 ? agB.body : null },
            afterAgreement: (cfgBody1?.assignments ?? []).map((a) => ({
                ocm: a.opportunityCustomerMemberId, child: a.childLabel, agreement: a.enrollmentAgreementId,
                state: a.state, key: a.resolutionKey, facts: a.facts,
                recommended: (a.recommended as { amountLabel?: string; cadenceKey?: string; sourceId?: string } | null),
                accepted: a.accepted, stale: a.acceptedIsStale,
            })),
            acceptA: { status: acceptA.status, body: acceptA.body },
            acceptB: { status: acceptB.status, body: acceptB.body },
            afterAccept: (cfgBody2?.assignments ?? []).map((a) => ({
                ocm: a.opportunityCustomerMemberId, child: a.childLabel, agreement: a.enrollmentAgreementId,
                accepted: a.accepted, stale: a.acceptedIsStale,
            })),
        };
    }, FX);

    writeFileSync(`${OUT}/enroll.json`, JSON.stringify(out, null, 2));
    log(`agreement A: ${out.agA.status} ${out.agA.id} ${JSON.stringify(out.agA.err ?? "")}`);
    log(`agreement B: ${out.agB.status} ${out.agB.id} ${JSON.stringify(out.agB.err ?? "")}`);
    log(`after agreement:\n${JSON.stringify(out.afterAgreement, null, 1).slice(0, 2500)}`);
    log(`acceptA: ${JSON.stringify(out.acceptA).slice(0, 700)}`);
    log(`acceptB: ${JSON.stringify(out.acceptB).slice(0, 700)}`);
    log(`after accept:\n${JSON.stringify(out.afterAccept, null, 1).slice(0, 1500)}`);
});
