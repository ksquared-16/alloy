/**
 * Turning an operator's decision about a legacy capacity value into a canonical
 * capacity rule — through the EXISTING authoring authority, not beside it.
 *
 * The body this builds goes to `POST /api/admin/operational-config/capacity-rules`
 * with `action: "create"`, the same endpoint the Operational Rules panel posts to.
 * So scope validation, the capacity-kind CHECK, effective-date handling and the
 * licensed-capacity-not-weakened invariant all apply identically, and a rule made
 * here resolves exactly like one authored there. Nothing forks.
 */

import {
    ADOPTION_PROVENANCE_KEY,
    type CapacityKindName,
    type LegacyCapacityAdoptionProvenance,
} from "@/lib/locations/capacityAdoptionState";

export type LegacyCapacityAdoptionInput = {
    roomLocationId: string;
    /** The legacy number the operator was shown when they decided. */
    legacyValue: string;
    /** The meaning the OPERATOR chose. Never inferred. */
    capacityKind: CapacityKindName;
    /** YYYY-MM-DD. The classification is being made now; see below. */
    effectiveStart: string;
    /** Whether the legacy value stays in place for compatibility. */
    retainLegacy: boolean;
    adoptedAt: string;
};

/** The parsed capacity, or null when the legacy value is not a usable integer. */
export function adoptableCapacity(legacyValue: string): number | null {
    const trimmed = legacyValue.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * The create body for one adopted rule.
 *
 * EFFECTIVE START is the adoption date, not the room's creation date.
 *
 * Backdating would assert that this capacity KIND was true for the whole history
 * of a value that never had a kind — and forecasting and historical calculations
 * read effective-dated rules, so a backdated rule silently rewrites what past
 * periods are computed to have meant. The operator is classifying the value now,
 * so now is when the canonical claim starts. Operational Rules already defaults
 * its authoring to the working date, so this matches the surface operators
 * already know; an explicit earlier date remains available there, deliberately
 * not here, because this flow has no way to know how far back the kind held.
 */
export function buildLegacyCapacityAdoptionBody(
    input: LegacyCapacityAdoptionInput
): Record<string, unknown> | null {
    const capacity = adoptableCapacity(input.legacyValue);
    if (capacity == null) return null;
    if (!input.roomLocationId || !input.effectiveStart) return null;

    const provenance: LegacyCapacityAdoptionProvenance = {
        source: "locations.metadata.capacity",
        source_location_id: input.roomLocationId,
        legacy_value: input.legacyValue.trim(),
        legacy_retained: input.retainLegacy,
        adopted_at: input.adoptedAt,
    };

    return {
        action: "create",
        scope_type: "room",
        room_location_id: input.roomLocationId,
        capacity_kind: input.capacityKind,
        capacity,
        effective_start: input.effectiveStart,
        // The authoring service stamps source_key itself and does not accept an
        // override, so provenance rides in the rule's own metadata — which it
        // does accept, and which travels with the row for audit.
        metadata: { [ADOPTION_PROVENANCE_KEY]: provenance },
    };
}

/**
 * What the operator will be shown before anything is written.
 *
 * Every consequence of the decision, in their words, so a confirmation is a
 * choice rather than a surprise.
 */
export type AdoptionPreview = {
    roomLabel: string;
    currentValue: string;
    currentQualifier: string;
    chosenKindLabel: string;
    resultLine: string;
    effectiveLine: string;
    legacyLine: string;
};

export function buildAdoptionPreview(args: {
    roomLabel: string;
    legacyValue: string;
    capacityKind: CapacityKindName;
    kindLabel: string;
    effectiveStart: string;
    retainLegacy: boolean;
}): AdoptionPreview {
    const capacity = adoptableCapacity(args.legacyValue);
    return {
        roomLabel: args.roomLabel,
        currentValue: `${args.legacyValue} seats`,
        currentQualifier: "unconfirmed",
        chosenKindLabel: args.kindLabel,
        resultLine:
            capacity == null
                ? "This value is not a whole number of seats and cannot be confirmed."
                : `${args.kindLabel} capacity rule: ${capacity} seats`,
        effectiveLine: `Effective from ${args.effectiveStart}`,
        legacyLine: args.retainLegacy
            ? "Kept for now, so existing reports do not change until every room is confirmed."
            : "Marked as reviewed and no longer used.",
    };
}

/**
 * The metadata patch for a DISCARD.
 *
 * Discard is the one outcome no canonical rule can express, so it is recorded on
 * the room as an explicit review marker. The number itself is left in place:
 * deleting it would destroy the only evidence of what the operator was looking
 * at, and this is reversible where a delete is not. A sentinel capacity value was
 * rejected outright — an in-band magic number is exactly the kind of ambiguity
 * this whole convergence exists to remove.
 */
export function buildLegacyCapacityDiscardMetadata(
    existing: unknown,
    reviewKey: string,
    discardedValue: string
): Record<string, unknown> {
    const base =
        existing != null && typeof existing === "object" && !Array.isArray(existing)
            ? { ...(existing as Record<string, unknown>) }
            : {};
    base[reviewKey] = discardedValue;
    return base;
}
