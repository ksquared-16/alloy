/**
 * Ordinary capacity, as a director authors it on the object itself.
 *
 * A director opening Toddler 1 and typing `Capacity 10` is making one claim:
 * *this class holds ten children.* They are not choosing a capacity kind, a
 * scope, an effective date or a version. This module is the one place that
 * turns that claim into the canonical rule it actually is.
 *
 * WHICH KIND. The kind is derived from what the object IS, never asked:
 *
 *   Classroom       → `operational`   how many children this group takes
 *   Physical space  → `physical`      how many bodies the place holds
 *
 * `licensed` is deliberately unreachable from here. It is a regulatory ceiling
 * resolved as the MINIMUM across every applicable rule, and the author-time
 * guard REFUSES a licensed rule that would raise the ceiling — so a director
 * who typed 10 today and 12 next term would simply be told no, for reasons
 * about licensing law that nobody put in front of them. Licensed capacity stays
 * in Operational Rules, where the operator has chosen to meet that vocabulary.
 *
 * SAME-DAY CORRECTION. Versioning cannot express it: `planSupersede` requires a
 * new version to start strictly AFTER the prior one, and `voidScheduledRow`
 * refuses anything already in effect. Typing 10, saving, then fixing it to 12
 * a minute later is an ordinary thing to do, so it gets an ordinary answer —
 * retire today's rule and author a replacement from today. Both rows are then
 * effective today, and `resolveConfigRule`'s final tiebreak (latest
 * `created_at`) makes the replacement win deterministically. That is honest:
 * on this date we said 10, then we said 12, and the later claim governs.
 *
 * Pure functions only. No IO, no Supabase client, no UI dependency.
 */

import { compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import { chooseObjectEditTransition } from "@/lib/locations/objectEditLifecycle";
import { isRuleEffectiveOn } from "@/lib/childcareOperational/config/resolveConfigRule";
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";

/** The only two kinds an ordinary object-level edit may author. */
export type OrdinaryCapacityKind = "operational" | "physical";

/**
 * The kind an ordinary Capacity field writes for this object.
 *
 * A shared space folds to `physical`: the operator vocabulary no longer offers
 * "Shared space", so a stored one presents and behaves as a physical space.
 * Legacy units with no stored role read as a classroom, which is what every
 * room in the system meant before roles existed.
 */
export function ordinaryCapacityKindForRole(
    role: CanonicalUnitRole | null | undefined
): OrdinaryCapacityKind {
    return role === "physical_space" || role === "shared_space" ? "physical" : "operational";
}

/** Room-scoped, age-agnostic rules of one kind — the shape an object edit owns. */
function objectRulesOfKind(
    rules: readonly ChildcareCapacityRuleRow[],
    roomLocationId: string,
    kind: OrdinaryCapacityKind
): ChildcareCapacityRuleRow[] {
    return rules.filter(
        (r) =>
            r.scope_type === "room" &&
            r.room_location_id === roomLocationId &&
            r.capacity_kind === kind &&
            // An age-specific rule is a narrower claim than "this room holds N".
            // The object field neither reads nor writes one; Operational Rules owns it.
            (r.age_group_key ?? null) === null
    );
}

/**
 * The rule an ordinary edit is currently maintaining, if any.
 *
 * Ordered the way resolution orders: latest start wins, then latest authorship.
 * The same comparison the resolver's final tiebreak uses, so the value this
 * returns is the value the room actually resolves to.
 */
export function currentOrdinaryRule(
    rules: readonly ChildcareCapacityRuleRow[],
    roomLocationId: string,
    kind: OrdinaryCapacityKind,
    todayYmd: string
): ChildcareCapacityRuleRow | null {
    const effective = objectRulesOfKind(rules, roomLocationId, kind).filter((r) =>
        isRuleEffectiveOn(r, todayYmd)
    );
    if (effective.length === 0) return null;
    return [...effective].sort((a, b) => {
        const byStart = compareIsoDates(b.effective_start, a.effective_start);
        if (byStart !== 0) return byStart;
        return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    })[0];
}

/** What the object's Capacity field shows: the authored value, or null when unset. */
export function readOrdinaryCapacity(
    rules: readonly ChildcareCapacityRuleRow[],
    roomLocationId: string,
    role: CanonicalUnitRole | null | undefined,
    todayYmd: string
): number | null {
    const rule = currentOrdinaryRule(
        rules,
        roomLocationId,
        ordinaryCapacityKindForRole(role),
        todayYmd
    );
    return rule ? rule.capacity : null;
}

export type OrdinaryCapacityPlan =
    /** The field already says what the canonical rule says. */
    | { action: "noop" }
    /** No rule of this kind yet. */
    | { action: "create"; kind: OrdinaryCapacityKind; capacity: number; effectiveStart: string }
    /** A rule from an earlier day: close it yesterday, open the new one today. */
    | {
          action: "version";
          priorId: string;
          kind: OrdinaryCapacityKind;
          capacity: number;
          effectiveStart: string;
      }
    /** A rule authored earlier TODAY: retire it and author the replacement. */
    | {
          action: "replace_same_day";
          retireId: string;
          kind: OrdinaryCapacityKind;
          capacity: number;
          effectiveStart: string;
      }
    /** The operator cleared the field. */
    | { action: "retire"; id: string; effectiveEnd: string };

/**
 * Decide the canonical lifecycle operation behind one ordinary Save.
 *
 * `capacity` is the value in the field: a whole number of seats, or null when
 * the operator cleared it. Everything else follows from what is already stored.
 */
export function planOrdinaryCapacityWrite(input: {
    rules: readonly ChildcareCapacityRuleRow[];
    roomLocationId: string;
    role: CanonicalUnitRole | null | undefined;
    capacity: number | null;
    todayYmd: string;
}): OrdinaryCapacityPlan {
    const kind = ordinaryCapacityKindForRole(input.role);
    const current = currentOrdinaryRule(input.rules, input.roomLocationId, kind, input.todayYmd);

    if (input.capacity == null) {
        // Clearing a value that was never there is not a retirement.
        return current ? { action: "retire", id: current.id, effectiveEnd: input.todayYmd } : { action: "noop" };
    }

    if (!current) {
        return { action: "create", kind, capacity: input.capacity, effectiveStart: input.todayYmd };
    }
    if (current.capacity === input.capacity) return { action: "noop" };

    // Can the canonical store accept a supersede starting today? It cannot when
    // the prior rule began today, and equally cannot when the prior rule CLOSES
    // today — both are "not strictly after", and only the first was checked here
    // before. The predicate is the store's own.
    const transition = chooseObjectEditTransition({
        priorStart: current.effective_start,
        priorEnd: current.effective_end,
        todayYmd: input.todayYmd,
    });
    if (transition === "replace_same_day") {
        return {
            action: "replace_same_day",
            retireId: current.id,
            kind,
            capacity: input.capacity,
            effectiveStart: input.todayYmd,
        };
    }

    return {
        action: "version",
        priorId: current.id,
        kind,
        capacity: input.capacity,
        effectiveStart: input.todayYmd,
    };
}

/**
 * Parse what the operator typed.
 *
 * An empty field means "not set" and is a legal answer — distinct from 0, which
 * is a real claim that the space takes nobody. Anything else is refused rather
 * than coerced, because `Number("")` is 0 and that would silently turn a
 * cleared field into a closed room.
 */
export function parseOrdinaryCapacityInput(
    raw: string
): { ok: true; value: number | null } | { ok: false; message: string } {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: true, value: null };
    if (!/^\d+$/.test(trimmed)) {
        return { ok: false, message: "Capacity must be a whole number of children." };
    }
    return { ok: true, value: Number(trimmed) };
}
