/**
 * WHAT A SPACE MAY BE USED FOR — one rule, shared by configuration, pickers and the server writer.
 *
 * A space declares its uses as the org's own assignment categories, stored on the space
 * (`locations.metadata.space_uses: string[]` of `operational_assignment_types.id`). There is no
 * second taxonomy: the category list IS the use vocabulary (V7 decision S1).
 *
 * Structure still decides what a space can be at all (S2, S4), from the canonical `unit_role`:
 *   - `operational_group` — a classroom/cohort: may carry any child or staff use;
 *   - `shared_space`      — a playground, gym: child uses only, never a staffing unit;
 *   - `physical_space`    — a licensed container of classrooms: not schedulable, no uses.
 *
 * LEGACY COMPATIBILITY (pending Director confirmation, V7-02a §7). A space that has never had uses
 * configured (`space_uses` absent) keeps its pre-V7 eligibility only if it is a classroom; an
 * unconfigured shared space is not offered or accepted for new participation, and a physical space
 * never is. The policy is named here, once, so changing it is one edit.
 *
 * Pure and client-safe: no I/O.
 */

import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";

export const SPACE_USES_METADATA_KEY = "space_uses";

/** The legacy policy for spaces with no configured uses. See the header. */
export const UNCONFIGURED_CLASSROOM_KEEPS_LEGACY_ELIGIBILITY = true;

/**
 * THE THREE STORED STATES (COMPAT-1), kept distinct so diagnostics never confuse them:
 *   - `unconfigured` — `space_uses` absent: the legacy policy above applies;
 *   - `configured`   — a list of category ids; an EMPTY list is a deliberate "no uses";
 *   - `malformed`    — present but not a list (`not_a_list`), or a list with an entry that is not a
 *                      non-blank string (`invalid_member`). It fails closed and is never rewritten.
 */
export type SpaceUsesMalformedReason = "not_a_list" | "invalid_member";
export type SpaceUsesState =
    | { kind: "unconfigured" }
    | { kind: "configured"; uses: string[] }
    | { kind: "malformed"; reason: SpaceUsesMalformedReason };

export function readSpaceUsesState(metadata: Record<string, unknown> | null | undefined): SpaceUsesState {
    const holder = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : null;
    if (!holder || !Object.prototype.hasOwnProperty.call(holder, SPACE_USES_METADATA_KEY)) return { kind: "unconfigured" };
    const raw = holder[SPACE_USES_METADATA_KEY];
    if (!Array.isArray(raw)) return { kind: "malformed", reason: "not_a_list" };
    if (raw.some((v) => typeof v !== "string" || v.trim() === "")) return { kind: "malformed", reason: "invalid_member" };
    return { kind: "configured", uses: [...new Set(raw.map((v: string) => v.trim()))] };
}

/**
 * The configured uses for callers that only filter (pickers): `null` = never configured. A MALFORMED
 * value yields no uses here so a picker fails closed; anything that reports or validates reads
 * `readSpaceUsesState`, where malformed stays distinct from an intentional empty list.
 */
export function readSpaceUses(metadata: Record<string, unknown> | null | undefined): string[] | null {
    const state = readSpaceUsesState(metadata);
    return state.kind === "unconfigured" ? null : state.kind === "configured" ? state.uses : [];
}

export type SpaceForUse = {
    unitRole: CanonicalUnitRole;
    spaceUses: readonly string[] | null;
    /** Set by readers that hold the stored state: a malformed configuration refuses every new use. */
    spaceUsesMalformed?: boolean;
};
export type UseForSpace = { categoryId: string | null; subjectType: "child" | "staff" };

export type SpaceUseRefusalCode =
    | "physical_space_not_schedulable"
    | "staff_room_must_be_classroom"
    | "space_uses_not_configured"
    | "space_uses_malformed"
    | "use_not_configured_for_space"
    | "category_required_for_space";

export type SpaceUseVerdict = { ok: true; legacy: boolean } | { ok: false; code: SpaceUseRefusalCode; message: string };

const REFUSAL_MESSAGES: Record<SpaceUseRefusalCode, string> = {
    physical_space_not_schedulable:
        "This is a physical space that holds classrooms. Schedule the classroom inside it, or a shared space.",
    staff_room_must_be_classroom: "A staff assignment's room must be a classroom (operational group).",
    space_uses_not_configured: "This space has no configured uses yet. Configure its uses in Locations → Rooms.",
    space_uses_malformed: "This space's configured uses are unreadable. Repair its uses in Locations → Rooms before scheduling here.",
    use_not_configured_for_space: "This space is not configured for this use.",
    category_required_for_space: "Choose what this schedule is for — this space only accepts its configured uses.",
};

const refuse = (code: SpaceUseRefusalCode): SpaceUseVerdict => ({ ok: false, code, message: REFUSAL_MESSAGES[code] });

/** May this space hold participation of this use? The one eligibility rule (server authoritative). */
export function spaceEligibleForUse(space: SpaceForUse, use: UseForSpace): SpaceUseVerdict {
    if (space.unitRole === "physical_space") return refuse("physical_space_not_schedulable");
    if (use.subjectType === "staff" && space.unitRole !== "operational_group") return refuse("staff_room_must_be_classroom");
    // Malformed configuration fails CLOSED for every new use (COMPAT-1). An edit that keeps its room and
    // use is grandfathered by the server writer before this rule runs, so existing participation stands.
    if (space.spaceUsesMalformed) return refuse("space_uses_malformed");
    /*
     * NO CATEGORY = THE ENROLLMENT'S OWN SCHEDULE. The base schedule (`is_primary`) carries no category
     * (every live staging primary has none) and lives in the placement's classroom. It is allowed in
     * any classroom and nowhere else — a structural rule, not a claim about the space's uses — so
     * configuring a classroom's uses never blocks editing an enrolled child's schedule.
     */
    if (!use.categoryId) return space.unitRole === "operational_group" ? { ok: true, legacy: space.spaceUses == null } : refuse("category_required_for_space");
    if (space.spaceUses == null) {
        if (space.unitRole === "operational_group" && UNCONFIGURED_CLASSROOM_KEEPS_LEGACY_ELIGIBILITY) return { ok: true, legacy: true };
        return refuse("space_uses_not_configured");
    }
    return space.spaceUses.includes(use.categoryId) ? { ok: true, legacy: false } : refuse("use_not_configured_for_space");
}

export type SpaceUseConfigReason = "unknown_category" | "physical_space_has_no_uses" | "staff_use_needs_classroom";

/**
 * Which of these categories may a space of this role be CONFIGURED with? Configuration validation
 * applies the same structure: a physical space takes none; a shared space takes child categories.
 */
export function invalidSpaceUsesForRole(
    role: CanonicalUnitRole,
    useIds: readonly string[],
    categories: ReadonlyArray<{ id: string; subjectTypes: ReadonlyArray<"child" | "staff"> }>,
): Array<{ id: string; reason: SpaceUseConfigReason }> {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return useIds.flatMap((id): Array<{ id: string; reason: SpaceUseConfigReason }> => {
        const category = byId.get(id);
        if (!category) return [{ id, reason: "unknown_category" }];
        if (role === "physical_space") return [{ id, reason: "physical_space_has_no_uses" }];
        if (role === "shared_space" && !category.subjectTypes.includes("child")) return [{ id, reason: "staff_use_needs_classroom" }];
        return [];
    });
}

/** Spaces a CHILD schedule may be offered in at all, before a category narrows them further. */
export function schedulableForChildren<T extends SpaceForUse>(spaces: readonly T[]): T[] {
    return spaces.filter(
        (s) =>
            s.unitRole !== "physical_space" &&
            !s.spaceUsesMalformed &&
            !(s.spaceUses == null && !(s.unitRole === "operational_group" && UNCONFIGURED_CLASSROOM_KEEPS_LEGACY_ELIGIBILITY)),
    );
}
