/**
 * RESPONSIBILITY AND FUNDING — against the real database.
 *
 * The net these cases divide is not fabricated: Thread 7 generates the gross from an accepted
 * pricing term and Thread 10 reduces it, so what is certified is the real chain into Thread 6
 * rather than a fixture that resembles one.
 *
 * The assertion running through all of it is the reconciliation invariant — the active allocations
 * for a charge sum EXACTLY to its allocatable net, including when part of that net belongs to
 * nobody. A billing system that quietly rounds, or quietly hands the remainder to whichever adult
 * it can find, would pass a looser test and be wrong about real people's money.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureResponsibilityArrangement } from "@/lib/financials/responsibility/arrangementService";
import { configureExpectedFunding, toFundingPlan } from "@/lib/financials/responsibility/expectedFundingService";
import { attributePaymentToResponsibility, readRemainingResponsibility } from "@/lib/financials/responsibility/paymentAttributionService";
import { resolveAllocatableNet } from "@/lib/financials/responsibility/resolveAllocatableNet";
import { resolveChargeResponsibility } from "@/lib/financials/responsibility/responsibilityService";
import { applyFinancialReductions } from "@/lib/financials/reductions/applyFinancialReductions";
import { generateTuitionCharges } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import { postChildcareCharge } from "@/lib/financials/childcareChargeService";
import { applyPaymentToCharge, recordChildcarePayment } from "@/lib/financials/childcarePaymentService";
import { attributeLine } from "@/lib/commercial/execution/fundingAttribute";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
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
const OTHER_ORG = "00000000-0000-4000-8000-0000000000ff";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const R = "6b000000-0000-4000-8000-";

describeLive("responsibility and funding, live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const kids: Array<{ ocmId: string; memberId: string; agreementId: string }> = [];
    let customerId = "";
    let alexId = "";
    let samId = "";
    let foreignPersonId = "";
    const GROSS = 100_000;

    /*
     * ORDER MATTERS AND SO DOES THE ERROR. `financial_responsibility_allocations.arrangement_id` is
     * ON DELETE RESTRICT — an arrangement that produced money cannot be deleted out from under it —
     * so the consequences go first. A silent failure here would leave a previous case's arrangement
     * in force and the next case would divide money for the wrong people while looking green.
     */
    async function clearAll() {
        for (const table of [
            "payment_responsibility_attributions",
            "financial_expected_funding",
            "financial_responsibility_allocations",
            "financial_responsibility_shares",
            "financial_responsibility_arrangements",
        ]) {
            const { error } = await supabase.from(table).delete().eq("org_id", ORG);
            expect(error, `${table}: ${error?.message}`).toBeNull();
        }
        const { data: left } = await supabase
            .from("financial_responsibility_arrangements").select("id").eq("org_id", ORG);
        expect((left ?? []).length, "no arrangement may survive into the next case").toBe(0);
    }

    async function clearMoney() {
        await supabase.from("financial_reduction_applications").delete().eq("org_id", ORG);
        await supabase.from("charges").delete().eq("org_id", ORG).in("charge_category", ["discount", "credit", "adjustment"]).eq("status", "draft");
        const { data: events } = await supabase
            .from("consumption_events").select("id").eq("org_id", ORG).like("idempotency_key", "cev:tuition:%");
        const ids = ((events ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (ids.length > 0) {
            await supabase.from("resolved_obligations").delete().in("consumption_event_id", ids);
            await supabase.from("consumption_events").delete().in("id", ids);
        }
        await supabase.from("charges").delete().eq("org_id", ORG).eq("charge_category", "tuition").eq("status", "draft");
    }

    /** Real gross for one period, produced by Thread 7 from the accepted terms. */
    async function grossFor(periodKey: string) {
        await generateTuitionCharges(supabase, {
            orgId: ORG, periodKey, actorUserId: ACTOR,
            opportunityCustomerMemberIds: kids.map((k) => k.ocmId), today: `${periodKey}-01`,
        });
        const { data } = await supabase
            .from("charges").select("id, amount_cents, status, billable_source_id")
            .eq("org_id", ORG).eq("charge_category", "tuition").eq("service_date", `${periodKey}-01`);
        return (data ?? []) as Array<{ id: string; amount_cents: number; status: string; billable_source_id: string }>;
    }

    async function allocationsFor(chargeId: string) {
        const { data } = await supabase
            .from("financial_responsibility_allocations")
            .select("id, responsible_party_id, is_unassigned, assigned_amount_cents, basis, explanation, net_snapshot_cents, gross_snapshot_cents, reductions_snapshot_cents, arrangement_id, state")
            .eq("org_id", ORG).eq("charge_id", chargeId).eq("state", "active");
        return (data ?? []) as Array<Record<string, unknown>>;
    }

    const sumAssigned = (rows: Array<Record<string, unknown>>) =>
        rows.reduce((acc, r) => acc + Number(r.assigned_amount_cents), 0);

    async function arrange(shares: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) {
        return configureResponsibilityArrangement(supabase, {
            orgId: ORG,
            customerId,
            effectiveStart: "2026-01-01",
            actorUserId: ACTOR,
            shares: shares as never,
            ...over,
        } as never);
    }

    beforeAll(async () => {
        const { data: memberRows } = await supabase
            .from("customer_members").select("id, customer_id").eq("org_id", ORG)
            .eq("customer_id", "00000000-0000-4000-8000-100000000001");
        const members = ((memberRows ?? []) as Array<{ id: string; customer_id: string }>).sort((a, b) => (a.id < b.id ? -1 : 1));
        expect(members.length, "a two-child household is needed").toBeGreaterThanOrEqual(2);
        customerId = members[0]!.customer_id;

        // TWO REAL PEOPLE on this household — the parties an arrangement will name. Taken from the
        // tenant's own `customer_persons`, never invented.
        const { data: personLinks } = await supabase
            .from("customer_persons").select("person_id").eq("org_id", ORG).eq("customer_id", customerId).limit(4);
        const personIds = [...new Set(((personLinks ?? []) as Array<{ person_id: string }>).map((p) => p.person_id))];
        expect(personIds.length, "the household must have at least two people").toBeGreaterThanOrEqual(2);
        alexId = personIds[0]!;
        samId = personIds[1]!;

        const { data: foreign } = await supabase.from("persons").select("id").neq("org_id", ORG).limit(1).maybeSingle();
        foreignPersonId = (foreign as { id: string } | null)?.id ?? "";

        const { data: siteRows } = await supabase.from("locations").select("id").eq("org_id", ORG).limit(1);
        const siteLocationId = ((siteRows ?? [])[0] as { id: string }).id;
        const { data: rate } = await supabase.from("commercial_tuition_rates").select("id").eq("org_id", ORG).limit(1).maybeSingle();
        const rateId = (rate as { id: string }).id;

        await clearAll();
        await clearMoney();
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG);

        const { data: firstOcmRows } = await supabase
            .from("opportunity_customer_members")
            .select("id, opportunity_id, location_id, schedule_type, program_category_id")
            .eq("org_id", ORG).eq("customer_member_id", members[0]!.id).limit(1);
        const firstOcm = (firstOcmRows ?? [])[0] as Record<string, string> | undefined;
        expect(firstOcm, "the first child must have an assignment").toBeTruthy();

        for (const [index, member] of members.slice(0, 2).entries()) {
            const { data: ocmRows } = await supabase
                .from("opportunity_customer_members").select("id").eq("org_id", ORG)
                .eq("customer_member_id", member.id).limit(1);
            let ocmId = ((ocmRows ?? [])[0] as { id: string } | undefined)?.id;
            if (!ocmId) {
                ocmId = `${R}00000000e00${index + 1}`;
                await supabase.from("opportunity_customer_members").insert({
                    id: ocmId, org_id: ORG, opportunity_id: firstOcm!.opportunity_id,
                    customer_member_id: member.id, schedule_type: firstOcm!.schedule_type ?? "full_time",
                    location_id: firstOcm!.location_id, program_category_id: firstOcm!.program_category_id,
                    metadata: { seed: "cert_responsibility" },
                });
            }
            const agreementId = `${R}00000000a00${index + 1}`;
            await supabase.from("child_enrollment_agreements").delete().eq("id", agreementId);
            await supabase.from("child_enrollment_agreements").insert({
                id: agreementId, org_id: ORG, customer_member_id: member.id, customer_id: customerId,
                site_location_id: siteLocationId, opportunity_customer_member_id: ocmId,
                status: "active", start_date: "2026-01-01",
            });
            await supabase.from("enrollment_pricing_terms").insert({
                id: `${R}00000000b00${index + 1}`, org_id: ORG, opportunity_customer_member_id: ocmId,
                customer_member_id: member.id, enrollment_agreement_id: agreementId, term_kind: "tuition",
                source_entity: "commercial_tuition_rates", source_id: rateId, recommended_source_id: rateId,
                cadence_key: "monthly", payer_type: "private_pay", amount_cents: GROSS, currency_code: "USD",
                state: "accepted", resolution_key: `responsibility-${index}`, effective_start: "2026-01-01",
                accepted_by: ACTOR,
            });
            kids.push({ ocmId: ocmId as string, memberId: member.id, agreementId });
        }
    }, 120_000);

    afterAll(async () => {
        if (process.env.CERT_KEEP === "1") return;
        await clearAll();
        await clearMoney();
        await supabase.from("enrollment_pricing_terms").delete().eq("org_id", ORG);
        for (const kid of kids) await supabase.from("child_enrollment_agreements").delete().eq("id", kid.agreementId);
        await supabase.from("opportunity_customer_members").delete().eq("org_id", ORG).contains("metadata", { seed: "cert_responsibility" });
    });

    // ── 1 · 70/30 ───────────────────────────────────────────────────────────────────────────

    it("divides a real net 70/30 between two named people, to the cent", async () => {
        await clearAll();
        await clearMoney();
        await arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 7000, priority: 1 },
            { responsiblePartyId: samId, method: "percentage", percentBasisPoints: 3000, priority: 2 },
        ]);
        const [charge] = await grossFor("2030-04");
        const outcome = await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR });
        expect(outcome.kind, JSON.stringify(outcome)).toBe("resolved");

        const rows = await allocationsFor(charge!.id);
        expect(rows).toHaveLength(2);
        expect(sumAssigned(rows), "allocations sum EXACTLY to the net").toBe(GROSS);
        expect(rows.find((r) => r.responsible_party_id === alexId)!.assigned_amount_cents).toBe(70_000);
        expect(rows.find((r) => r.responsible_party_id === samId)!.assigned_amount_cents).toBe(30_000);
        expect(rows.every((r) => Number(r.net_snapshot_cents) === GROSS)).toBe(true);

        // Re-reading is stable: the division came from persistence, not from a recomputation.
        expect(sumAssigned(await allocationsFor(charge!.id))).toBe(GROSS);
    }, 240_000);

    // ── 2 · FIXED + REMAINDER, AND RETRY ────────────────────────────────────────────────────

    it("gives a remainder share what a fixed share left, and a retry changes nothing", async () => {
        await clearAll();
        await clearMoney();
        await arrange([
            { responsiblePartyId: alexId, method: "fixed", amountCents: 30_000, priority: 1 },
            { responsiblePartyId: samId, method: "remainder", priority: 2 },
        ]);
        const [charge] = await grossFor("2030-05");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR });
        const rows = await allocationsFor(charge!.id);
        expect(sumAssigned(rows)).toBe(GROSS);
        expect(rows.find((r) => r.responsible_party_id === samId)!.assigned_amount_cents).toBe(70_000);

        const retry = await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR });
        expect(retry.kind).toBe("unchanged");
        expect(await allocationsFor(charge!.id)).toHaveLength(2);
    }, 240_000);

    // ── 3 · THE DECISION: NOBODY IS MADE UP ─────────────────────────────────────────────────

    it("records an unassigned remainder rather than naming the household for it", async () => {
        await clearAll();
        await clearMoney();
        await arrange([{ responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 6000, priority: 1 }]);
        const [charge] = await grossFor("2030-06");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR });

        const rows = await allocationsFor(charge!.id);
        expect(sumAssigned(rows), "the invariant holds even when nobody owns the rest").toBe(GROSS);
        const gap = rows.find((r) => r.is_unassigned === true)!;
        expect(gap, "the gap is a real row").toBeTruthy();
        expect(gap.responsible_party_id, "and it names nobody").toBeNull();
        expect(Number(gap.assigned_amount_cents)).toBe(40_000);
    }, 240_000);

    it("treats a charge with no arrangement at all as wholly unassigned", async () => {
        await clearAll();
        await clearMoney();
        const [charge] = await grossFor("2030-07");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR });
        const rows = await allocationsFor(charge!.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.is_unassigned).toBe(true);
        expect(Number(rows[0]!.assigned_amount_cents)).toBe(GROSS);
        expect(rows[0]!.arrangement_id).toBeNull();
    }, 240_000);

    // ── 4 · MULTIPLE CHILDREN, ONE HOUSEHOLD ────────────────────────────────────────────────

    it("lets two children of one household be divided differently", async () => {
        await clearAll();
        await clearMoney();
        // Account-wide 50/50, and a child-specific arrangement that overrides it for the second.
        await arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 5000, priority: 1 },
            { responsiblePartyId: samId, method: "percentage", percentBasisPoints: 5000, priority: 2 },
        ]);
        await configureResponsibilityArrangement(supabase, {
            orgId: ORG, customerId, customerMemberId: kids[1]!.memberId, effectiveStart: "2026-01-01",
            actorUserId: ACTOR,
            shares: [{ responsiblePartyId: alexId, method: "remainder", priority: 1 }],
        } as never);

        const charges = await grossFor("2030-08");
        for (const c of charges) await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: c.id, actorUserId: ACTOR });

        const firstCharge = charges.find((c) => c.billable_source_id === kids[0]!.agreementId)!;
        const secondCharge = charges.find((c) => c.billable_source_id === kids[1]!.agreementId)!;
        const firstRows = await allocationsFor(firstCharge.id);
        const secondRows = await allocationsFor(secondCharge.id);
        expect(firstRows, "the account-wide arrangement governs the first child").toHaveLength(2);
        expect(secondRows, "the child-specific one governs the second").toHaveLength(1);
        expect(secondRows[0]!.responsible_party_id).toBe(alexId);
        expect(sumAssigned(firstRows)).toBe(GROSS);
        expect(sumAssigned(secondRows)).toBe(GROSS);
    }, 300_000);

    // ── 5 · THREAD 10 INTERACTION ───────────────────────────────────────────────────────────

    it("divides the net after a Thread 10 discount, without touching the gross or reapplying it", async () => {
        await clearAll();
        await clearMoney();
        // EVERY reduction policy, not just the discount kind: a waiver left standing by another
        // case would zero this net and the assertion would be about the wrong number entirely.
        await supabase.from("commercial_policies").delete().eq("org_id", ORG)
            .in("policy_type", ["discount", "sibling_discount", "waiver"]);
        await supabase.from("commercial_policies").insert({
            id: `${R}00000000d001`, org_id: ORG, scope_type: "org", policy_type: "discount",
            label: "Community discount",
            value: { basis: "amount", value: 20_000, label: "Community discount" },
            effective_start: "2026-01-01", is_active: true,
        });
        await arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 5000, priority: 1 },
            { responsiblePartyId: samId, method: "percentage", percentBasisPoints: 5000, priority: 2 },
        ]);
        const charges = await grossFor("2030-09");
        await applyFinancialReductions(supabase, { orgId: ORG, periodKey: "2030-09", actorUserId: ACTOR, customerIds: [customerId] });

        const charge = charges[0]!;
        const net = await resolveAllocatableNet(supabase, { orgId: ORG, chargeId: charge.id });
        expect(net.grossCents, "the gross is untouched").toBe(GROSS);
        expect(net.reductionsCents).toBe(-20_000);
        expect(net.netCents).toBe(80_000);

        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge.id, actorUserId: ACTOR });
        const rows = await allocationsFor(charge.id);
        expect(sumAssigned(rows), "responsibility divides the NET, once").toBe(80_000);
        expect(rows.every((r) => Number(r.assigned_amount_cents) === 40_000)).toBe(true);
        expect(rows.every((r) => Number(r.gross_snapshot_cents) === GROSS && Number(r.reductions_snapshot_cents) === -20_000)).toBe(true);

        const { data: after } = await supabase.from("charges").select("amount_cents").eq("id", charge.id).maybeSingle();
        expect((after as { amount_cents: number }).amount_cents, "the tuition charge never moved").toBe(GROSS);
        await supabase.from("commercial_policies").delete().eq("org_id", ORG).eq("id", `${R}00000000d001`);
    }, 300_000);

    // ── 6 · PAYMENT: A NON-RESPONSIBLE PAYER, AND WHOSE SHARE IT SATISFIED ──────────────────

    it("lets a non-responsible party pay, records who paid, and explains whose share it met", async () => {
        await clearAll();
        await clearMoney();
        await arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 7000, priority: 1 },
            { responsiblePartyId: samId, method: "percentage", percentBasisPoints: 3000, priority: 2 },
        ]);
        const [charge] = await grossFor("2030-10");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR });
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR } as never);

        // A GRANDPARENT PAYS. `foreignPersonId` is deliberately somebody with no share at all.
        const payer = foreignPersonId || samId;
        const payment = await recordChildcarePayment(supabase, {
            orgId: ORG,
            billableSourceType: "enrollment_agreement",
            billableSourceId: kids[0]!.agreementId,
            customerId,
            amountCents: 70_000,
            paymentMethod: "cash",
            status: "posted",
            payerEntityType: "person",
            payerEntityId: payer,
            actorUserId: ACTOR,
        } as never);
        const paymentId = payment.payment.id;

        const { data: paymentRow } = await supabase
            .from("payments").select("payer_entity_type, payer_entity_id").eq("id", paymentId).maybeSingle();
        expect((paymentRow as Record<string, unknown>).payer_entity_id, "who actually paid is recorded").toBe(payer);

        const applied = await applyPaymentToCharge(supabase, {
            orgId: ORG, paymentId, chargeId: charge!.id, amountCents: 70_000, actorUserId: ACTOR,
        } as never);
        const applicationId = (applied as { allocation: { id: string } }).allocation.id;

        const rows = await allocationsFor(charge!.id);
        const alexAllocation = rows.find((r) => r.responsible_party_id === alexId)!;
        await attributePaymentToResponsibility(supabase, {
            orgId: ORG,
            paymentAllocationId: applicationId,
            responsibilityAllocationId: String(alexAllocation.id),
            amountCents: 70_000,
            idempotencyKey: "pra:cert-third-party",
            actorUserId: ACTOR,
        });

        const remaining = await readRemainingResponsibility(supabase, { orgId: ORG, chargeId: charge!.id });
        expect(remaining.find((r) => r.responsiblePartyId === alexId)!.remainingCents, "their share is met").toBe(0);
        expect(remaining.find((r) => r.responsiblePartyId === samId)!.remainingCents, "the other share still stands").toBe(30_000);

        // PAYING DID NOT REDISTRIBUTE ANYTHING. The arrangement and the allocations are as they were.
        expect(sumAssigned(await allocationsFor(charge!.id))).toBe(GROSS);

        // AND AN ATTRIBUTION CANNOT CLAIM MORE THAN ITS APPLICATION MOVED.
        await expect(
            attributePaymentToResponsibility(supabase, {
                orgId: ORG, paymentAllocationId: applicationId,
                responsibilityAllocationId: String(rows.find((r) => r.responsible_party_id === samId)!.id),
                amountCents: 1, idempotencyKey: "pra:cert-over", actorUserId: ACTOR,
            }),
        ).rejects.toThrow(/never moved|applied/i);
    }, 420_000);

    // ── 7 · RESPONSIBILITY CHANGE ───────────────────────────────────────────────────────────

    it("re-divides a draft freely, and refuses to move a posted charge without an explicit decision", async () => {
        await clearAll();
        await clearMoney();
        const first = await arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 10_000, priority: 1 },
        ]);
        const [november] = await grossFor("2030-11");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: november!.id, actorUserId: ACTOR });
        expect((await allocationsFor(november!.id))[0]!.responsible_party_id).toBe(alexId);

        // A SUCCESSOR from a later date. The predecessor is closed, not deleted.
        await configureResponsibilityArrangement(supabase, {
            orgId: ORG, customerId, effectiveStart: "2030-11-01", actorUserId: ACTOR,
            shares: [{ responsiblePartyId: samId, method: "percentage", percentBasisPoints: 10_000, priority: 1 }],
        } as never);
        const { data: predecessor } = await supabase
            .from("financial_responsibility_arrangements").select("effective_end, superseded_by_id")
            .eq("id", first.arrangementId).maybeSingle();
        expect((predecessor as Record<string, unknown>).effective_end, "the predecessor is closed, not erased").toBe("2030-10-31");
        expect((predecessor as Record<string, unknown>).superseded_by_id).toBeTruthy();

        // ── BEFORE POSTING: re-resolving simply follows the arrangement now in force ──
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: november!.id, actorUserId: ACTOR });
        const redivided = await allocationsFor(november!.id);
        expect(redivided).toHaveLength(1);
        expect(redivided[0]!.responsible_party_id).toBe(samId);
        expect(sumAssigned(redivided)).toBe(GROSS);
        const { data: superseded } = await supabase
            .from("financial_responsibility_allocations").select("id, responsible_party_id, state")
            .eq("org_id", ORG).eq("charge_id", november!.id).eq("state", "superseded");
        expect((superseded ?? []).length, "the prior division is still readable").toBeGreaterThan(0);

        /*
         * ── AFTER POSTING: ITS OWN MONTH ──
         *
         * December, deliberately, and it stays posted. Posting November would mean a re-run of this
         * file found its DRAFT phase already settled and silently exercised the posted path instead
         * — green, and testing the opposite of what it claims.
         */
        const [december] = await grossFor("2030-12");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: december!.id, actorUserId: ACTOR });
        expect((await allocationsFor(december!.id))[0]!.responsible_party_id).toBe(samId);
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: december!.id, actorUserId: ACTOR } as never);

        // A successor that DOES govern December — a date after it would simply never apply.
        await configureResponsibilityArrangement(supabase, {
            orgId: ORG, customerId, effectiveStart: "2030-12-01", actorUserId: ACTOR,
            shares: [{ responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 10_000, priority: 1 }],
        } as never);

        const blocked = await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: december!.id, actorUserId: ACTOR });
        expect(blocked.kind, "a posted charge is not re-divided by a background run").toBe("reallocation_required");
        expect((await allocationsFor(december!.id))[0]!.responsible_party_id, "and nothing moved").toBe(samId);

        // The explicit act does it, with a reason and lineage.
        const reallocated = await resolveChargeResponsibility(supabase, {
            orgId: ORG, chargeId: december!.id, actorUserId: ACTOR,
            allowReallocation: true, reallocationReason: "Court order filed 2030-12-01",
        });
        expect(reallocated.kind).toBe("resolved");
        const afterMove = await allocationsFor(december!.id);
        expect(afterMove[0]!.responsible_party_id).toBe(alexId);
        expect(String(afterMove[0]!.explanation)).toContain("Court order");
        expect(sumAssigned(afterMove), "and it still sums to the net").toBe(GROSS);
        // The party who used to owe it is still on the record, superseded rather than erased.
        const { data: priorDivision } = await supabase
            .from("financial_responsibility_allocations").select("responsible_party_id")
            .eq("org_id", ORG).eq("charge_id", december!.id).eq("state", "superseded");
        expect(((priorDivision ?? []) as Array<{ responsible_party_id: string }>).some((r) => r.responsible_party_id === samId)).toBe(true);
    }, 420_000);

    // ── 8 · EFFECTIVE DATING ────────────────────────────────────────────────────────────────

    it("does not apply a future arrangement early, and lets the successor govern later periods", async () => {
        await clearAll();
        await clearMoney();
        await arrange([{ responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 10_000, priority: 1 }]);
        await configureResponsibilityArrangement(supabase, {
            orgId: ORG, customerId, effectiveStart: "2031-02-01", actorUserId: ACTOR,
            shares: [{ responsiblePartyId: samId, method: "percentage", percentBasisPoints: 10_000, priority: 1 }],
        } as never);

        const [january] = await grossFor("2031-01");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: january!.id, actorUserId: ACTOR });
        expect((await allocationsFor(january!.id))[0]!.responsible_party_id, "January is the predecessor's").toBe(alexId);

        const [february] = await grossFor("2031-02");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: february!.id, actorUserId: ACTOR });
        expect((await allocationsFor(february!.id))[0]!.responsible_party_id, "February is the successor's").toBe(samId);
        // And January did not move when February was resolved.
        expect((await allocationsFor(january!.id))[0]!.responsible_party_id).toBe(alexId);
    }, 300_000);

    // ── 9 · INVALID CONFIGURATION ───────────────────────────────────────────────────────────

    it("refuses configurations that would divide money wrongly", async () => {
        await clearAll();
        await expect(arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 7000, priority: 1 },
            { responsiblePartyId: samId, method: "percentage", percentBasisPoints: 4000, priority: 2 },
        ])).rejects.toThrow(/110%|percentage/i);

        await expect(arrange([{ responsiblePartyId: "00000000-0000-4000-8000-0000000000zz", method: "remainder" }]))
            .rejects.toThrow();

        if (foreignPersonId) {
            await expect(arrange([{ responsiblePartyId: foreignPersonId, method: "remainder", priority: 1 }]))
                .rejects.toThrow(/not a person in this organisation/i);
        }

        await expect(arrange([
            { responsiblePartyId: alexId, method: "remainder", priority: 1 },
            { responsiblePartyId: samId, method: "remainder", priority: 2 },
        ])).rejects.toThrow(/one party can take the remainder/i);

        await expect(arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 5000, priority: 1 },
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 5000, priority: 2 },
        ])).rejects.toThrow(/only one share/i);

        // Overlapping windows for one scope: the DATABASE refuses it, not a read.
        await arrange([{ responsiblePartyId: alexId, method: "remainder", priority: 1 }]);
        await expect(
            configureResponsibilityArrangement(supabase, {
                orgId: ORG, customerId, effectiveStart: "2026-01-01", actorUserId: ACTOR,
                shares: [{ responsiblePartyId: samId, method: "remainder", priority: 1 }],
            } as never),
        ).rejects.toThrow(/already in force/i);
    }, 300_000);

    it("refuses a fixed share larger than the net at resolution", async () => {
        await clearAll();
        await clearMoney();
        await arrange([{ responsiblePartyId: alexId, method: "fixed", amountCents: 500_000, priority: 1 }]);
        const [charge] = await grossFor("2031-03");
        const outcome = await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR });
        expect(outcome.kind).toBe("refused");
        expect(outcome.kind === "refused" && outcome.reason).toBe("fixed_exceeds_net");
        expect(await allocationsFor(charge!.id), "nothing was written").toHaveLength(0);
    }, 240_000);

    it("keeps another organisation's charges out of this one's resolution", async () => {
        await clearMoney();
        const [charge] = await grossFor("2031-04");
        const outcome = await resolveChargeResponsibility(supabase, { orgId: OTHER_ORG, chargeId: charge!.id, actorUserId: ACTOR });
        expect(outcome.kind).toBe("refused");
        expect(outcome.kind === "refused" && outcome.reason).toBe("not_found");
    }, 240_000);

    // ── 10 · CONCURRENCY ────────────────────────────────────────────────────────────────────

    it("converges under concurrent resolution to exactly one active allocation set", async () => {
        await clearAll();
        await clearMoney();
        await arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 7000, priority: 1 },
            { responsiblePartyId: samId, method: "percentage", percentBasisPoints: 3000, priority: 2 },
        ]);
        const [charge] = await grossFor("2031-05");
        await Promise.all([
            resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR }),
            resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR }),
            resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR }),
            resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR }),
        ]);
        const rows = await allocationsFor(charge!.id);
        expect(rows, "one active set, not four").toHaveLength(2);
        expect(sumAssigned(rows), "and it still sums to the net").toBe(GROSS);
    }, 300_000);

    // ── 11 · EXPECTED FUNDING ───────────────────────────────────────────────────────────────

    it("attaches expected funding to a share without it becoming a payment or a payer", async () => {
        await clearAll();
        await clearMoney();
        const arrangement = await arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 10_000, priority: 1 },
        ]);
        const { data: shareRows } = await supabase
            .from("financial_responsibility_shares").select("id").eq("arrangement_id", arrangement.arrangementId);
        const shareId = ((shareRows ?? [])[0] as { id: string }).id;

        const fundingConfiguredAt = new Date().toISOString();
        await configureExpectedFunding(supabase, {
            orgId: ORG, shareId, arrangementId: arrangement.arrangementId,
            fundingSourceType: "government_subsidy", fundingSourceLabel: "State subsidy",
            basis: "fixed_amount", expectedAmountCents: 65_000,
            idempotencyKey: "fef:cert-subsidy", actorUserId: ACTOR,
        });

        const [charge] = await grossFor("2031-06");
        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charge!.id, actorUserId: ACTOR });
        const rows = await allocationsFor(charge!.id);
        expect(sumAssigned(rows), "expected funding changes nobody's responsibility").toBe(GROSS);
        expect(rows[0]!.responsible_party_id, "and creates no second payer").toBe(alexId);

        // OUTSTANDING IS UNMOVED: expected money is not received money.
        const { data: chargeAfter } = await supabase.from("charges").select("amount_cents, status").eq("id", charge!.id).maybeSingle();
        expect((chargeAfter as { amount_cents: number }).amount_cents).toBe(GROSS);
        const { data: payments } = await supabase
            .from("payments").select("id, created_at").eq("org_id", ORG)
            .eq("billable_source_id", kids[0]!.agreementId).gte("created_at", fundingConfiguredAt);
        expect((payments ?? []).length, "configuring expected funding invents no receipt").toBe(0);

        // ── AND IT FEEDS COMMERCIAL'S ENGINE, WHICH STAYS THE OWNER OF THE ARITHMETIC ──
        const plan = await toFundingPlan(supabase, { orgId: ORG, allocationId: String(rows[0]!.id) });
        expect(plan, "a responsible party's share can be handed to the funding engine").toBeTruthy();
        expect(plan!.primary.partyId, "the responsible party is the primary, so the gap stays theirs").toBe(alexId);
        const attributed = attributeLine(
            { status: "resolved", kind: "tuition", net: { amountCents: GROSS, currency: "USD" } } as never,
            plan!,
            "half_up" as never,
        );
        expect(attributed.allocations[0]!.amountCents).toBe(65_000);
        expect(attributed.residual.amountCents, "what the family still expects to pay themselves").toBe(35_000);
        expect(
            attributed.allocations.reduce((a, x) => a + x.amountCents, 0) + attributed.residual.amountCents,
            "the engine's own invariant, unchanged",
        ).toBe(GROSS);
    }, 300_000);

    it("refuses expected funding that hangs off nothing", async () => {
        await expect(
            configureExpectedFunding(supabase, {
                orgId: ORG, fundingSourceType: "scholarship", fundingSourceLabel: "Floating money",
                basis: "fixed_amount", expectedAmountCents: 1_000,
                idempotencyKey: "fef:cert-floating", actorUserId: ACTOR,
            } as never),
        ).rejects.toThrow(/belongs to nobody|attaches to/i);
    }, 120_000);

    // ── 12 · ZERO NET ───────────────────────────────────────────────────────────────────────

    it("allocates a fully discounted month as nothing owed by anyone", async () => {
        await clearAll();
        await clearMoney();
        await supabase.from("commercial_policies").delete().eq("org_id", ORG)
            .in("policy_type", ["discount", "sibling_discount", "waiver"]);
        await supabase.from("commercial_policies").insert({
            id: `${R}00000000d002`, org_id: ORG, scope_type: "org", policy_type: "waiver",
            label: "Hardship waiver", value: { label: "Hardship waiver" },
            effective_start: "2026-01-01", is_active: true,
        });
        await arrange([
            { responsiblePartyId: alexId, method: "percentage", percentBasisPoints: 5000, priority: 1 },
            { responsiblePartyId: samId, method: "percentage", percentBasisPoints: 5000, priority: 2 },
        ]);
        const charges = await grossFor("2031-07");
        await applyFinancialReductions(supabase, { orgId: ORG, periodKey: "2031-07", actorUserId: ACTOR, customerIds: [customerId] });
        const net = await resolveAllocatableNet(supabase, { orgId: ORG, chargeId: charges[0]!.id });
        expect(net.netCents).toBe(0);

        await resolveChargeResponsibility(supabase, { orgId: ORG, chargeId: charges[0]!.id, actorUserId: ACTOR });
        const rows = await allocationsFor(charges[0]!.id);
        expect(sumAssigned(rows)).toBe(0);
        expect(rows).toHaveLength(2);
        await supabase.from("commercial_policies").delete().eq("org_id", ORG).eq("id", `${R}00000000d002`);
    }, 300_000);
});
