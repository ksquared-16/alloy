/**
 * WHAT IS THIS ASSIGNMENT FOR — read from the space, not asked up front.
 *
 * Add Assignment used to open a category picker ("What category of assignment is this?") before
 * the card. The space already says what it may be used for (`locations.metadata.space_uses`, V7 S1),
 * and `spaceEligibleForUse` is the one rule for whether a use fits a space. So the card asks for the
 * room and derives the use from it:
 *
 *   - exactly one eligible use → it is the use (shown, not asked);
 *   - several                  → the operator chooses among THOSE, in the card — never the first;
 *   - none                     → the space's own refusal says why.
 *
 * Eligibility is `spaceEligibleForUse` per category, unchanged — including COMPAT-1: a classroom
 * whose uses were never configured keeps legacy eligibility for every category, which here means
 * every category is a candidate and the operator chooses (or the single one resolves).
 *
 * Nothing here reads a room's NAME, and nothing reads `is_primary`: a use is a category the space
 * is configured for, and Homeroom follows from that category's own behavior downstream.
 *
 * Categories that use no space (`roomRequirement: "not_used"` — transport, some staff duties) can
 * never be read from a room; they are offered on their own, explicitly, by `usesNeedingNoSpace`.
 *
 * Pure and client-safe: no I/O.
 */

import { spaceEligibleForUse, type SpaceForUse, type SpaceUseRefusalCode } from "@/lib/location/spaceUse";
import type { AssignmentTypeBehavior } from "@/lib/operationalAssignments/assignmentTypeBehavior";

export type UseCandidate = { id: string; label: string; behavior?: AssignmentTypeBehavior };

export type AssignmentUseResolution =
    | { kind: "resolved"; useId: string; legacy: boolean }
    | { kind: "choose"; useIds: string[]; legacy: boolean }
    | { kind: "none"; code: SpaceUseRefusalCode | "no_use_for_space" | "no_categories"; message: string };

function usesSpace(c: UseCandidate): boolean {
    const req = c.behavior?.roomRequirement ?? (c.behavior?.requiresRoom ? "required" : "optional");
    return req !== "not_used";
}

/** The categories that are scheduled without a space — never derivable from a room. */
export function usesNeedingNoSpace<T extends UseCandidate>(candidates: readonly T[]): T[] {
    return candidates.filter((c) => !usesSpace(c));
}

/** The uses an assignment in this space may have, for this subject — and what to do about them. */
export function resolveUseForSpace(
    space: SpaceForUse,
    candidates: readonly UseCandidate[],
    subjectType: "child" | "staff",
): AssignmentUseResolution {
    const spaceUsing = candidates.filter(usesSpace);
    if (spaceUsing.length === 0) {
        return {
            kind: "none",
            code: "no_categories",
            message: "No Assignment Categories that use a space are configured for this organization.",
        };
    }
    const eligible = spaceUsing.filter((c) => spaceEligibleForUse(space, { categoryId: c.id, subjectType }).ok);
    const legacy = space.spaceUses == null;
    if (eligible.length === 1) return { kind: "resolved", useId: eligible[0].id, legacy };
    if (eligible.length > 1) return { kind: "choose", useIds: eligible.map((c) => c.id), legacy };
    // Nothing fits. Say why in the space's own words when the space itself refuses (physical, staff
    // outside a classroom, unreadable, unconfigured); otherwise its configured uses name none of these.
    const verdict = spaceEligibleForUse(space, { categoryId: spaceUsing[0].id, subjectType });
    if (!verdict.ok && verdict.code !== "use_not_configured_for_space") {
        return { kind: "none", code: verdict.code, message: verdict.message };
    }
    return {
        kind: "none",
        code: "no_use_for_space",
        message:
            subjectType === "staff"
                ? "This space is not configured for any staff use. Configure its Uses in Locations → Spaces."
                : "This space is not configured for any child use. Configure its Uses in Locations → Spaces.",
    };
}

/** Does this space take at least one of these uses? (The room picker's scope when the use is read from the room.) */
export function spaceTakesAnyUse(
    space: SpaceForUse,
    candidates: readonly UseCandidate[],
    subjectType: "child" | "staff",
): boolean {
    return resolveUseForSpace(space, candidates, subjectType).kind !== "none";
}
