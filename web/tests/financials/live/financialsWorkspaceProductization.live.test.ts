/**
 * THREAD 4A — THE WORKSPACE'S MONEY, AGAINST THE REAL DATABASE.
 *
 * Thread 4 proved SELECTION: the right work, at the right location, never wider than an
 * operator's rights. This proves the thing Thread 4 deliberately had none of — figures — and the
 * property that makes them safe: the workspace does not compute them.
 *
 * The load-bearing case is the first one. The cohort's totals are asserted against
 * `resolveFamilyCollectible` called on the same charge, on the same database, through its own
 * per-charge reads. Not against a number written into this file: against the canonical resolver
 * the account card uses. If the batched reading ever feeds the shared arithmetic something the
 * per-charge reading would not, this fails — which is the only durable way to know that a
 * workspace total and the card an operator opens next agree.
 *
 * The metric assertions close the same loop one level up: a metric's cents must equal the
 * projection's cents, so a KPI tile cannot become a third answer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postChildcareCharge } from "@/lib/financials/childcareChargeService";
import { recordChildcarePayment, applyPaymentToCharge } from "@/lib/financials/childcarePaymentService";
import { generateTuitionCharges } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";
import { resolveFinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import { resolveFinancialPaymentFlow } from "@/lib/financials/workspace/resolveFinancialPaymentFlow";
import { resolveFinancialActivity } from "@/lib/financials/workspace/resolveFinancialActivity";
import { resolveSingleMetric } from "@/lib/metrics/metricEngine";
import { getMetricPack } from "@/lib/metrics/packs";
import type { MetricResolveContext, OipMetricKey } from "@/lib/metrics/types";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) => file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;

import { runHex } from "./certificationPeriod";

/** This run's own fixture subjects — see `certificationPeriod` for why fixed ones cannot work. */

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const W = "6f100000-0000-4000-8000-";
const GROSS = 100_000;
/*
 * A PERIOD THE ORG'S ACCOUNTING CALENDAR ACTUALLY COVERS.
 *
 * Thread 5's attribution trigger refuses a journal entry whose `effective_on` falls outside every
 * period on the active calendar — deliberately, because an entry attributed to a period nobody
 * configured is worse than a refused write. A far-future service date therefore posts the charge
 * and silently records no history, which would make this file's history cases assert nothing.
 * The period is chosen to sit inside the certification calendar for exactly that reason.
 */
const PERIOD = "2026-09";

describeLive("financials workspace productization — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const kids: Array<{ ocmId: string; memberId: string; agreementId: string; siteId: string }> = [];
    let customerId = "";
    let siteA = "";
    let siteB = "";
    let postedChargeId = "";

    const orgScope = { orgId: ORG, siteScope: "all" as const, allowedSiteLocationIds: [] as string[] };

    function metricCtx(over: Partial<MetricResolveContext> = {}): MetricResolveContext {
        return {
            supabase,
            orgId: ORG,
            scope: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] },
            window: "rolling_30d",
            mode: "live",
            ...over,
        } as MetricResolveContext;
    }

    async function clearMoney() {
        const { data: events } = await supabase
            .from("consumption_events").select("id").eq("org_id", ORG).like("idempotency_key", "cev:tuition:%");
        const ids = ((events ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (ids.length > 0) {
            await supabase.from("resolved_obligations").delete().in("consumption_event_id", ids);
            await supabase.from("consumption_events").delete().in("id", ids);
        }
        await supabase.from("charges").delete().eq("org_id", ORG).eq("status", "draft");
    }

    beforeAll(async () => {
        const { data: memberRows } = await supabase
            .from("customer_members").select("id, customer_id").eq("org_id", ORG)
            .eq("customer_id", "00000000-0000-4000-8000-100000000001");
        const members = ((memberRows ?? []) as Array<{ id: string; customer_id: string }>).sort((a, b) => (a.id < b.id ? -1 : 1));
        expect(members.length).toBeGreaterThanOrEqual(2);
        customerId = members[0]!.customer_id;

        const { data: siteRows } = await supabase
            .from("locations").select("id").eq("org_id", ORG).eq("location_type", "site").limit(2);
        const sites = ((siteRows ?? []) as Array<{ id: string }>).map((s) => s.id);
        expect(sites.length, "two sites are needed to prove location scope").toBeGreaterThanOrEqual(2);
        [siteA, siteB] = sites as [string, string];

        const { data: rate } = await supabase.from("commercial_tuition_rates").select("id").eq("org_id", ORG).limit(1).maybeSingle();
        const rateId = (rate as { id: string }).id;
        const { data: firstOcmRows } = await supabase
            .from("opportunity_customer_members").select("id, opportunity_id, location_id, schedule_type, program_category_id")
            .eq("org_id", ORG).eq("customer_member_id", members[0]!.id).limit(1);
        const firstOcm = (firstOcmRows ?? [])[0] as Record<string, string>;

        await clearMoney();
        /*
         * This suite's OWN pricing terms. It used to delete every pricing term in the tenant, which
         * is why running it left the tuition-generation suites with nothing to generate from — a
         * collision that looked, from the other suite's failure, like a Thread 7 regression.
         */
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG)
            .like("id", `${W}${runHex()}%`);

        for (const [index, member] of members.slice(0, 2).entries()) {
            const { data: ocmRows } = await supabase
                .from("opportunity_customer_members").select("id").eq("org_id", ORG).eq("customer_member_id", member.id).limit(1);
            let ocmId = ((ocmRows ?? [])[0] as { id: string } | undefined)?.id;
            if (!ocmId) {
                ocmId = `${W}${runHex()}e00${index + 1}`;
                await supabase.from("opportunity_customer_members").insert({
                    id: ocmId, org_id: ORG, opportunity_id: firstOcm.opportunity_id, customer_member_id: member.id,
                    schedule_type: firstOcm.schedule_type ?? "full_time", location_id: firstOcm.location_id,
                    program_category_id: firstOcm.program_category_id, metadata: { seed: "cert_workspace_4a" },
                });
            }
            const agreementId = `${W}${runHex()}a00${index + 1}`;
            const siteId = index === 0 ? siteA : siteB;
            /*
             * Clear an incumbent agreement that a LIVE CERTIFICATION SUITE created, and nothing else.
             *
             * One operational agreement per child per site is a real constraint, and these suites
             * work on whichever customer members the tenant happens to have, so they contend for the
             * same children. Deleting only this suite's own ids left them blocking each other;
             * deleting whatever the child held reached the mounted certification's OWN subject and
             * left it with no enrolment at all, after which every seeded charge billed the household
             * directly and the provider collection refused it — correctly.
             *
             * Provenance is the discriminator. Suites stamp `source_key` on what they create and
             * clear only that, so a fixture belonging to anything else is never in range.
             */
            await supabase.from("enrollment_pricing_terms").delete()
                .eq("org_id", ORG).eq("customer_member_id", member.id);
            await supabase.from("child_enrollment_agreements").delete()
                .eq("org_id", ORG).eq("customer_member_id", member.id)
                .eq("source_key", "live-certification");
            const { error: agreementError } = await supabase.from("child_enrollment_agreements").insert({
                id: agreementId, org_id: ORG, customer_member_id: member.id, customer_id: customerId,
                site_location_id: siteId, opportunity_customer_member_id: ocmId, status: "active", start_date: "2026-01-01", source_key: "live-certification",
            });
            expect(agreementError, agreementError?.message).toBeNull();
            const { error: termError } = await supabase.from("enrollment_pricing_terms").insert({
                id: `${W}${runHex()}b00${index + 1}`, org_id: ORG, opportunity_customer_member_id: ocmId,
                customer_member_id: member.id, enrollment_agreement_id: agreementId, term_kind: "tuition",
                source_entity: "commercial_tuition_rates", source_id: rateId, recommended_source_id: rateId,
                cadence_key: "monthly", payer_type: "private_pay", amount_cents: GROSS, currency_code: "USD",
                state: "accepted", resolution_key: `workspace4a-${index}`, effective_start: "2026-01-01", accepted_by: ACTOR,
            });
            expect(termError, termError?.message).toBeNull();
            kids.push({ ocmId: ocmId as string, memberId: member.id, agreementId, siteId });
        }

        // REAL WORK, THROUGH THE REAL PIPELINE: Thread 7 drafts it, Thread 1 posts it.
        await generateTuitionCharges(supabase, {
            orgId: ORG, periodKey: PERIOD, actorUserId: ACTOR,
            opportunityCustomerMemberIds: kids.map((k) => k.ocmId), today: `${PERIOD}-01`,
        });
        const { data: drafts } = await supabase
            .from("charges").select("id, billable_source_id").eq("org_id", ORG).eq("status", "draft")
            .eq("billable_source_id", kids[0]!.agreementId);
        const draftId = ((drafts ?? [])[0] as { id: string } | undefined)?.id;
        expect(draftId, "Thread 7 produced a draft to post").toBeTruthy();
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: draftId!, actorUserId: ACTOR } as never);
        postedChargeId = draftId!;
    }, 240_000);

    afterAll(async () => {
        if (process.env.CERT_KEEP === "1") return;
        await clearMoney();
        /*
         * This suite's OWN pricing terms. It used to delete every pricing term in the tenant, which
         * is why running it left the tuition-generation suites with nothing to generate from — a
         * collision that looked, from the other suite's failure, like a Thread 7 regression.
         */
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG)
            .like("id", `${W}${runHex()}%`);
        for (const kid of kids) await supabase.from("child_enrollment_agreements").delete().eq("id", kid.agreementId);
        await supabase.from("opportunity_customer_members").delete().eq("org_id", ORG).contains("metadata", { seed: "cert_workspace_4a" });
    });

    // ── 1 · THE TOTALS ARE THE CANONICAL ARITHMETIC, NOT A SECOND ONE ──────────────────────

    it("agrees with resolveFamilyCollectible on the same charge, figure for figure", async () => {
        const cohort = await resolveFinancialPositionCohort(supabase, orgScope);
        const row = cohort.rows.find((r) => r.position.chargeId === postedChargeId);
        expect(row, "the posted charge is in the cohort").toBeTruthy();

        // The canonical per-charge resolver, on the same database, through its own reads.
        const canonical = await resolveFamilyCollectible(supabase, { orgId: ORG, chargeId: postedChargeId });
        expect(row!.position).toEqual(canonical);
    }, 240_000);

    it("owes the posted charge and nothing for the sibling's unposted draft", async () => {
        const cohort = await resolveFinancialPositionCohort(supabase, orgScope);
        expect(cohort.rows.some((r) => r.position.chargeId === postedChargeId)).toBe(true);
        // A draft is not a debt: the cohort is posted charges only.
        const siblingDraftInCohort = cohort.rows.some((r) => r.enrollmentAgreementId === kids[1]!.agreementId);
        expect(siblingDraftInCohort).toBe(false);
    }, 180_000);

    // ── 2 · LOCATION, THE SAME CONTRACT THE QUEUE OBEYS ────────────────────────────────────

    it("narrows to the selected site and never widens for a restricted operator", async () => {
        const atA = await resolveFinancialPositionCohort(supabase, { ...orgScope, activeSiteLocationId: siteA });
        expect(atA.rows.every((r) => r.siteLocationId === siteA)).toBe(true);
        expect(atA.rows.some((r) => r.position.chargeId === postedChargeId)).toBe(true);

        const atB = await resolveFinancialPositionCohort(supabase, { ...orgScope, activeSiteLocationId: siteB });
        expect(atB.rows.some((r) => r.position.chargeId === postedChargeId)).toBe(false);

        // Asking for a site they do not hold returns nothing — the filter narrows, never widens.
        const forged = await resolveFinancialPositionCohort(supabase, {
            orgId: ORG, siteScope: "restricted", allowedSiteLocationIds: [siteB], activeSiteLocationId: siteA,
        });
        expect(forged.rows).toHaveLength(0);
        expect(forged.totals.outstandingCents).toBe(0);
    }, 240_000);

    // ── 3 · MONEY IN, AND MONEY IN THAT IS NOT SETTLING ANYTHING ───────────────────────────

    it("reports a receipt as unapplied until it is applied, then stops", async () => {
        const { payment } = await recordChildcarePayment(supabase, {
            orgId: ORG,
            billableSourceType: "enrollment_agreement",
            billableSourceId: kids[0]!.agreementId,
            customerId,
            amountCents: 40_000,
            paymentMethod: "check",
            status: "posted",
            // Run-scoped: a fixed key is idempotent by design, so a re-run got back the previous
            // run's payment — recorded against an agreement this run has already retired.
            idempotencyKey: `cert-4a-unapplied-${runHex()}`,
            actorUserId: ACTOR,
        } as never);

        const before = await resolveFinancialPaymentFlow(supabase, orgScope);
        const beforeRow = before.rows.find((r) => r.paymentId === payment.id)!;
        expect(beforeRow, "a posted receipt appears").toBeTruthy();
        expect(beforeRow.unappliedCents, "nothing applied yet").toBe(40_000);
        expect(beforeRow.locationScope, "an enrolment-backed receipt sits at its agreement's site").toBe("site");
        expect(beforeRow.siteLocationId).toBe(siteA);

        await applyPaymentToCharge(supabase, {
            orgId: ORG, paymentId: payment.id, chargeId: postedChargeId, amountCents: 40_000, actorUserId: ACTOR,
        } as never);

        const after = await resolveFinancialPaymentFlow(supabase, orgScope);
        const afterRow = after.rows.find((r) => r.paymentId === payment.id)!;
        expect(afterRow.appliedCents).toBe(40_000);
        expect(afterRow.unappliedCents, "applied money is no longer sitting on the account").toBe(0);

        // And the obligation moved by exactly what applied — Thread 8's answer, quoted.
        const canonical = await resolveFamilyCollectible(supabase, { orgId: ORG, chargeId: postedChargeId });
        expect(canonical.outstandingCents).toBe(GROSS - 40_000);
        const cohort = await resolveFinancialPositionCohort(supabase, orgScope);
        expect(cohort.rows.find((r) => r.position.chargeId === postedChargeId)!.position.outstandingCents)
            .toBe(GROSS - 40_000);
    }, 300_000);

    // ── 4 · HISTORY EXPLAINS; IT DOES NOT ANSWER ───────────────────────────────────────────

    it("records the posting and the receipt, and a receipt moves no obligation", async () => {
        const feed = await resolveFinancialActivity(supabase, orgScope);
        const posted = feed.rows.find((r) => r.entryType === "charge_posted" && r.sourceId === postedChargeId);
        expect(posted, "posting is in the history").toBeTruthy();
        expect(posted!.obligationDeltaCents, "posting a charge is what makes it owed").toBeGreaterThan(0);
        expect(posted!.locationScope).toBe("site");
        expect(posted!.siteLocationId).toBe(siteA);

        const receipt = feed.rows.find((r) => r.entryType === "payment_received");
        expect(receipt, "the receipt is in the history").toBeTruthy();
        // MONEY ARRIVING IS NOT MONEY APPLIED. Zero here is a real answer, not a missing one.
        expect(receipt!.obligationDeltaCents).toBe(0);
        expect(receipt!.amountCents).toBeGreaterThan(0);

        const applied = feed.rows.find((r) => r.entryType === "payment_applied");
        expect(applied, "applying it is a separate consequence").toBeTruthy();
        expect(applied!.obligationDeltaCents).toBeLessThan(0);
    }, 240_000);

    it("shows a site-restricted operator only their own site's history", async () => {
        const restricted = await resolveFinancialActivity(supabase, {
            orgId: ORG, siteScope: "restricted", allowedSiteLocationIds: [siteB],
        });
        expect(restricted.rows.every((r) => r.siteLocationId === siteB)).toBe(true);
        expect(restricted.rows.some((r) => r.sourceId === postedChargeId)).toBe(false);
    }, 180_000);

    // ── 5 · THE METRICS ARE THE PROJECTION'S FIGURES, NOT A THIRD ANSWER ───────────────────

    it("resolves every registered Financials metric, in cents that match the projection", async () => {
        const pack = getMetricPack("financials");
        expect(pack?.metricKeys.length, "the pack is registered and populated").toBe(7);

        const cohort = await resolveFinancialPositionCohort(supabase, orgScope);
        const flow = await resolveFinancialPaymentFlow(supabase, orgScope);
        const ctx = metricCtx();

        const outstanding = await resolveSingleMetric(ctx, "financials.outstanding_amount");
        expect(outstanding.meta?.amount_cents).toBe(cohort.totals.outstandingCents);
        // The rendered value is the SAME number, in dollars — never independently derived.
        expect(outstanding.value).toBeCloseTo(cohort.totals.outstandingCents / 100, 6);

        const collectible = await resolveSingleMetric(ctx, "financials.currently_collectible_amount");
        expect(collectible.meta?.amount_cents).toBe(cohort.totals.currentlyCollectibleCents);

        const variance = await resolveSingleMetric(ctx, "financials.unresolved_subsidy_variance_amount");
        expect(variance.meta?.amount_cents).toBe(cohort.totals.unresolvedVarianceCents);

        const unapplied = await resolveSingleMetric(ctx, "financials.unapplied_payments_amount");
        expect(unapplied.meta?.amount_cents).toBe(flow.totals.unappliedCents);

        // Every key in the pack resolves; none throws and none returns a value it cannot format.
        for (const key of pack!.metricKeys as readonly OipMetricKey[]) {
            const metric = await resolveSingleMetric(ctx, key);
            expect(metric.key, key).toBe(key);
            expect(metric.formattedValue, key).toBeTruthy();
            // Bounded reads say so, so a capped total is never mistaken for organization truth.
            expect(metric.meta?.snapshot_semantics, key).toBe(true);
        }
    }, 300_000);

    it("answers a site-scoped metric with that site's money, never the organization's", async () => {
        const atA = await resolveFinancialPositionCohort(supabase, { ...orgScope, activeSiteLocationId: siteA });
        const metric = await resolveSingleMetric(metricCtx({ siteLocationId: siteA }), "financials.outstanding_amount");
        expect(metric.meta?.amount_cents).toBe(atA.totals.outstandingCents);
        expect(metric.meta?.active_site_location_id).toBe(siteA);

        const restricted = await resolveSingleMetric(
            metricCtx({
                scope: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "restricted", allowedSiteLocationIds: [siteB] },
                siteLocationId: siteA,
            }),
            "financials.outstanding_amount",
        );
        // A site the operator does not hold answers with nothing, not with the org's number.
        expect(restricted.meta?.amount_cents).toBe(0);
    }, 300_000);

    // ── 6 · ORG ISOLATION ──────────────────────────────────────────────────────────────────

    it("keeps another organisation's money out of this one's figures", async () => {
        const other = await resolveFinancialPositionCohort(supabase, {
            orgId: "00000000-0000-4000-8000-0000000000ff", siteScope: "all", allowedSiteLocationIds: [],
        });
        expect(other.rows.some((r) => r.position.chargeId === postedChargeId)).toBe(false);
    }, 180_000);
});
