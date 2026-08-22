/**
 * Health & Safety card evidence — "What health and safety information matters for this child,
 * and what is incomplete or requires attention?"
 *
 * OWNS NO MEDICAL TRUTH. A configured projection over four owners:
 *   1. durable child field values  — `field_values` on `entity_type='customer_member'`
 *                                    (`allergies`, `medical_notes`, `special_instructions`,
 *                                     plus anything the org defines)
 *   2. documents                   — `documents` rows of configured health doc types
 *   3. stage requirements          — `requirements_v1` on the governing revision's stage
 *   4. emergency contacts          — `person_child_relationships` + roles
 *
 * ── SEVERITY IS CONFIGURED, NEVER INFERRED ──
 *
 * `customer_member:allergies` is FREE TEXT. The platform cannot know that "Peanuts" is severe
 * and "Dairy" is not, and keyword-matching to decide would be inventing a clinical judgement on
 * a safety surface. Prominence is therefore a property of the FIELD (`field_definitions.config`),
 * declared by the org — not a property of the value.
 *
 * ── ABSENCE IS NOT A NEGATIVE ──
 *
 * An empty allergies field renders as unset or is omitted. It must NEVER render as
 * "No known allergies": that is a clinical claim the platform has no basis for.
 *
 * ── UNRESOLVED IS NOT MISSING ──
 *
 * Inherited verbatim from `buildBillingPreviewCardEvidence`: an unresolved requirement is never
 * counted as missing and never produces a blocked verdict. Here that rule is a SAFETY rule —
 * "2 need attention" manufactured from unloaded plumbing is worse on this card than any other.
 *
 * @see docs/platform/operator/operational-card-system-expansion.md §4
 */

import {
    type CardLabEvidenceBase,
    type CardLabHandoff,
    trimOrNull,
} from "@/lib/cardLab/cardLabTypes";

export type HealthFactRow = {
    /** Config field key on the `customer_member` entity, e.g. "allergies". */
    fieldKey: string;
    /** Configured label — the tenant's word, never a platform string. */
    label: string;
    value: string | null;
    /** From `field_definitions.config`. Configured prominence; never derived from the value. */
    safetyCritical: boolean;
};

export type HealthDocumentRow = {
    /** Configured document type key. */
    docTypeKey: string;
    label: string;
    /** True when a document of this type exists for the child. */
    onFile: boolean;
    /**
     * GAP-1. Documents carry NO expiration column anywhere in the schema, so this is null in
     * every production path. Typed so the contract is complete when the model lands.
     */
    expiresAt: string | null;
};

export type HealthRequirementRow = {
    key: string;
    label: string;
    /** Has an authoritative source answered? Unresolved never counts as missing. */
    resolved: boolean;
    /** Meaningful only when `resolved`. */
    met: boolean;
    detail: string | null;
    /** The card that OWNS resolving this. Health & Safety references; it never resolves. */
    ownerCard: CardLabHandoff;
};

export type HealthSafetyCardEvidence = CardLabEvidenceBase & {
    criticalFacts: HealthFactRow[];
    healthFacts: HealthFactRow[];
    documents: HealthDocumentRow[];
    requirements: HealthRequirementRow[];
    emergencyContactCount: number;
    hasEmergencyContact: boolean;
    /** Resolved-and-unmet requirements ONLY. Never includes unresolved items. */
    attentionCount: number;
    unresolvedCount: number;
};

export type HealthSafetyEvidenceInput = {
    /**
     * The configured health field set for this org, in configured order, each already resolved
     * to a value (or null). `null` for the whole array = the projection has not loaded.
     */
    fields: readonly HealthFactRow[] | null;
    documents?: readonly HealthDocumentRow[];
    requirements?: readonly HealthRequirementRow[];
    emergencyContactCount?: number;
};

export function buildHealthSafetyCardEvidence(
    input: HealthSafetyEvidenceInput,
): HealthSafetyCardEvidence {
    // UNRESOLVED — the field projection has not answered. Hold everything.
    if (input.fields == null) {
        return {
            criticalFacts: [],
            healthFacts: [],
            documents: [],
            requirements: [],
            emergencyContactCount: 0,
            hasEmergencyContact: false,
            attentionCount: 0,
            unresolvedCount: 0,
            answerLine: "",
            supportingLine: null,
            statusChip: null,
            statusTone: "neutral",
            resolution: "unresolved",
        };
    }

    // A field with no value is NOT a negative answer. It is simply not shown.
    const withValue = input.fields.filter((f) => trimOrNull(f.value) != null);
    const criticalFacts = withValue.filter((f) => f.safetyCritical);
    const healthFacts = withValue.filter((f) => !f.safetyCritical);

    const documents = [...(input.documents ?? [])];
    const requirements = [...(input.requirements ?? [])];
    const emergencyContactCount = input.emergencyContactCount ?? 0;

    // Only a RESOLVED requirement can be unmet. Unresolved items are held, never counted.
    const attentionCount = requirements.filter((r) => r.resolved && !r.met).length;
    const unresolvedCount = requirements.filter((r) => !r.resolved).length;

    let answerLine: string;
    let supportingLine: string | null;
    let statusChip: string | null;
    let statusTone: HealthSafetyCardEvidence["statusTone"];

    if (criticalFacts.length > 0) {
        // Safety-critical information leads, always — regardless of requirement state.
        answerLine = criticalFacts[0]!.value ?? criticalFacts[0]!.label;
        supportingLine =
            criticalFacts.length > 1
                ? `+${criticalFacts.length - 1} more safety-critical`
                : attentionCount > 0
                  ? `${attentionCount} requirement${attentionCount === 1 ? " needs" : "s need"} attention`
                  : null;
        statusChip = attentionCount > 0 ? `Needs attention · ${attentionCount}` : "Important";
        statusTone = attentionCount > 0 ? "blocked" : "at-risk";
    } else if (attentionCount > 0) {
        answerLine = `${attentionCount} item${attentionCount === 1 ? " needs" : "s need"} attention`;
        supportingLine = requirements.find((r) => r.resolved && !r.met)?.label ?? null;
        statusChip = `Needs attention · ${attentionCount}`;
        statusTone = "blocked";
    } else if (withValue.length > 0 || documents.some((d) => d.onFile)) {
        answerLine = "No health concerns flagged";
        supportingLine =
            unresolvedCount > 0
                ? null
                : `${withValue.length} health fact${withValue.length === 1 ? "" : "s"} on file`;
        statusChip = unresolvedCount > 0 ? null : "Complete";
        statusTone = unresolvedCount > 0 ? "neutral" : "ready";
    } else {
        // Resolved and genuinely nothing recorded. Stated as an ABSENCE OF RECORDS,
        // never as a clinical negative.
        answerLine = "No health information recorded";
        supportingLine = "Nothing has been collected for this child yet";
        statusChip = null;
        statusTone = "neutral";
    }

    const isEmpty =
        withValue.length === 0
        && requirements.length === 0
        && documents.length === 0
        && emergencyContactCount === 0;

    return {
        criticalFacts,
        healthFacts,
        documents,
        requirements,
        emergencyContactCount,
        hasEmergencyContact: emergencyContactCount > 0,
        attentionCount,
        unresolvedCount,
        answerLine,
        supportingLine,
        statusChip,
        statusTone,
        resolution: isEmpty ? "empty" : "settled",
    };
}
