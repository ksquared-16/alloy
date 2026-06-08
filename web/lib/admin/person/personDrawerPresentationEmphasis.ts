import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";

/**
 * Presentation emphasis — derived from resolved roles, not persisted person types.
 *
 * One person may hold multiple roles; emphasis picks the primary operator lens for
 * section ordering and visibility until profile-aware layouts exist in config.
 *
 * **Migration path:** `record_drawer_layouts.config_json.presentation_emphasis` +
 * `visible_when.roles[]` replaces this precedence table.
 */
export type PersonDrawerPresentationEmphasis =
    | "child_lifecycle"
    | "guardian_communication"
    | "employee_operations"
    | "emergency_reachability"
    | "general_identity";

const EMPHASIS_PRECEDENCE: PersonDrawerPresentationEmphasis[] = [
    "child_lifecycle",
    "guardian_communication",
    "employee_operations",
    "emergency_reachability",
    "general_identity",
];

const ROLE_TO_EMPHASIS: Record<
    Exclude<PersonDrawerProfileResult["profiles"][number], never>,
    PersonDrawerPresentationEmphasis
> = {
    child: "child_lifecycle",
    parent: "guardian_communication",
    guardian: "guardian_communication",
    employee: "employee_operations",
    emergency_contact: "emergency_reachability",
};

/** Map resolved role keys to presentation emphasis candidates. */
export function personDrawerEmphasisCandidates(profile: PersonDrawerProfileResult): PersonDrawerPresentationEmphasis[] {
    const found = new Set<PersonDrawerPresentationEmphasis>();
    for (const role of profile.profiles) {
        const e = ROLE_TO_EMPHASIS[role];
        if (e) found.add(e);
    }
    if (found.size === 0) found.add("general_identity");
    return EMPHASIS_PRECEDENCE.filter((e) => found.has(e));
}

/**
 * Primary presentation emphasis for layout/visibility decisions.
 * Child lifecycle wins when the person is also a parent (child-first rule).
 */
export function resolvePersonDrawerPresentationEmphasis(
    profile: PersonDrawerProfileResult
): PersonDrawerPresentationEmphasis {
    const candidates = personDrawerEmphasisCandidates(profile);
    return candidates[0] ?? "general_identity";
}

/** Whether mixed-role badge display applies (2+ distinct role keys). */
export function personDrawerIsMixedRolePresentation(profile: PersonDrawerProfileResult): boolean {
    return profile.profiles.length >= 2;
}

/**
 * Lifecycle section slots for child emphasis.
 * `enrollment_activity` is data-backed today; roadmap pills in `PersonDrawerChildLifecycleSummary`
 * preview future layout keys until `record_drawer_layouts` + `visible_when.roles` ship.
 */
export const CHILD_LIFECYCLE_SECTION_SLOTS = [
    "enrollment_activity",
    "schedule",
    "attendance",
    "billing",
    "documents",
    "communications",
    "history",
] as const;
