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

import { runPeriodKey } from "./certificationPeriod";

/** This run's own unbilled periods — see `certificationPeriod` for why fixed ones cannot work. */
/** The last calendar day of a `YYYY-MM`, so a service window can be asserted without a fixed year. */
function lastDayOf(periodKey: string): string {
    const [year, month] = periodKey.split("-").map(Number);
    return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
}

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const P = "77000000-0000-4000-8000-";
const AGREEMENT = `${P}0000000000a1`;
const TERM = `${P}0000000000b1`;
const SUCCESSOR_TERM = `${P}0000000000b2`;
const PERIOD = runPeriodKey();

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
            .eq("charge_category", "tuition")
            // Scoped to THIS slice's service period. The tenant is shared with the matrix file, and
            // "every tuition charge in the org" stopped being a useful question the moment a second
            // certification started billing other months in it.
            .eq("service_date", `${PERIOD}-01`);
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
            today: `${PERIOD}-01`,
        });
        expect(run.counts.errors, JSON.stringify(run.outcomes)).toBe(0);
        expect(run.counts.refused, JSON.stringify(run.outcomes)).toBe(0);
        expect(run.counts.generated).toBe(1);
        expect(run.servicePeriod).toEqual({ start: `${PERIOD}-01`, end: lastDayOf(PERIOD) });

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
        expect(event.occurs_on).toBe(`${PERIOD}-01`);
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
        expect(obligation.period_start).toBe(`${PERIOD}-01`);
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
        expect(String(charge.service_date)).toBe(`${PERIOD}-01`);
        expect(String(charge.billable_on).slice(0, 7)).toBe(PERIOD);

        // ── A DRAFT IS NOT OWED ─────────────────────────────────────────────────────────────
        const vm = await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: `${PERIOD}-01` });
        const rec = reconcileRows(vm.rows, PERIOD, `${PERIOD}-01`);
        expect(rec.balanceCents, "a draft charge must not move the balance").toBe(0);

        // ── A RETRY ADDS NOTHING ────────────────────────────────────────────────────────────
        const retry = await generateTuitionCharges(supabase, {
            orgId: ORG,
            periodKey: PERIOD,
            actorUserId: ACTOR,
            opportunityCustomerMemberIds: [ocmId],
            today: `${PERIOD}-01`,
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
                (await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: `${PERIOD}-01` })).rows,
                PERIOD,
                `${PERIOD}-01`,
            );
        expect(before.balanceCents).toBe(0);

        await postChildcareCharge(supabase, { orgId: ORG, chargeId, actorUserId: ACTOR });

        const vmAfter = await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: `${PERIOD}-01` });
        expect(
            vmAfter.rows.map((r) => [r.chargeId, r.periodKey, r.lifecycleStatus, r.amountCents]),
            "the generated charge must be visible to the Financials read model",
        ).toContainEqual([chargeId, PERIOD, "posted", 121_000]);

        const after = reconcileRows(
                (await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: `${PERIOD}-01` })).rows,
                PERIOD,
                `${PERIOD}-01`,
            );
        expect(after.balanceCents, "posting makes the accepted amount owed").toBe(121_000);

        // Idempotent: posting again returns the charge already posted and moves nothing.
        await postChildcareCharge(supabase, { orgId: ORG, chargeId, actorUserId: ACTOR });
        const again = reconcileRows(
                (await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, customerMemberId: null, today: `${PERIOD}-01` })).rows,
                PERIOD,
                `${PERIOD}-01`,
            );
        expect(again.balanceCents).toBe(121_000);
    }, 120_000);

    /*
     * ── THE HISTORY OF SETTLED MONEY IS NOT REWRITTEN ──
     *
     * The charge was always safe: `writeTemplateDraftCharge` refuses to touch posted money. The
     * RECORD OF WHY was not. `upsertConsumptionEvent` finds the occurrence by its idempotency key
     * and updates the event context in place, and the obligation is re-resolved beneath it — so a
     * successor term run over a posted period left the charge at term A's amount while the event and
     * obligation explaining it had been rewritten to say term B. The money was right and the
     * explanation was a lie, which is the worse half: nobody re-reads it until they need it.
     *
     * Generation now answers a settled month from the charge that already exists and does not enter
     * the pipeline at all. A successor term affecting posted money is the correction and review
     * path's business.
     */
    it("a successor term over a POSTED period changes nothing — not the charge, and not its history", async () => {
        const charges = await chargesForPeriod();
        expect(charges).toHaveLength(1);
        const posted = charges[0]!;
        expect(posted.status).toBe("posted");
        expect(posted.amount_cents).toBe(121_000);

        // The lineage as it stands, recorded before the successor exists.
        const { data: eventsBefore } = await supabase
            .from("consumption_events")
            .select("id, context, updated_at")
            .eq("org_id", ORG)
            .eq("idempotency_key", tuitionOccurrenceKey(ocmId, PERIOD));
        const eventBefore = (eventsBefore ?? [])[0] as Record<string, unknown>;
        expect((eventBefore.context as Record<string, unknown>).accepted_pricing_term_id).toBe(TERM);
        const { data: oblBefore } = await supabase
            .from("resolved_obligations")
            .select("id, amount_cents, explanation, draft_charge_id")
            .eq("org_id", ORG)
            .eq("consumption_event_id", eventBefore.id as string);
        expect(oblBefore ?? []).toHaveLength(1);
        const obligationBefore = (oblBefore ?? [])[0] as Record<string, unknown>;
        expect(obligationBefore.amount_cents).toBe(121_000);

        // A legitimate successor term for the SAME period, at a different price.
        await supabase
            .from("enrollment_pricing_terms")
            .update({ superseded_at: new Date().toISOString(), effective_end: "2026-10-31" })
            .eq("id", TERM);
        await acceptTerm(150_000, { id: SUCCESSOR_TERM, resolution_key: "t7-live-successor" });

        const run = await generateTuitionCharges(supabase, {
            orgId: ORG,
            periodKey: PERIOD,
            actorUserId: ACTOR,
            opportunityCustomerMemberIds: [ocmId],
            today: `${PERIOD}-01`,
        });
        expect(run.counts.errors, JSON.stringify(run.outcomes)).toBe(0);
        // The run says what happened rather than silently doing nothing.
        expect(run.counts.alreadyPosted).toBe(1);
        expect(run.counts.generated).toBe(0);
        const outcome = run.outcomes[0]!;
        expect(outcome.kind).toBe("already_posted");
        expect(outcome.kind === "already_posted" && outcome.chargeId).toBe(posted.id);

        // ── THE POSTED CHARGE IS UNTOUCHED ──────────────────────────────────────────────────
        const after = await chargesForPeriod();
        expect(after, "no second charge for a settled period").toHaveLength(1);
        expect(after[0]!.id).toBe(posted.id);
        expect(after[0]!.status).toBe("posted");
        expect(after[0]!.amount_cents, "a posted amount is immutable").toBe(121_000);

        // ── AND SO IS THE RECORD OF WHY ─────────────────────────────────────────────────────
        const { data: eventsAfter } = await supabase
            .from("consumption_events")
            .select("id, context")
            .eq("org_id", ORG)
            .eq("idempotency_key", tuitionOccurrenceKey(ocmId, PERIOD));
        expect(eventsAfter ?? []).toHaveLength(1);
        const eventAfter = (eventsAfter ?? [])[0] as Record<string, unknown>;
        expect(eventAfter.id).toBe(eventBefore.id);
        expect(
            (eventAfter.context as Record<string, unknown>).accepted_pricing_term_id,
            "the posted period must still say it came from term A",
        ).toBe(TERM);

        const { data: oblAfter } = await supabase
            .from("resolved_obligations")
            .select("id, amount_cents, explanation, draft_charge_id")
            .eq("org_id", ORG)
            .eq("consumption_event_id", eventBefore.id as string);
        expect(oblAfter ?? [], "no second obligation for a settled period").toHaveLength(1);
        const obligationAfter = (oblAfter ?? [])[0] as Record<string, unknown>;
        expect(obligationAfter.id).toBe(obligationBefore.id);
        expect(obligationAfter.amount_cents, "the obligation must still describe term A").toBe(121_000);
        expect(
            (obligationAfter.explanation as Record<string, unknown>).rate_amount_cents,
            "the explanation must not claim the posted charge came from term B",
        ).toBe(121_000);
    }, 120_000);

    /*
     * ── AND THE UNPOSTED HALF STILL RECONCILES ──
     *
     * Protecting settled money must not freeze a draft. A successor term over a period that is still
     * a DRAFT recalculates that one draft in place — one occurrence, one obligation, one charge, at
     * the successor's price.
     */
    it("a successor term over an unposted DRAFT period recalculates it in place", async () => {
        const DRAFT_PERIOD = runPeriodKey(1);
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG);
        await acceptTerm(121_000);

        const first = await generateTuitionCharges(supabase, {
            orgId: ORG, periodKey: DRAFT_PERIOD, actorUserId: ACTOR,
            opportunityCustomerMemberIds: [ocmId], today: `${DRAFT_PERIOD}-01`,
        });
        expect(first.counts.generated, JSON.stringify(first.outcomes)).toBe(1);
        const firstCharge = first.outcomes[0]!.kind === "generated" ? first.outcomes[0]!.chargeId : null;
        expect(firstCharge).toBeTruthy();

        // The successor.
        await supabase
            .from("enrollment_pricing_terms")
            .update({ superseded_at: new Date().toISOString(), effective_end: lastDayOf(PERIOD) })
            .eq("id", TERM);
        await acceptTerm(150_000, { id: SUCCESSOR_TERM, resolution_key: "t7-live-draft-successor" });

        const second = await generateTuitionCharges(supabase, {
            orgId: ORG, periodKey: DRAFT_PERIOD, actorUserId: ACTOR,
            opportunityCustomerMemberIds: [ocmId], today: `${DRAFT_PERIOD}-01`,
        });
        expect(second.counts.errors, JSON.stringify(second.outcomes)).toBe(0);
        expect(second.counts.generated).toBe(1);

        // ONE occurrence, ONE obligation, ONE charge — recalculated, not duplicated.
        const { data: events } = await supabase
            .from("consumption_events").select("id")
            .eq("org_id", ORG).eq("idempotency_key", tuitionOccurrenceKey(ocmId, DRAFT_PERIOD));
        expect(events ?? []).toHaveLength(1);
        const { data: obls } = await supabase
            .from("resolved_obligations").select("id, amount_cents, draft_charge_id")
            .eq("org_id", ORG).eq("consumption_event_id", (events ?? [])[0]!.id as string);
        expect(obls ?? []).toHaveLength(1);
        expect((obls ?? [])[0]!.amount_cents, "the obligation follows the successor").toBe(150_000);

        const { data: drafts } = await supabase
            .from("charges").select("id, status, amount_cents")
            .eq("org_id", ORG).eq("charge_category", "tuition").eq("service_date", `${DRAFT_PERIOD}-01`);
        expect(drafts ?? [], "the draft is recalculated, not duplicated").toHaveLength(1);
        expect((drafts ?? [])[0]!.id).toBe(firstCharge);
        expect((drafts ?? [])[0]!.status).toBe("draft");
        expect((drafts ?? [])[0]!.amount_cents, "a draft follows the price that now applies").toBe(150_000);
    }, 120_000);
});
