import type { AdminDrawerState, DrawerStackItem } from "@/contexts/AdminDrawerContext";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_PARENT_OPEN_SOURCE } from "@/lib/admin/person/personDrawerParentChrome";
import { findBackToLeadOpportunityInStack } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveBackToLeadOpportunity";

export type PersonDrawerBackLink = {
    label: string;
    /** Jump to pinned opportunity (skips intermediate person stack frames). */
    mode: "back_to_lead" | "stack_pop";
};

type DrawerRef = {
    type: string;
    id?: string | null;
};

export type PersonDrawerBackLinkOptions = {
    stack?: DrawerStackItem[];
    drawer?: Pick<AdminDrawerState, "personDrawerOpenSeed">;
};

/**
 * Operating parent/child person drawer back navigation.
 * - Opportunity stack → "Back to Lead"
 * - Person-to-person household navigation → no back link
 * - Never "Back to Person"
 */
export function resolvePersonDrawerOperatingBackLink(
    canGoBack: boolean,
    previousDrawer: DrawerRef | null | undefined,
    openSource: string | null | undefined,
    options?: PersonDrawerBackLinkOptions
): PersonDrawerBackLink | null {
    const pinnedLead =
        options?.stack && options.drawer ?
            findBackToLeadOpportunityInStack(options.stack, options.drawer)
        :   null;

    if (pinnedLead) {
        return { label: "Back to Lead", mode: "back_to_lead" };
    }

    if (!canGoBack || !previousDrawer?.type) return null;

    if (previousDrawer.type === "opportunities") {
        return { label: "Back to Lead", mode: "back_to_lead" };
    }

    if (previousDrawer.type === "persons") {
        return null;
    }

    const src = String(openSource ?? "").trim();
    if (
        src === PERSON_DRAWER_CHILD_OPEN_SOURCE ||
        src === PERSON_DRAWER_PARENT_OPEN_SOURCE ||
        src === "opportunity_primary_contact" ||
        src === "opportunity_household_adult"
    ) {
        return null;
    }

    return { label: "Back", mode: "stack_pop" };
}
