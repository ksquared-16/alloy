/**
 * H3-2 — THE REGISTRATION FEE LIFECYCLE, AGAINST THE REAL FINANCIALS SPINE.
 *
 * Per enrolling child, one obligation, owed when the child's paperwork is done — with or without an
 * agreement. The household is the billable source (the payer); the child is the charge's subject.
 * Everything monetary is Financials': the template, the amount, posting, the ledger, the correction.
 *
 * Certified here over rows written through the canonical services:
 *   1  two children (one without an agreement) → two posted charges, one per child, household source
 *   2  replaying the same due day → the same two charges, nothing new
 *   3  a fee an earlier path wrote against the child's agreement is recognised, not charged again
 *   4  agreement activation's registration path sees the Enrollment fee and would not bill again
 *   5  an unknown template → no charge, reported as a configuration problem
 *   6  the projection positions each child's fee; a partial payment and a reversal read correctly
 *
 * Skipped unless the cert stack is configured (alloy-stack use && certification/alloy-certify env).
 * Fixture: certification/fixtures/financials-charge-spine.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createChargeTemplate } from "@/lib/financials/chargeTemplates/chargeTemplateAuthoringService";
import { writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { recordAndApplyChildcarePayment } from "@/lib/financials/childcarePaymentService";
import {
    findEpisodeFeeChargeId,
    resolveEnrollmentFeeObligations,
    reverseEnrollmentFeeObligation,
} from "@/lib/enrollment/financial/resolveEnrollmentFeeObligations";
import { readEnrollmentFeeProjection } from "@/lib/enrollment/financial/readEnrollmentFeeProjection";
import { registrationFeeAlreadyCharged } from "@/lib/operationalConsumption/consumptionService";
import { parseStageRequirementsV1 } from "@/lib/lifecycle/stageRequirementsV1";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const ORG = "00000000-0000-4000-8000-000000000001";
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const AGREEMENT = "fc500000-0000-4000-8000-0000000a0001";
const CHILD = "fc500000-0000-4000-8000-0000000d0001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const TODAY = new Date().toISOString().slice(0, 10);
const RUN = Date.now();
const FEE_KEY = `cert_h3_2_reg_${RUN}`;
const LEGACY_KEY = `cert_h3_2_legacy_${RUN}`;
const SIBLING = randomUUID();

let supabase: SupabaseClient;
let feeTemplateId = "";

function perChild(templateKey: string) {
    return (
        parseStageRequirementsV1({
            version: 1,
            requirements: [
                { requirement_id: `fee_${templateKey}`, kind: "financial", charge_template_key: templateKey, level: "required", scope: "each_child", timing: "stage_exit", enforcement: "blocking" },
            ],
        })?.requirements ?? []
    );
}

const template = (templateKey: string, amountCents: number) =>
    createChargeTemplate(supabase, {
        orgId: ORG,
        templateKey,
        label: `Cert ${templateKey}`,
        chargeCategory: "fee",
        triggerType: "manual",
        amountStrategy: "fixed",
        amountCents,
        occursOnStrategy: "now",
        billableOnStrategy: "immediate",
        effectiveStart: "2020-01-01",
    } as never);

const resolveFee = (templateKey: string, children: { customerMemberId: string; agreementId: string | null }[], dueOn = TODAY) =>
    resolveEnrollmentFeeObligations(supabase, {
        orgId: ORG,
        requirementId: `fee_${templateKey}`,
        chargeTemplateKey: templateKey,
        scope: "each_child",
        customerId: HOUSEHOLD,
        enrollingChildren: children,
        dueOn,
        actorUserId: ACTOR,
    });

const chargesFor = async (templateKey: string) => {
    const { data, error } = await supabase
        .from("charges")
        .select("id, status, amount_cents, billable_source_type, billable_source_id, metadata")
        .eq("org_id", ORG)
        .eq("metadata->>charge_template_key", templateKey);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; status: string; amount_cents: number; billable_source_type: string; billable_source_id: string; metadata: Record<string, unknown> }[];
};

describe.skipIf(!env)("registration fee lifecycle — live", () => {
    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const { error } = await supabase.from("customer_members").insert({
            id: SIBLING, org_id: ORG, customer_id: HOUSEHOLD, display_name: "Certa Sibling", first_name: "Certa", last_name: "Sibling", is_active: true,
        });
        if (error) throw new Error(error.message);
        /*
         * The charge spine bills into a household's commercial period, so the fixture household needs
         * a billing calendar (W7). A customer-scoped monthly calendar — the same shape the demo-tenant
         * fixture authors — added once, idempotently.
         */
        const { data: cal } = await supabase
            .from("financial_policies")
            .select("id")
            .eq("org_id", ORG)
            .eq("scope_type", "customer")
            .eq("customer_id", HOUSEHOLD)
            .eq("policy_type", "billing_calendar")
            .eq("is_active", true)
            .limit(1);
        if (!(cal ?? []).length) {
            const { error: calError } = await supabase.from("financial_policies").insert({
                org_id: ORG, scope_type: "customer", customer_id: HOUSEHOLD, policy_type: "billing_calendar",
                label: "Cert household account calendar", value: { cadence: "monthly", anchor_on: null }, is_active: true,
                effective_start: "2020-01-01", source_key: "certification", metadata: { fixture: "h3_2" },
            });
            if (calError) throw new Error(calError.message);
        }
        feeTemplateId = (await template(FEE_KEY, 12500)).id;
        await template(LEGACY_KEY, 9900);
    });

    afterAll(async () => {
        // Leave the shared fixture as it was found: the calendar this suite added is switched off.
        await supabase.from("financial_policies").update({ is_active: false }).eq("org_id", ORG).eq("metadata->>fixture", "h3_2");
    });

    it("1 — two children, one without an agreement, become two posted charges on the household", async () => {
        const r = await resolveFee(FEE_KEY, [
            { customerMemberId: CHILD, agreementId: null },
            { customerMemberId: SIBLING, agreementId: null },
        ]);
        expect(r.templateResolved).toBe(true);
        expect(r.outcomes.map((o) => o.status)).toEqual(["created", "created"]);
        const rows = await chargesFor(FEE_KEY);
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row.billable_source_type).toBe("customer");
            expect(row.billable_source_id).toBe(HOUSEHOLD);
            expect(row.status).toBe("posted");
            expect(row.amount_cents).toBe(12500);
        }
        expect(new Set(rows.map((r) => r.metadata.subject_customer_member_id))).toEqual(new Set([CHILD, SIBLING]));
        expect(new Set(rows.map((r) => r.metadata.resolution_key)).size).toBe(2);
    });

    it("2 — replaying the same due day returns the same charges and writes nothing", async () => {
        const before = (await chargesFor(FEE_KEY)).map((r) => r.id).sort();
        const r = await resolveFee(FEE_KEY, [
            { customerMemberId: CHILD, agreementId: null },
            { customerMemberId: SIBLING, agreementId: null },
        ]);
        expect(r.outcomes.every((o) => o.status === "skipped_posted" || o.status === "unchanged")).toBe(true);
        expect((await chargesFor(FEE_KEY)).map((r) => r.id).sort()).toEqual(before);
    });

    it("3 — a fee already charged against the child's agreement is recognised, not charged again", async () => {
        const legacy = await template(`${LEGACY_KEY}_x`, 9900);
        const written = await writeTemplateDraftCharge(supabase, ORG, {
            templateId: legacy.id,
            agreementId: AGREEMENT,
            eventDate: TODAY,
            today: TODAY,
            actorUserId: ACTOR,
        });
        expect(written.status).toBe("created");
        const r = await resolveFee(`${LEGACY_KEY}_x`, [{ customerMemberId: CHILD, agreementId: AGREEMENT }]);
        expect(r.outcomes).toHaveLength(1);
        expect(r.outcomes[0]).toMatchObject({ status: "unchanged", chargeId: (written as { chargeId: string }).chargeId });
        expect(await chargesFor(`${LEGACY_KEY}_x`)).toHaveLength(1);
    });

    it("4 — agreement activation's registration path sees the child's Enrollment fee", async () => {
        // The agreement's OWN child, read rather than assumed: the shared fixture's agreement is not
        // guaranteed to belong to CHILD.
        const { data: agr } = await supabase.from("child_enrollment_agreements").select("customer_member_id").eq("id", AGREEMENT).single();
        const agreementChild = (agr as { customer_member_id: string }).customer_member_id;
        expect(await registrationFeeAlreadyCharged(supabase, ORG, AGREEMENT, feeTemplateId)).toBe(
            agreementChild === CHILD || agreementChild === SIBLING
                ? (await chargesFor(FEE_KEY)).find((r) => r.metadata.subject_customer_member_id === agreementChild)!.id
                : null,
        );
        // Once Enrollment charges that child's fee, the agreement path sees it.
        await resolveFee(FEE_KEY, [{ customerMemberId: agreementChild, agreementId: null }]);
        const agreementChildFee = (await chargesFor(FEE_KEY)).find((r) => r.metadata.subject_customer_member_id === agreementChild)!;
        expect(await registrationFeeAlreadyCharged(supabase, ORG, AGREEMENT, feeTemplateId)).toBe(agreementChildFee.id);
        const other = await template(`${FEE_KEY}_other`, 100);
        expect(await registrationFeeAlreadyCharged(supabase, ORG, AGREEMENT, other.id)).toBeNull();
    });

    it("5 — an unknown template writes nothing and says so", async () => {
        const r = await resolveFee(`${FEE_KEY}_missing`, [{ customerMemberId: CHILD, agreementId: null }]);
        expect(r.templateResolved).toBe(false);
        expect(r.outcomes).toEqual([]);
        expect(await chargesFor(`${FEE_KEY}_missing`)).toHaveLength(0);
    });

    it("6 — each child's fee is positioned; a partial payment and a reversal read correctly", async () => {
        const project = () =>
            readEnrollmentFeeProjection(supabase, {
                orgId: ORG,
                customerId: HOUSEHOLD,
                enrollingChildren: [
                    { customerMemberId: CHILD, agreementId: AGREEMENT },
                    { customerMemberId: SIBLING, agreementId: null },
                ],
                requirements: perChild(FEE_KEY),
                due: true,
            });
        const first = await project();
        expect(first.obligations).toHaveLength(2);
        expect(first.obligations.map((o) => o.position?.outstandingCents)).toEqual([12500, 12500]);

        const rows = await chargesFor(FEE_KEY);
        const childCharge = rows.find((r) => r.metadata.subject_customer_member_id === CHILD)!;
        const siblingCharge = rows.find((r) => r.metadata.subject_customer_member_id === SIBLING)!;
        await recordAndApplyChildcarePayment(supabase, {
            orgId: ORG,
            chargeId: childCharge.id,
            amountCents: 2500,
            paymentMethod: "check",
            receivedAt: TODAY,
            actorUserId: ACTOR,
            idempotencyKey: `cert-h3-2-${RUN}-partial`,
        } as never);
        await reverseEnrollmentFeeObligation(supabase, { orgId: ORG, chargeId: siblingCharge.id, actorUserId: ACTOR });

        const after = await project();
        const forChild = after.obligations.find((o) => o.subjectCustomerMemberId === CHILD)!;
        const forSibling = after.obligations.find((o) => o.subjectCustomerMemberId === SIBLING)!;
        expect(forChild.position?.appliedCents).toBe(2500);
        expect(forChild.position?.outstandingCents).toBe(10000);
        expect(forSibling.reversedByChargeId).toBeTruthy();
    });

    it("7 — a later due day in the same episode (relaunch, billing-day change) finds the same fee", async () => {
        const before = (await chargesFor(FEE_KEY)).length;
        const r = await resolveFee(FEE_KEY, [{ customerMemberId: CHILD, agreementId: null }], addDays(TODAY, -3));
        expect(r.outcomes.map((o) => o.status)).toEqual(["unchanged"]);
        expect((await chargesFor(FEE_KEY)).length).toBe(before);
    });

    it("8 — a reversed fee is never re-billed in its episode", async () => {
        // SIBLING's fee was reversed in test 6; replaying its completion writes nothing new.
        const before = (await chargesFor(FEE_KEY)).filter((r) => r.metadata.subject_customer_member_id === SIBLING).length;
        const r = await resolveFee(FEE_KEY, [{ customerMemberId: SIBLING, agreementId: null }]);
        expect(r.outcomes.map((o) => o.status)).toEqual(["unchanged"]);
        expect((await chargesFor(FEE_KEY)).filter((r) => r.metadata.subject_customer_member_id === SIBLING).length).toBe(before);
    });

    it("9 — a fee from an EARLIER episode never counts as a later episode's fee", async () => {
        // Real due days are completions (today or earlier), so a later episode is represented by its
        // later due day: the guard must not see this episode's fee, dated before it, as that one's.
        const later = addDays(TODAY, 30);
        expect(await findEpisodeFeeChargeId(supabase, { orgId: ORG, customerId: HOUSEHOLD, subjectCustomerMemberId: CHILD, chargeTemplateKey: FEE_KEY, dueOn: later })).toBeNull();
        const same = await findEpisodeFeeChargeId(supabase, { orgId: ORG, customerId: HOUSEHOLD, subjectCustomerMemberId: CHILD, chargeTemplateKey: FEE_KEY, dueOn: TODAY });
        expect(same?.id).toBeTruthy();
    });
});

function addDays(ymd: string, days: number): string {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
