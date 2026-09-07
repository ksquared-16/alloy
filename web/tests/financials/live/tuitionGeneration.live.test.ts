/**
 * ACCEPTED TERM → CHARGE, AGAINST THE REAL DATABASE.
 *
 * Everything Thread 7 claims is a claim about persistence, lineage and convergence, and none of it
 * can be proved against a mock. The vertical slice this file proves is the whole thread in one pass:
 *
 *   one accepted term
 *   → one consumption event      (the occurrence)
 *   → one resolved obligation
 *   → one draft tuition charge   (correct amount, currency, lineage, service period, billing period)
 *   → balance unchanged while it is a draft
 *   → a retry that creates nothing
 *
 * The amount is never computed here and never read from the catalog: it is the amount the family
 * accepted, and the OVERRIDE case is the one that makes that distinction visible — an override
 * priced deliberately away from the recommendation must survive into the charge.
 *
 * Skipped unless the cert stack is configured, so the ordinary suite stays hermetic.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateTuitionCharges } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import { tuitionOccurrenceKey } from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";
import { buildFinancialsCardVM, reconcileRows } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { postChildcareCharge } from "@/lib/financials/childcareChargeService";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const P = "77000000-0000-4000-8000-";
const AGREEMENT = `${P}0000000000a1`;
const TERM = `${P}0000000000b1`;
const PERIOD = "2026-11";

describeLive("tuition generation — accepted term to draft charge, live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let ocmId = "";
    let customerMemberId = "";
    let customerId = "";
    let locationId: string | null = null;
    let rateId = "";

    async function cleanup() {
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG);
        // Consumption lineage first — obligations reference the event, charges reference the template.
        const { data: events } = await supabase
            .from("consumption_events")
            .select("id")
            .eq("org_id", ORG)
            .like("idempotency_key", "cev:tuition:%");
        const ids = ((events ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (ids.length > 0) {
            await supabase.from("resolved_obligations").delete().in("consumption_event_id", ids);
            await supabase.from("consumption_events").delete().in("id", ids);
        }
        // A POSTED childcare charge refuses DELETE — that is the guarantee being relied on
        // elsewhere in this file, so teardown removes drafts and leaves posted money to the
        // certification reset rather than asking the database to break its own rule.
        await supabase.from("charges").delete().eq("org_id", ORG).eq("charge_category", "tuition").eq("status", "draft");
        await supabase.from("child_enrollment_agreements").delete().eq("id", AGREEMENT);
    }

    beforeAll(async () => {
        const { data: ocmRows } = await supabase
            .from("opportunity_customer_members")
            .select("id, customer_member_id, location_id")
            .eq("org_id", ORG)
            .eq("schedule_type", "full_time")
            .limit(1);
        const ocm = (ocmRows ?? [])[0] as Record<string, string> | undefined;
        expect(ocm, "the representative tenant must hold an assignment").toBeTruthy();
        ocmId = ocm!.id;
        customerMemberId = ocm!.customer_member_id;
        locationId = ocm!.location_id ?? null;

        const { data: member } = await supabase
            .from("customer_members")
            .select("customer_id")
            .eq("id", customerMemberId)
            .maybeSingle();
        customerId = (member as { customer_id: string }).customer_id;

        const { data: rate } = await supabase
            .from("commercial_tuition_rates")
            .select("id")
            .eq("org_id", ORG)
            .limit(1)
            .maybeSingle();
        rateId = (rate as { id: string }).id;

        await cleanup();

        // The child is ENROLLED — recurring tuition bills against the agreement.
        const { data: site } = await supabase.from("locations").select("id").eq("org_id", ORG).limit(1);
        const { error: agreementError } = await supabase.from("child_enrollment_agreements").insert({
            id: AGREEMENT,
            org_id: ORG,
            customer_member_id: customerMemberId,
            customer_id: customerId,
            site_location_id: ((site ?? [])[0] as { id: string }).id,
            opportunity_customer_member_id: ocmId,
            status: "active",
            start_date: "2026-01-01",
        });
        expect(agreementError, agreementError?.message).toBeNull();
    }, 60_000);

    afterAll(async () => {
        // CERT_KEEP leaves the lineage standing so a run can be inspected in the database afterwards
        // — the harness clears it on the way IN, so keeping it costs the next run nothing.
        if (process.env.CERT_KEEP === "1") return;
        await cleanup();
    });

    /** An accepted term for the assignment, deliberately OVERRIDDEN away from the catalog. */
    async function acceptTerm(amountCents: number, over: Record<string, unknown> = {}) {
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG);
        const { error } = await supabase.from("enrollment_pricing_terms").insert({
            id: TERM,
            org_id: ORG,
            opportunity_customer_member_id: ocmId,
            customer_member_id: customerMemberId,
            enrollment_agreement_id: AGREEMENT,
            term_kind: "tuition",
            source_entity: "commercial_tuition_rates",
            source_id: rateId,
            recommended_source_id: rateId,
            location_id: locationId,
            cadence_key: "monthly",
            payer_type: "private_pay",
            amount_cents: amountCents,
            currency_code: "USD",
            state: "overridden",
            override_reason: "Sibling arrangement agreed with the director",
            resolution_key: "t7-live",
            effective_start: "2026-01-01",
            accepted_by: ACTOR,
            ...over,
        });
        expect(error, error?.message).toBeNull();
    }

    async function chargesForPeriod() {
        const { data } = await supabase
            .from("charges")
            .select("id, amount_cents, currency_code, status, charge_category, billable_on, service_date, billable_source_type, billable_source_id, metadata")
            .eq("org_id", ORG)
            .eq("charge_category", "tuition");
        return (data ?? []) as Array<Record<string, unknown>>;
    }

    it("the vertical slice — one term, one occurrence, one obligation, one draft, and a retry that adds nothing", async () => {
        // The term is an OVERRIDE at 121,000 — deliberately not what the catalog recommends. If
        // generation re-resolved the catalog this is the number that would be wrong.
        await acceptTerm(121_000);

        const run = await generateTuitionCharges(supabase, {
            orgId: ORG,
            periodKey: PERIOD,
            actorUserId: ACTOR,
            opportunityCustomerMemberIds: [ocmId],
            today: "2026-11-01",
        });
        expect(run.counts.errors, JSON.stringify(run.outcomes)).toBe(0);
        expect(run.counts.refused, JSON.stringify(run.outcomes)).toBe(0);
        expect(run.counts.generated).toBe(1);
        expect(run.servicePeriod).toEqual({ start: "2026-11-01", end: "2026-11-30" });

        const generated = run.outcomes.find((o) => o.kind === "generated");
        expect(generated).toBeTruthy();
        if (!generated || generated.kind !== "generated") return;
        expect(generated.termId).toBe(TERM);
        // THE ACCEPTED AMOUNT, not a recomputed one.
        expect(generated.amountCents).toBe(121_000);
        expect(generated.currencyCode).toBe("USD");

        // ── ONE OCCURRENCE ──────────────────────────────────────────────────────────────────
        const { data: events } = await supabase
            .from("consumption_events")
            .select("id, idempotency_key, event_key, source_entity_id, occurs_on, context")
            .eq("org_id", ORG)
            .eq("idempotency_key", tuitionOccurrenceKey(ocmId, PERIOD));
        expect(events ?? []).toHaveLength(1);
        const event = (events ?? [])[0] as Record<string, unknown>;
        expect(event.event_key).toBe("schedule.recurring_tuition");
        expect(event.source_entity_id).toBe(AGREEMENT);
        expect(event.occurs_on).toBe("2026-11-01");
        expect((event.context as Record<string, unknown>).accepted_pricing_term_id).toBe(TERM);

        // ── ONE OBLIGATION ──────────────────────────────────────────────────────────────────
        const { data: obligations } = await supabase
            .from("resolved_obligations")
            .select("id, amount_cents, currency_code, period_start, period_end, draft_charge_id, obligation_kind, explanation")
            .eq("org_id", ORG)
            .eq("consumption_event_id", event.id as string);
        expect(obligations ?? []).toHaveLength(1);
        const obligation = (obligations ?? [])[0] as Record<string, unknown>;
        expect(obligation.amount_cents).toBe(121_000);
        expect(obligation.period_start).toBe("2026-11-01");
        expect(obligation.draft_charge_id).toBe(generated.chargeId);

        // ── ONE DRAFT CHARGE, WITH ITS LINEAGE ──────────────────────────────────────────────
        const charges = await chargesForPeriod();
        expect(charges).toHaveLength(1);
        const charge = charges[0]!;
        expect(charge.id).toBe(generated.chargeId);
        expect(charge.status).toBe("draft");
        expect(charge.amount_cents).toBe(121_000);
        expect(charge.currency_code).toBe("USD");
        expect(charge.charge_category).toBe("tuition");
        expect(charge.billable_source_type).toBe("enrollment_agreement");
        expect(charge.billable_source_id).toBe(AGREEMENT);
        // The service period and the billing period it lands in.
        expect(String(charge.service_date)).toBe("2026-11-01");
        expect(String(charge.billable_on).slice(0, 7)).toBe(PERIOD);

        // ── A DRAFT IS NOT OWED ─────────────────────────────────────────────────────────────
        const vm = await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: "2026-11-01" });
        const rec = reconcileRows(vm.rows, PERIOD, "2026-11-01");
        expect(rec.balanceCents, "a draft charge must not move the balance").toBe(0);

        // ── A RETRY ADDS NOTHING ────────────────────────────────────────────────────────────
        const retry = await generateTuitionCharges(supabase, {
            orgId: ORG,
            periodKey: PERIOD,
            actorUserId: ACTOR,
            opportunityCustomerMemberIds: [ocmId],
            today: "2026-11-01",
        });
        expect(retry.counts.generated).toBe(1);
        expect(retry.outcomes[0]!.kind === "generated" && retry.outcomes[0]!.chargeId).toBe(generated.chargeId);
        expect(await chargesForPeriod()).toHaveLength(1);
        const { count: eventCount } = await supabase
            .from("consumption_events")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .eq("idempotency_key", tuitionOccurrenceKey(ocmId, PERIOD));
        expect(eventCount, "a retry must not open a second occurrence").toBe(1);
    }, 120_000);

    it("Thread 1 posts it, and posting moves the balance exactly once", async () => {
        const charges = await chargesForPeriod();
        expect(charges).toHaveLength(1);
        const chargeId = charges[0]!.id as string;

        const before = reconcileRows(
                (await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: "2026-11-01" })).rows,
                PERIOD,
                "2026-11-01",
            );
        expect(before.balanceCents).toBe(0);

        await postChildcareCharge(supabase, { orgId: ORG, chargeId, actorUserId: ACTOR });

        const vmAfter = await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: "2026-11-01" });
        expect(
            vmAfter.rows.map((r) => [r.chargeId, r.periodKey, r.lifecycleStatus, r.amountCents]),
            "the generated charge must be visible to the Financials read model",
        ).toContainEqual([chargeId, PERIOD, "posted", 121_000]);

        const after = reconcileRows(
                (await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: "2026-11-01" })).rows,
                PERIOD,
                "2026-11-01",
            );
        expect(after.balanceCents, "posting makes the accepted amount owed").toBe(121_000);

        // Idempotent: posting again returns the charge already posted and moves nothing.
        await postChildcareCharge(supabase, { orgId: ORG, chargeId, actorUserId: ACTOR });
        const again = reconcileRows(
                (await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: "2026-11-01" })).rows,
                PERIOD,
                "2026-11-01",
            );
        expect(again.balanceCents).toBe(121_000);
    }, 120_000);

    it("a generation run over a posted period leaves the posted charge exactly as posted", async () => {
        const before = await chargesForPeriod();
        expect(before[0]!.status).toBe("posted");

        // The term is changed AFTER posting. Posted money is immutable: generation must not edit it.
        await supabase.from("enrollment_pricing_terms").update({ superseded_at: new Date().toISOString() }).eq("id", TERM);
        await acceptTerm(150_000, { id: `${P}0000000000b2`, resolution_key: "t7-live-2" });

        const run = await generateTuitionCharges(supabase, {
            orgId: ORG,
            periodKey: PERIOD,
            actorUserId: ACTOR,
            opportunityCustomerMemberIds: [ocmId],
            today: "2026-11-01",
        });
        expect(run.counts.errors, JSON.stringify(run.outcomes)).toBe(0);

        const after = await chargesForPeriod();
        expect(after, "no second charge for a period already posted").toHaveLength(1);
        expect(after[0]!.status).toBe("posted");
        expect(after[0]!.amount_cents, "a posted amount is immutable").toBe(121_000);
    }, 120_000);
});
