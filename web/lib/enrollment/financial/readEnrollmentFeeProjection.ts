/**
 * WHAT THE FAMILY OWES, READ AND NEVER WRITTEN.
 *
 * `resolveEnrollmentFeeObligations` MATERIALIZES a fee: it creates and posts canonical charges. That
 * is an operator/evaluator act. This is its read-only twin, and the distinction is the whole point —
 * a participant opening their family page must not bring money into existence. A GET that creates a
 * charge is a GET that bills a family for looking.
 *
 * So this finds obligations that ALREADY exist and quotes them. It creates nothing, posts nothing,
 * and corrects nothing.
 *
 * ── HOW AN EXISTING FEE CHARGE IS RECOGNISED ──
 *
 * `writeTemplateDraftCharge` stamps `metadata.charge_template_key` on every charge it writes from a
 * template. That stamp is the link back to the authored requirement, so a read matches on the
 * billable source plus that key rather than on an amount or a date — neither of which identifies
 * anything.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";
import {
    billableSourcesForScope,
    findReversalChargeId,
    type EnrollingChild,
} from "@/lib/enrollment/financial/resolveEnrollmentFeeObligations";
import {
    combineEnrollmentFinancialProjections,
    projectEnrollmentFinancialRequirement,
    type EnrollmentFeeObligation,
    type EnrollmentFinancialRequirementProjection,
} from "@/lib/enrollment/financial/enrollmentFinancialRequirement";

/** The authored financial requirements on a stage, narrowed to what this reader needs. */
export function financialRequirementsOf(
    requirements: readonly StageRequirementV1[],
): readonly { requirementId: string; chargeTemplateKey: string; scope: StageRequirementV1["scope"] }[] {
    const seen = new Set<string>();
    const out: { requirementId: string; chargeTemplateKey: string; scope: StageRequirementV1["scope"] }[] = [];
    for (const r of requirements) {
        if (r.ref.kind !== "financial") continue;
        /*
         * Deduped by requirement id. A family-scoped fee is authored once on the stage, and the stage
         * is read once PER CHILD — so without this a two-child household would report the household
         * fee twice and a parent would be shown double what they owe.
         */
        if (seen.has(r.requirement_id)) continue;
        seen.add(r.requirement_id);
        out.push({ requirementId: r.requirement_id, chargeTemplateKey: r.ref.charge_template_key, scope: r.scope });
    }
    return out;
}

type ChargeRow = { id: string; metadata: Record<string, unknown> | null };

async function existingFeeCharges(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        source: { type: string; id: string };
        chargeTemplateKey: string;
        /** The child a per-child household fee is for — siblings' fees share the household source. */
        subjectCustomerMemberId?: string | null;
    },
): Promise<readonly string[]> {
    /*
     * THE TEMPLATE KEY IS MATCHED IN THE QUERY, NOT AFTERWARDS.
     *
     * This read once selected every charge on the billable source and picked the fee out in
     * JavaScript, which is wrong for a reason no unit test could show: PostgREST caps a response at
     * 1000 rows. A household or agreement that has accumulated more charges than that — years of
     * tuition, late pickups, field trips — would return a page that simply did not contain the fee,
     * and the projection would then report ATTENTION_REQUIRED ("no charge has been created") about a
     * charge that exists and may already be paid.
     *
     * Certification found it: on the certification stack the fixture agreement carries exactly 1000
     * readable charges, and the fee written moments earlier was invisible. Filtering in the database
     * returns the one row that matters, so the cap stops being reachable.
     */
    let query = supabase
        .from("charges")
        .select("id, metadata")
        .eq("org_id", args.orgId)
        .eq("billable_source_type", args.source.type)
        .eq("billable_source_id", args.source.id)
        .eq("metadata->>charge_template_key", args.chargeTemplateKey);
    if (args.source.type === "customer" && args.subjectCustomerMemberId) {
        query = query.eq("metadata->>subject_customer_member_id", args.subjectCustomerMemberId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`enrollment fee charges could not be read (${error.message.trim()})`);
    return ((data ?? []) as ChargeRow[]).map((c) => c.id);
}

export type ReadEnrollmentFeeInput = {
    readonly orgId: string;
    readonly customerId: string;
    readonly enrollingChildren: readonly EnrollingChild[];
    readonly requirements: readonly StageRequirementV1[];
    /** Whether every prerequisite non-financial requirement is resolved. */
    readonly due: boolean;
};

/**
 * Read the family's financial requirement state. No writes.
 */
export async function readEnrollmentFeeProjection(
    supabase: SupabaseClient,
    input: ReadEnrollmentFeeInput,
): Promise<EnrollmentFinancialRequirementProjection> {
    const financial = financialRequirementsOf(input.requirements);
    if (financial.length === 0) {
        return projectEnrollmentFinancialRequirement({ configured: false, due: input.due, resolvesToZero: false, obligations: [] });
    }

    const obligations: EnrollmentFeeObligation[] = [];
    for (const req of financial) {
        const sources = billableSourcesForScope({
            scope: req.scope ?? "record",
            customerId: input.customerId,
            enrollingChildren: input.enrollingChildren,
        });
        for (const { source, subjectCustomerMemberId, legacyAgreementId } of sources) {
            const agreementSource = legacyAgreementId ? { type: "enrollment_agreement" as const, id: legacyAgreementId } : null;
            const found: { chargeId: string; source: { type: "enrollment_agreement" | "customer"; id: string } }[] = [
                ...(await existingFeeCharges(supabase, {
                    orgId: input.orgId,
                    source,
                    chargeTemplateKey: req.chargeTemplateKey,
                    subjectCustomerMemberId,
                })).map((chargeId) => ({ chargeId, source })),
                // A per-child fee an earlier path wrote against the child's agreement is the same
                // obligation, reported against the source it was actually written to.
                ...(agreementSource
                    ? (await existingFeeCharges(supabase, {
                          orgId: input.orgId,
                          source: agreementSource,
                          chargeTemplateKey: req.chargeTemplateKey,
                      })).map((chargeId) => ({ chargeId, source: agreementSource }))
                    : []),
            ];
            for (const { chargeId, source } of found) {
                const reversedByChargeId = await findReversalChargeId(supabase, { orgId: input.orgId, chargeId });
                /*
                 * A charge that exists but cannot be positioned is reported WITHOUT a position rather
                 * than dropped or guessed — the projection turns that into ATTENTION_REQUIRED, because
                 * a charge nobody can position needs a person, not a default.
                 */
                try {
                    const p = await resolveFamilyCollectible(supabase, { orgId: input.orgId, chargeId });
                    obligations.push({
                        requirementId: req.requirementId,
                        chargeTemplateKey: req.chargeTemplateKey,
                        billableSource: source,
                        subjectCustomerMemberId,
                        reversedByChargeId,
                        position: {
                            chargeId: p.chargeId,
                            currencyCode: p.currencyCode,
                            chargeStatus: "posted",
                            grossCents: p.explanation.grossCents,
                            appliedCents: p.explanation.appliedCents,
                            expectedSubsidyCents: p.expectedSubsidyCents,
                            currentlyCollectibleCents: p.currentlyCollectibleCents,
                            outstandingCents: p.outstandingCents,
                            unresolvedVarianceCents: p.unresolvedVarianceCents,
                            suppressionBoundBy: p.explanation.suppressionBoundBy,
                            openVarianceStates: p.explanation.openVarianceStates,
                        },
                    });
                } catch (e) {
                    obligations.push({
                        requirementId: req.requirementId,
                        chargeTemplateKey: req.chargeTemplateKey,
                        billableSource: source,
                        subjectCustomerMemberId,
                        reversedByChargeId,
                        position: null,
                        positionUnavailableReason: e instanceof Error ? e.message : "Collectible position is unavailable.",
                    });
                }
            }
        }
    }

    /*
     * A fee is CONFIGURED but no obligation exists yet. That is NOT_DUE before the boundary and, once
     * due, it means nothing has been materialized — which the evaluator owns, not this read. Reporting
     * SATISFIED here would tell a family it owed nothing because nobody had created the charge.
     */
    return projectEnrollmentFinancialRequirement({
        configured: true,
        due: input.due,
        resolvesToZero: false,
        obligations,
    });
}

/** One child of a family read: its OWN stage requirements and its OWN dueness. */
export type FamilyFeeChild = EnrollingChild & {
    /** The requirements of this child's pinned revision at this child's current stage. */
    readonly requirements: readonly StageRequirementV1[];
    /** Whether every non-financial requirement of THIS child is resolved. */
    readonly due: boolean;
};

export type FamilyFeeRead = {
    readonly requirements: readonly StageRequirementV1[];
    readonly enrollingChildren: readonly EnrollingChild[];
    readonly due: boolean;
};

/**
 * WHICH READS A FAMILY'S FEES TAKE — pure, so the ownership rule is testable on its own.
 *
 * A per-child fee belongs to the child whose stage authors it: read against that child alone, due when
 * that child's paperwork is done. A sibling at another stage cannot remove it (the family list was
 * once whichever child was read last) and cannot hold it back (every child's open fields once counted
 * against every fee).
 *
 * A household-scoped fee is authored once on a stage, so it is read once — for the children whose
 * stage carries it, and due when all of THOSE children are done. Children at a stage that does not
 * author it have no say in it.
 */
export function planFamilyFeeReads(children: readonly FamilyFeeChild[]): readonly FamilyFeeRead[] {
    const reads: FamilyFeeRead[] = [];
    const shared = new Map<string, { requirement: StageRequirementV1; carriers: FamilyFeeChild[] }>();
    for (const child of children) {
        const child_ = { customerMemberId: child.customerMemberId, agreementId: child.agreementId };
        const own = child.requirements.filter((r) => r.ref.kind === "financial" && r.scope === "each_child");
        if (own.length > 0) reads.push({ requirements: own, enrollingChildren: [child_], due: child.due });
        for (const r of child.requirements) {
            if (r.ref.kind !== "financial" || r.scope === "each_child") continue;
            const entry = shared.get(r.requirement_id) ?? { requirement: r, carriers: [] };
            entry.carriers.push(child);
            shared.set(r.requirement_id, entry);
        }
    }
    for (const { requirement, carriers } of shared.values()) {
        reads.push({
            requirements: [requirement],
            enrollingChildren: carriers.map((c) => ({ customerMemberId: c.customerMemberId, agreementId: c.agreementId })),
            due: carriers.every((c) => c.due),
        });
    }
    return reads;
}

/**
 * The family's fees, each read under its own children's requirements, combined. Read-only, like the
 * single read it is made of.
 */
export async function readFamilyEnrollmentFeeProjection(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerId: string; readonly children: readonly FamilyFeeChild[] },
): Promise<EnrollmentFinancialRequirementProjection> {
    const parts: EnrollmentFinancialRequirementProjection[] = [];
    for (const read of planFamilyFeeReads(input.children)) {
        parts.push(await readEnrollmentFeeProjection(supabase, { orgId: input.orgId, customerId: input.customerId, ...read }));
    }
    return combineEnrollmentFinancialProjections(parts);
}
