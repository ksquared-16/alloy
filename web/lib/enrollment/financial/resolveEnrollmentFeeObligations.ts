/**
 * THE ONE WIRE BETWEEN ENROLLMENT AND FINANCIALS.
 *
 * Before this file, `lib/enrollment` and `lib/pos` imported nothing from `lib/financials` — two
 * mature domains with no connection, so completing enrolment created the `child_enrollment_agreements`
 * a charge hangs from and then never created a charge. This is that wire, and it is deliberately
 * thin: Enrollment decides WHETHER and AT WHAT GRAIN, and Financials decides everything else.
 *
 * ── WHAT THIS FILE IS NOT ALLOWED TO DO ──
 *
 * It does not price anything, split responsibility, net a subsidy, or decide what is collectible. It
 * calls `writeTemplateDraftCharge` and `postChildcareCharge`, which are the same services an
 * operator's own actions go through. If a number appears in this file that Financials did not
 * produce, something has gone wrong.
 *
 * ── IDEMPOTENCY IS BORROWED, NOT INVENTED ──
 *
 * Financials already keys a template charge as `tpl:<template_key>:<occurs_on>:<scopeKey>`, deduped
 * within the billable source, where the scope key IS the source id. That distinguishes organization
 * (the query is org-scoped), family (`customer` source), child (`enrollment_agreement` source) and
 * charge definition (`template_key`) without Enrollment keeping any ledger of its own.
 *
 * The one thing Enrollment must supply is a STABLE DATE. `occurs_on` is part of the key, so passing
 * "today" would mint a second charge for the same fee the next morning. The caller therefore passes
 * `dueOn` — the date the requirement BECAME due, which is a fact about the journey and does not
 * move when someone reloads a page, resumes a packet, or retries an event.
 *
 * Episode identity rides along rather than being stamped separately: a per-child fee is keyed to the
 * agreement, and a new enrolment episode for the same child is a NEW agreement. A per-family fee is
 * keyed to the household plus the date it fell due, and two episodes falling due for the same
 * household on the same day against the same definition is the one collision this scheme permits —
 * recorded here rather than papered over.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listChargeTemplates } from "@/lib/financials/chargeTemplates/chargeTemplateAuthoringService";
import { currentTemplateFor } from "@/lib/forms/supplied/resolveConfigurationSuppliedValues";
import { previewTemplateCharge, writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { createChildcareCorrection, postChildcareCharge } from "@/lib/financials/childcareChargeService";
import type { RequirementScope } from "@/lib/lifecycle/requirementTimingTypes";

/** One child currently enrolling, and the agreement its charges hang from. */
export type EnrollingChild = {
    readonly customerMemberId: string;
    /**
     * `child_enrollment_agreements.id`. Null when the child has no agreement yet — a per-child fee
     * cannot be attributed without one, and attributing it to the household instead would quietly
     * turn two siblings' fees into one family fee.
     */
    readonly agreementId: string | null;
};

export type ResolveEnrollmentFeeInput = {
    readonly orgId: string;
    readonly requirementId: string;
    readonly chargeTemplateKey: string;
    /** `record` = one obligation for the family. `each_child` = one per enrolling child. */
    readonly scope: RequirementScope;
    readonly customerId: string;
    readonly enrollingChildren: readonly EnrollingChild[];
    /** ISO date the requirement became due. STABLE across replays — see the header. */
    readonly dueOn: string;
    readonly actorUserId?: string | null;
    /** False leaves every charge in draft. Drafts owe nothing, so nothing becomes collectible. */
    readonly post?: boolean;
};

export type FeeObligationOutcome =
    | {
          readonly status: "created" | "recalculated" | "unchanged" | "skipped_posted";
          readonly chargeId: string;
          readonly resolutionKey: string;
          readonly subjectCustomerMemberId: string | null;
          readonly billableSource: { readonly type: "enrollment_agreement" | "customer"; readonly id: string };
          readonly posted: boolean;
      }
    | {
          readonly status: "not_writable";
          readonly reason: string;
          readonly subjectCustomerMemberId: string | null;
      };

export type ResolveEnrollmentFeeResult = {
    /** False when no active template carries this key — a configuration problem, not a money one. */
    readonly templateResolved: boolean;
    /** True when the definition resolves to no money, so Financials correctly writes nothing. */
    readonly resolvesToZero: boolean;
    readonly outcomes: readonly FeeObligationOutcome[];
};

/** The billable sources one requirement produces, which is the whole of the grain decision. */
export function billableSourcesForScope(input: {
    readonly scope: RequirementScope;
    readonly customerId: string;
    readonly enrollingChildren: readonly EnrollingChild[];
}): readonly {
    source: { type: "enrollment_agreement" | "customer"; id: string };
    subjectCustomerMemberId: string | null;
}[] {
    if (input.scope === "each_child") {
        /*
         * A child with no agreement is SKIPPED, not folded into the household.
         *
         * The alternative — charging the family instead — loses the attribution that per-child grain
         * exists for, and does it silently. Skipping leaves the requirement unsatisfied, which is
         * visible and fixable; a mis-attributed charge is neither.
         */
        return input.enrollingChildren
            .filter((c) => Boolean(c.agreementId))
            .map((c) => ({
                source: { type: "enrollment_agreement" as const, id: c.agreementId as string },
                subjectCustomerMemberId: c.customerMemberId,
            }));
    }
    return [{ source: { type: "customer" as const, id: input.customerId }, subjectCustomerMemberId: null }];
}

/**
 * Create (or reuse) exactly the obligations this fee requirement intends. Idempotent.
 */
export async function resolveEnrollmentFeeObligations(
    supabase: SupabaseClient,
    input: ResolveEnrollmentFeeInput,
): Promise<ResolveEnrollmentFeeResult> {
    const templates = await listChargeTemplates(supabase, input.orgId);
    const template = currentTemplateFor(
        templates as unknown as Parameters<typeof currentTemplateFor>[0],
        input.chargeTemplateKey,
    );
    if (!template) return { templateResolved: false, resolvesToZero: false, outcomes: [] };

    const templateId = (template as unknown as { id: string }).id;
    const sources = billableSourcesForScope(input);
    const outcomes: FeeObligationOutcome[] = [];
    let resolvesToZero = false;

    for (const { source, subjectCustomerMemberId } of sources) {
        const args = {
            templateId,
            billableSource: source,
            agreementId: source.type === "enrollment_agreement" ? source.id : null,
            eventDate: input.dueOn,
            today: input.dueOn,
        };

        /*
         * PREVIEW FIRST, so "resolves to zero" can be told from "could not be written".
         *
         * Financials refuses to draft a zero-amount charge, and rightly — but the refusal it returns
         * is `amount_not_resolvable`, which reads identically to a template that is broken. A family
         * owing nothing and a family whose fee cannot be priced are opposite situations, and only
         * the intent's own amount separates them.
         */
        const preview = await previewTemplateCharge(supabase, input.orgId, args);
        if (preview.intent.eligible && preview.intent.amountCents === 0) {
            resolvesToZero = true;
            continue;
        }

        const written = await writeTemplateDraftCharge(supabase, input.orgId, {
            ...args,
            actorUserId: input.actorUserId ?? null,
        });
        if (written.status === "not_writable") {
            outcomes.push({ status: "not_writable", reason: written.reason, subjectCustomerMemberId });
            continue;
        }

        /*
         * POSTING IS WHAT MAKES IT COLLECTIBLE.
         *
         * "A draft charge owes nothing yet" is Financials' rule, and the collectible resolver honours
         * it — so a fee left in draft would show a family $0 due forever. Posting is idempotent on
         * the Financials side, which is what lets this run on every replay without a second thought.
         */
        let posted = written.status === "skipped_posted";
        if (input.post !== false && !posted) {
            await postChildcareCharge(supabase, {
                orgId: input.orgId,
                chargeId: written.chargeId,
                actorUserId: input.actorUserId ?? null,
            });
            posted = true;
        }

        outcomes.push({
            status: written.status,
            chargeId: written.chargeId,
            resolutionKey: written.resolutionKey,
            subjectCustomerMemberId,
            billableSource: source,
            posted,
        });
    }

    return { templateResolved: true, resolvesToZero, outcomes };
}

/**
 * A CHILD WITHDRAWS AFTER THE FEE WAS POSTED.
 *
 * Financial history is not deleted and a posted charge is never mutated. Financials already owns the
 * only correct answer — `createChildcareCorrection` writes a NEW row referencing the original
 * through `source_charge_id`, and the database itself enforces that a charge is corrected once (an
 * unbounded correction invents money: reversing a charge twice leaves a family owed an amount they
 * were never charged).
 *
 * So this is a DELEGATION, deliberately thin, and it exists to make the wrong thing harder to
 * write. The tempting Enrollment-side shape is a compensating negative charge of its own, which
 * would be a second correction model that the lineage trigger does not know about and that no
 * financial report would reconcile.
 *
 * Note what withdrawal does NOT need: nothing has to un-resolve the requirement. Once the reversal
 * posts, `resolveFamilyCollectible` reports the corrected position, and the projection converges on
 * its own — because it quotes Financials rather than remembering a balance.
 */
export async function reverseEnrollmentFeeObligation(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly chargeId: string; readonly actorUserId?: string | null },
) {
    return createChildcareCorrection(supabase, {
        orgId: input.orgId,
        sourceChargeId: input.chargeId,
        kind: "reversal",
        actorUserId: input.actorUserId ?? null,
    });
}
