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
import { previewTemplateCharge, writeTemplateDraftCharge } from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { createChildcareCorrection, postChildcareCharge } from "@/lib/financials/childcareChargeService";
import type { RequirementScope } from "@/lib/lifecycle/requirementTimingTypes";

/**
 * THE CURRENT TEMPLATE FOR A STABLE KEY.
 *
 * A charge template is effective-dated and versioned, so one `template_key` names a LINEAGE rather
 * than a row: "the registration fee" is whichever active version starts latest. The requirement
 * references the key precisely so it survives a re-version, which means somebody has to pick the
 * version, and it is the caller that named the key.
 *
 * Owned here rather than imported because Financials exposes no public helper for it — only
 * `listChargeTemplates`. Kept exported so the rule is testable on its own.
 */
export function currentTemplateForKey<
    T extends { template_key?: string | null; is_active?: boolean | null; effective_start?: string | null; effective_end?: string | null },
>(templates: readonly T[], templateKey: string, asOf?: string | null): T | null {
    /*
     * AS OF THE DAY THE FEE FELL DUE, when that day is known. A fee owed on 1 September is the
     * version in effect on 1 September — not whichever version was authored last, which would let a
     * price change dated next January reach back and re-price a fee already owed.
     */
    const day = typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}/.test(asOf) ? asOf.slice(0, 10) : null;
    const lineage = templates
        .filter((t) => t.template_key === templateKey && t.is_active !== false)
        .filter((t) => {
            if (!day) return true;
            const start = String(t.effective_start ?? "").slice(0, 10);
            const end = String(t.effective_end ?? "").slice(0, 10);
            return (!start || start <= day) && (!end || end >= day);
        })
        .sort((a, b) => String(b.effective_start ?? "").localeCompare(String(a.effective_start ?? "")));
    return lineage[0] ?? null;
}

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

/**
 * Has Financials retired this obligation with a correction?
 *
 * The predicate is `childcareChargeService`'s own, quoted rather than re-derived: a non-void charge
 * whose `source_charge_id` is this one and whose `correction_kind` is a reversal. Asking Financials
 * what it recorded is not the same as Enrollment deciding what money is worth.
 */
export async function findReversalChargeId(
    supabase: SupabaseClient,
    args: { readonly orgId: string; readonly chargeId: string },
): Promise<string | null> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, status, metadata")
        .eq("org_id", args.orgId)
        .eq("source_charge_id", args.chargeId);
    if (error) return null;
    const rows = (data ?? []) as { id: string; status: string; metadata: Record<string, unknown> | null }[];
    const reversal = rows.find(
        (r) => r.status !== "void" && (r.metadata ?? {}).correction_kind === "reversal",
    );
    return reversal?.id ?? null;
}

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
    /** The child's agreement, when it has one — only to recognise a fee an earlier path wrote there. */
    legacyAgreementId: string | null;
}[] {
    if (input.scope === "each_child") {
        /*
         * ONE OBLIGATION PER ENROLLING CHILD, AGREEMENT OR NOT (Director decision, H3-2).
         *
         * A registration fee is owed when the child's paperwork is done, which is before any tuition
         * agreement need exist. Skipping a child without an agreement left the fee unbillable; folding
         * it into a plain household charge merged two siblings due the same day into one. The
         * household is the billable source — Financials' own answer for a pre-enrolment charge — and
         * the child is the charge's SUBJECT, which keeps one obligation per child, attributable and
         * correctable per child, with the household as payer.
         */
        return input.enrollingChildren.map((c) => ({
            source: { type: "customer" as const, id: input.customerId },
            subjectCustomerMemberId: c.customerMemberId,
            legacyAgreementId: c.agreementId,
        }));
    }
    return [{ source: { type: "customer" as const, id: input.customerId }, subjectCustomerMemberId: null, legacyAgreementId: null }];
}

/**
 * A per-child fee an earlier path already charged against the child's AGREEMENT.
 *
 * Before H3-2 the only per-child writer was keyed to the agreement. Such a fee is the same
 * obligation, so it is recognised rather than charged a second time against the household.
 */
export async function findAgreementFeeChargeId(
    supabase: SupabaseClient,
    args: { readonly orgId: string; readonly agreementId: string; readonly chargeTemplateKey: string },
): Promise<{ id: string; posted: boolean } | null> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, status")
        .eq("org_id", args.orgId)
        .eq("billable_source_type", "enrollment_agreement")
        .eq("billable_source_id", args.agreementId)
        .eq("metadata->>charge_template_key", args.chargeTemplateKey);
    if (error) throw new Error(`enrollment fee charges could not be read (${error.message.trim()})`);
    const row = ((data ?? []) as { id: string; status: string | null }[]).find((r) => r.status !== "void");
    return row ? { id: row.id, posted: row.status === "posted" } : null;
}

/**
 * THIS CHILD'S FEE FOR THIS EPISODE, whatever key it was written under.
 *
 * The idempotency key carries the charge's occurs-on day, and that day is resolved by Financials
 * (template strategy, billing calendar). A change to that configuration between the completion and a
 * replay would yield a different key — and a second fee. So before writing, a live (non-void) charge
 * for this household, this child and this template dated ON OR AFTER the episode's due day is the
 * same obligation. Last year's fee is dated before this episode's due day and never blocks it. A
 * reversed fee is still found: a correction is Financials' answer, and Enrollment never re-bills it.
 */
export async function findEpisodeFeeChargeId(
    supabase: SupabaseClient,
    args: {
        readonly orgId: string;
        readonly customerId: string;
        readonly subjectCustomerMemberId: string;
        readonly chargeTemplateKey: string;
        readonly dueOn: string;
    },
): Promise<{ id: string; posted: boolean; resolutionKey: string } | null> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, status, occurs_on, metadata")
        .eq("org_id", args.orgId)
        .eq("billable_source_type", "customer")
        .eq("billable_source_id", args.customerId)
        .eq("metadata->>charge_template_key", args.chargeTemplateKey)
        .eq("metadata->>subject_customer_member_id", args.subjectCustomerMemberId)
        .gte("occurs_on", args.dueOn.slice(0, 10));
    if (error) throw new Error(`enrollment fee charges could not be read (${error.message.trim()})`);
    const row = ((data ?? []) as { id: string; status: string | null; metadata: Record<string, unknown> | null }[]).find(
        (r) => r.status !== "void",
    );
    if (!row) return null;
    const key = (row.metadata ?? {}).resolution_key;
    return { id: row.id, posted: row.status === "posted", resolutionKey: typeof key === "string" ? key : "" };
}

/**
 * Create (or reuse) exactly the obligations this fee requirement intends. Idempotent.
 */
export async function resolveEnrollmentFeeObligations(
    supabase: SupabaseClient,
    input: ResolveEnrollmentFeeInput,
): Promise<ResolveEnrollmentFeeResult> {
    const templates = await listChargeTemplates(supabase, input.orgId);
    const template = currentTemplateForKey(templates, input.chargeTemplateKey, input.dueOn);
    if (!template) return { templateResolved: false, resolvesToZero: false, outcomes: [] };

    const templateId = (template as unknown as { id: string }).id;
    const sources = billableSourcesForScope(input);
    const outcomes: FeeObligationOutcome[] = [];
    let resolvesToZero = false;

    for (const { source, subjectCustomerMemberId, legacyAgreementId } of sources) {
        if (legacyAgreementId) {
            const prior = await findAgreementFeeChargeId(supabase, {
                orgId: input.orgId,
                agreementId: legacyAgreementId,
                chargeTemplateKey: input.chargeTemplateKey,
            });
            if (prior) {
                outcomes.push({
                    status: "unchanged",
                    chargeId: prior.id,
                    resolutionKey: "",
                    subjectCustomerMemberId,
                    billableSource: { type: "enrollment_agreement", id: legacyAgreementId },
                    posted: prior.posted,
                });
                continue;
            }
        }
        if (source.type === "customer" && subjectCustomerMemberId) {
            const sameEpisode = await findEpisodeFeeChargeId(supabase, {
                orgId: input.orgId,
                customerId: source.id,
                subjectCustomerMemberId,
                chargeTemplateKey: input.chargeTemplateKey,
                dueOn: input.dueOn,
            });
            if (sameEpisode) {
                outcomes.push({
                    status: "unchanged",
                    chargeId: sameEpisode.id,
                    resolutionKey: sameEpisode.resolutionKey,
                    subjectCustomerMemberId,
                    billableSource: source,
                    posted: sameEpisode.posted,
                });
                continue;
            }
        }
        const args = {
            templateId,
            billableSource: source,
            agreementId: source.type === "enrollment_agreement" ? source.id : null,
            subjectCustomerMemberId,
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

/**
 * A financial requirement must name a charge template this organisation has.
 *
 * Authored without this check, a mistyped or retired key saved cleanly and surfaced only at runtime,
 * when a family's fee could not be resolved — after the paperwork was done. The key is checked when it
 * is authored, against active templates; the amount and its effective dates stay Financials'.
 */
export function financialRequirementRefusals(
    requirements: readonly { requirement_id: string; ref: { kind: string; charge_template_key?: string } }[],
    templates: readonly { template_key?: string | null; is_active?: boolean | null }[],
): { requirement_id: string; charge_template_key: string; detail: string }[] {
    const known = new Set(templates.filter((t) => t.is_active !== false).map((t) => (t.template_key ?? "").trim()).filter(Boolean));
    const out: { requirement_id: string; charge_template_key: string; detail: string }[] = [];
    for (const r of requirements) {
        if (r.ref.kind !== "financial") continue;
        const key = (r.ref.charge_template_key ?? "").trim();
        if (key && known.has(key)) continue;
        out.push({
            requirement_id: r.requirement_id,
            charge_template_key: key,
            detail: key
                ? `No active charge template "${key}" exists in Financials for this organization.`
                : "A financial requirement needs a charge template.",
        });
    }
    return out;
}
