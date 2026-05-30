import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_PARENT_OPEN_SOURCE } from "@/lib/admin/person/personDrawerParentChrome";

export type PersonDrawerBackLink = {
    label: string;
};

type DrawerRef = {
    type: string;
    id?: string | null;
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
    openSource: string | null | undefined
): PersonDrawerBackLink | null {
    if (!canGoBack || !previousDrawer?.type) return null;

    if (previousDrawer.type === "opportunities") {
        return { label: "Back to Lead" };
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

    return null;
}
