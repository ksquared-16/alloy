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
    args: { orgId: string; source: { type: string; id: string }; chargeTemplateKey: string },
): Promise<readonly string[]> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, metadata")
        .eq("org_id", args.orgId)
        .eq("billable_source_type", args.source.type)
        .eq("billable_source_id", args.source.id);
    if (error) throw new Error(`enrollment fee charges could not be read (${error.message.trim()})`);
    return ((data ?? []) as ChargeRow[])
        .filter((c) => (c.metadata ?? {}).charge_template_key === args.chargeTemplateKey)
        .map((c) => c.id);
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
        for (const { source, subjectCustomerMemberId } of sources) {
            for (const chargeId of await existingFeeCharges(supabase, {
                orgId: input.orgId,
                source,
                chargeTemplateKey: req.chargeTemplateKey,
            })) {
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
