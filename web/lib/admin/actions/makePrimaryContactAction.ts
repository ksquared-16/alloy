import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";

/** Framework action key — primary contact designation is a relationship action, not inline field edit. */
export const MAKE_PRIMARY_CONTACT_ACTION_KEY = "make_primary_contact" as const;

export const MAKE_PRIMARY_CONTACT_ACTION_LABEL = "Make Primary Contact";

/** Shown when registry/header/rail invoke without a contact row target (Option A). */
export const MAKE_PRIMARY_CONTACT_REQUIRES_CONTACT_TARGET_MESSAGE =
    "Select a contact first to make them primary.";

/** Experience Builder / settings availability when placement lacks contact row context. */
export const MAKE_PRIMARY_CONTACT_BUILDER_UNAVAILABLE_MESSAGE = "Requires a contact row target.";

/** workflow_events.event_type emitted after household primary contact reassignment. */
export const HOUSEHOLD_PRIMARY_CONTACT_CHANGED_EVENT_TYPE = "household.primary_contact_changed" as const;

export type MakePrimaryContactScopeKind = "household" | "opportunity";

export const MAKE_PRIMARY_CONTACT_SCOPE_LABELS: Record<MakePrimaryContactScopeKind, string> = {
    household: "Household account",
    opportunity: "Open opportunities on this account",
};

/** Layout-only placements — never generic drawer header / workspace / rail. */
export const MAKE_PRIMARY_CONTACT_ALLOWED_CANONICAL_PLACEMENTS = [
    "drawer_contact_block",
    "drawer_related_list_row",
    "drawer_repeater_row",
] as const;

/** Registry resolve surfaces that must not expose make_primary_contact (no row target). */
export const MAKE_PRIMARY_CONTACT_BLOCKED_REGISTRY_SURFACES = [
    "record_header",
    "record_section",
    "queue_row",
    "work_unit",
    "department",
    "workspace",
    "right_rail",
] as const;

export function isMakePrimaryContactActionKey(value: string): boolean {
    return value.trim() === MAKE_PRIMARY_CONTACT_ACTION_KEY;
}

export function isMakePrimaryContactBlockedRegistrySurface(surface: string): boolean {
    const normalized = surface.trim().toLowerCase();
    return (MAKE_PRIMARY_CONTACT_BLOCKED_REGISTRY_SURFACES as readonly string[]).includes(normalized);
}

export function isMakePrimaryContactAllowedCanonicalPlacement(placement: string): boolean {
    const normalized = placement.trim();
    return (MAKE_PRIMARY_CONTACT_ALLOWED_CANONICAL_PLACEMENTS as readonly string[]).includes(normalized);
}

export function filterMakePrimaryContactFromResolvedActionList<T extends { key: string }>(
    actions: readonly T[],
): T[] {
    return actions.filter((action) => !isMakePrimaryContactActionKey(action.key));
}

export function stripMakePrimaryContactFromResolvedActionsBySlot(
    actions: ResolvedActionsBySlot,
    surface: string,
): ResolvedActionsBySlot {
    if (!isMakePrimaryContactBlockedRegistrySurface(surface)) return actions;
    return {
        primary: filterMakePrimaryContactFromResolvedActionList(actions.primary),
        secondary: filterMakePrimaryContactFromResolvedActionList(actions.secondary),
        overflow: filterMakePrimaryContactFromResolvedActionList(actions.overflow),
        header: filterMakePrimaryContactFromResolvedActionList(actions.header),
        right_rail: filterMakePrimaryContactFromResolvedActionList(actions.right_rail),
        row_inline: filterMakePrimaryContactFromResolvedActionList(actions.row_inline),
    };
}
