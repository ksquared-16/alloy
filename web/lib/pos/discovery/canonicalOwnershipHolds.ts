/**
 * Concepts whose canonical owner is settled — and is not Enrollment.
 *
 * The Health & Safety ownership contract answered several questions this packet raises. Each answer
 * named an owner OUTSIDE Enrollment, and none of those owners has shipped yet. That gap is the
 * dangerous moment: the operator sees a real question with no destination, the review offers "create
 * a new field", and one click later Enrollment owns a second allergy list that the Health foundation
 * will have to reconcile against forever.
 *
 * A hold makes the gap a STATE instead of a blank. The proposal still appears — the operator must see
 * that the packet asks this — but the only thing it can be accepted into is a wait. The refusal is
 * structural: a held concept never carries a `proposed_field`, so there is nothing for a downstream
 * apply to create even if a caller ignores the disposition.
 *
 * A hold is NOT a refusal to bind. If a canonical destination already exists — as it does for a
 * child-grain allergy NOTE after M1 — the concept binds to it and never reaches here. Reuse is never
 * a competing destination; only creation is.
 *
 * Pure + deterministic. No I/O.
 */

import type { BusinessConceptCandidate } from "./contracts";

/**
 * What is unresolved, stated so the operator and the next sprint read the same thing.
 *
 * `NEEDS_CANONICAL_SAFEGUARDING_OWNER` was shaped differently from the others: the rest wait for a
 * NAMED owner to build something, and safeguarding had no owner at all. **Slice 6 gave it one**
 * (`child_safeguarding_restrictions`), so no rule below can produce that state any more and a
 * safeguarding question now binds like any other proposal. The name is kept so the retired state
 * stays readable in the certification record — and `canonicalOwnershipHolds.test.ts` asserts nothing
 * emits it, which is what makes the retirement a fact rather than a claim.
 */
export type OwnershipHoldState =
    | "AWAITING_HEALTH_FOUNDATION"
    | "AWAITING_REQUIREMENT_EXCEPTION_MODEL"
    | "AWAITING_CANONICAL_CONSENT_OWNER"
    | "NEEDS_CANONICAL_SAFEGUARDING_OWNER";

export interface OwnershipHold {
    state: OwnershipHoldState;
    /** The canonical owner, or null when no owner exists yet — the two are not the same situation. */
    owner: string | null;
    /** The Director decision that settled it, so a reader can check the reasoning rather than trust this. */
    decision: string;
    /** Operator language. Never ontology jargon — this is read by someone configuring a school. */
    explanation: string;
}

interface HoldRule extends OwnershipHold {
    /** Matched against the concept's label and key. Narrow on purpose — see the negative controls. */
    test: RegExp;
    /** A concept matching this is NOT held, even if `test` matched. */
    except?: RegExp;
}

/**
 * Order matters: the exemption and authorization rules are checked BEFORE the health-kind rule,
 * because "immunization exemption" contains "immunization" and is not a Health fact at all.
 */
const HOLDS: readonly HoldRule[] = [
    {
        state: "AWAITING_REQUIREMENT_EXCEPTION_MODEL",
        owner: "Business Process — requirement exceptions",
        decision: "D-H2",
        test: /\b(exempt|exemption|exempted|non-?medical exemption|medical exemption)\b/i,
        explanation:
            "An exemption is not a health fact — it is permission to skip a requirement, and it needs the evidence that justifies it. Business Process owns requirement exceptions. Collected on this form now; it becomes a real exception once that exists.",
    },
    {
        state: "AWAITING_CANONICAL_CONSENT_OWNER",
        owner: "Consent",
        decision: "D-H3",
        test: /\b(authoriz|authoris|consent|permission)\w*\b[\s\S]{0,60}\b(emergency|medical|treatment|care)\b|\b(emergency|medical)\b[\s\S]{0,60}\b(authoriz|authoris|consent|permission)\w*/i,
        explanation:
            "Emergency medical authorization is a consent record — who granted it, when, and under what terms. A signature on this form is evidence that it was granted, not the grant itself. Consent owns it.",
    },
    {
        state: "AWAITING_HEALTH_FOUNDATION",
        owner: "Health & Safety",
        decision: "D-H5",
        test: /\b(allerg\w*|immuniz\w*|immunis\w*|vaccin\w*|medication\w*|medicine|prescription|diagnos\w*|(?:chronic|medical|health|existing) conditions?)\b/i,
        // A dietary restriction, a doctor's identity, and a physical/assessment DOCUMENT are not
        // health-lifecycle records — they have their own destinations and must keep them.
        except: /\b(diet|dietary|physician|doctor|dentist|clinic|provider name|insurance)\b/i,
        explanation:
            "Allergies, conditions, medications and immunizations are becoming one governed health record with its own history and review dates. Enrollment must not create a second list that would then disagree with it.",
    },
];

/**
 * A numbered DOSE series is an administration record, whatever the substance is called.
 *
 * The eight vaccine rows on the Oregon CIS are labelled `Hib`, `Tdap`, `Hep A` — none of which
 * contains a word any general rule could match, and tabling vaccine names would be exactly the
 * school-specific lookup this program has refused since Slice 1. The structure says it instead:
 * five numbered doses of one substance, with dates. That shape is an immunization/medication
 * administration history in any document, in any language — `dosis` is the Spanish column on this
 * very form.
 */
const DOSE_MEMBER = /\b(dose|dosis)\s*\d/i;

function isDoseSeries(memberLabels: readonly string[] | undefined): boolean {
    if (!memberLabels || memberLabels.length < 2) return false;
    return memberLabels.filter((l) => DOSE_MEMBER.test(l)).length >= 2;
}

/**
 * Does a NEW durable field or collection for this concept compete with a settled owner?
 *
 * Called where a new destination would otherwise be proposed. A concept that matched a canonical
 * destination confidently has already bound and never arrives here.
 */
export function ownershipHoldFor(
    concept: Pick<BusinessConceptCandidate, "label" | "concept_key"> & { repetition?: { member_labels?: readonly string[] } },
): OwnershipHold | null {
    if (isDoseSeries(concept.repetition?.member_labels)) {
        const health = HOLDS.find((h) => h.state === "AWAITING_HEALTH_FOUNDATION")!;
        const { state, owner, decision, explanation } = health;
        return { state, owner, decision, explanation };
    }
    const text = `${concept.label} ${(concept.concept_key ?? "").replace(/[._]/g, " ")}`;
    for (const rule of HOLDS) {
        if (!rule.test.test(text)) continue;
        if (rule.except?.test(text)) continue;
        const { state, owner, decision, explanation } = rule;
        return { state, owner, decision, explanation };
    }
    return null;
}

/** Every state a packet can be held in, for the certification denominator. */
export const OWNERSHIP_HOLD_STATES: readonly OwnershipHoldState[] = HOLDS.map((h) => h.state);
