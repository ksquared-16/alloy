/**
 * D-101 — which turns are eligible for provider interpretation (V1.1).
 *
 * ## The scope restriction, and why it is an allow-list
 *
 * **Participant text is NOT globally provider-eligible.** D-101 admits participant-authored text
 * only for a bounded set of ordinary conversational facts, and everything else stays on the
 * deterministic controls that already work.
 *
 * So eligibility is decided by the SEMANTIC DOMAIN of the current need, from an explicit allow-list.
 * The default is refusal: a need whose domain is not named here is not eligible, which means a new
 * field, a new binding or a tenant's custom control cannot become provider-eligible by accident. The
 * only way to widen this is to edit the allow-list deliberately.
 *
 * ## What is refused, and why refusal is not a limitation
 *
 * Government identifiers, signatures, consents, acknowledgments, legal attestations, health and
 * medical narrative, and artifact-specific legal responses are all refused for provider
 * interpretation. Two independent reasons, and either alone is sufficient:
 *
 *  - the platform cannot deterministically minimize the classes such text carries
 *    (`government_id`, `health_information` have no detector), so admitting it would claim a
 *    transformation that never ran;
 *  - these are exactly the responses whose meaning must not be inferred. A misread consent is not a
 *    smaller version of a correct one.
 *
 * Every refused path remains fully usable through the deterministic control. A participant is never
 * blocked — they are asked plainly rather than conversationally.
 *
 * Pure. No I/O.
 */

import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

/**
 * The semantic domains whose participant text may be interpreted by a provider.
 *
 * Bounded ordinary facts — the ones the V1 vertical already requires. Deliberately NOT a rule over
 * field names: `field_key.includes("dob")` would make a tenant's custom `dob_notes` free-text field
 * eligible without anyone deciding it should be.
 */
export const D101_ELIGIBLE_FIELD_KEYS: ReadonlySet<string> = new Set([
    // Child identity
    "customer_member:dob",
    "customer_member:first_name",
    "customer_member:last_name",
    "child:dob",
    "child:first_name",
    "child:last_name",
    /**
     * SHARED-ALIAS spellings of the same admitted child-identity facts.
     *
     * The D-100 confirmation policy learned this exact lesson first: a form binds either by
     * `entity_type` + `field_key` or by a `shared_value_key` alias, and `canonicalKeyFor` keys the
     * need by whichever it finds. Firefly's Enrollment form uses the aliases — so the live
     * governed path refused "Actually, it's August 21st." with `child_date_of_birth not on the
     * D-101 admitted list` while `child:dob` sat admitted above. Same domains, second spelling;
     * listed rather than normalized, for the same reason as D-100.
     */
    "child_date_of_birth",
    "child_first_name",
    "child_last_name",
    "child_full_name",
    "guardian_first_name",
    "guardian_last_name",
    "guardian_email",
    "guardian_phone",
    /**
     * The bounded ALLERGY FACT — admitted by Director direction in the AI-conversation mission,
     * whose required live proofs are the utterances "No allergies" and "Peanuts only" and whose
     * own example is "He has a peanut allergy but nothing else." This is the short factual answer
     * the enrollment form already collects, interpreted only against the allergy question the
     * deterministic runtime selected. Health and medical NARRATIVE remains refused as a class
     * (`health_information` below) — `customer_member:medical_notes` and its kin stay off this
     * list.
     */
    "customer_member:allergies",
    // Ordinary contact
    "person:first_name",
    "person:last_name",
    "person:email",
    "person:phone",
    // Ordinary address
    "customer:address_line1",
    "customer:city",
    "customer:postal_code",
    "household:address_line1",
    "household:city",
    "household:postal_code",
]);

/**
 * Domains explicitly refused, with the reason recorded.
 *
 * Kept as a named list even though the allow-list already excludes them, because a future edit that
 * wants to admit one has to delete a line that says why not — rather than quietly adding a key to
 * the allow-list above.
 */
export const D101_REFUSED_DOMAINS: Readonly<Record<string, string>> = Object.freeze({
    government_id:
        "Government identifiers have no deterministic minimizer, and a misread identifier is a data-integrity incident rather than a smaller answer.",
    signature:
        "A signature is a statement by one person on one document. It is recipient-scoped and artifact-specific, and interpreting it would forge intent.",
    consent:
        "Consent and acknowledgment are legally significant. Their meaning must not be inferred.",
    health_information:
        "Health and medical narrative has no deterministic minimizer in this platform.",
    artifact_legal_response:
        "A response whose meaning depends on the exact artifact and version cannot be generalized to a shared fact.",
});

export type TurnEligibility =
    | { readonly eligible: true; readonly field_key: string }
    | { readonly eligible: false; readonly reason: string };

/**
 * Is this turn eligible for provider interpretation?
 *
 * Every condition is a positive requirement, so the absence of any of them refuses.
 */
export function turnIsEligibleForProviderInterpretation(turn: ParticipantTurn): TurnEligibility {
    // 2. There must be a deterministic current need. Interpretation with nothing to interpret ABOUT
    //    is exactly how a model would end up choosing its own subject.
    const need: EnrollmentInformationNeed | null = turn.need;
    if (!need) {
        return { eligible: false, reason: "There is no current information need to interpret against." };
    }
    if (turn.kind !== "confirm_known_value" && turn.kind !== "collect_missing_value") {
        return { eligible: false, reason: `Turn kind "${turn.kind}" is not a conversational fact turn.` };
    }

    // Artifact-specific needs — every signature, every recipient-scoped control, every
    // collection-bound repeat — are refused structurally, by the identity layer rather than by this
    // list. They carry a null shared key and can never reach a shared fact.
    if (need.identity.artifact_specific || !need.identity.shared_value_key) {
        return {
            eligible: false,
            reason:
                "Artifact-specific occurrences (signatures, recipient-scoped controls, collection repeats) are never provider-interpreted.",
        };
    }

    const key = need.identity.canonical_key ?? "";
    if (!D101_ELIGIBLE_FIELD_KEYS.has(key)) {
        return {
            eligible: false,
            reason: `Semantic domain "${key || "(unbound)"}" is not on the D-101 admitted list. Deterministic controls remain available.`,
        };
    }

    return { eligible: true, field_key: key };
}
