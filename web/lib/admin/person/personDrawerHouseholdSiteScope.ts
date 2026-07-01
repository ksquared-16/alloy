import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { accessScopeRestrictsData } from "@/lib/admin/accessScope";
import type {
    PersonEnrollmentMirrorRow,
    PersonHouseholdAdultLinkRow,
    PersonHouseholdChildLinkRow,
    PersonHouseholdContextRow,
    PersonSiblingLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

/**
 * When site scope is restricted, hide household/child links only reachable through inaccessible
 * enrollment/opportunity locations. Person identity may span sites; projection follows operational context.
 */
export function filterPersonDrawerHouseholdVisibilityBySiteScope(
    out: Record<string, unknown>,
    scope: AdminAccessScopeDimensions | null | undefined
): void {
    if (!scope || !accessScopeRestrictsData(scope) || scope.siteScope !== "restricted") {
        return;
    }

    const allowed = new Set((scope.allowedSiteLocationIds ?? []).map(String).filter(Boolean));
    if (allowed.size === 0) {
        out._household_context = [];
        out._household_adult_links = [];
        out._household_child_links = [];
        out._sibling_links = [];
        out._enrollment_mirror = [];
        return;
    }

    const mirror = ((out._enrollment_mirror as PersonEnrollmentMirrorRow[] | undefined) ?? []).filter((row) => {
        const locId = trimOrNull(row.location_id);
        return locId != null && allowed.has(locId);
    });
    out._enrollment_mirror = mirror;

    const childLinks = (out._household_child_links as PersonHouseholdChildLinkRow[] | undefined) ?? [];
    const siblingLinks = (out._sibling_links as PersonSiblingLinkRow[] | undefined) ?? [];
    const memberToCustomer = new Map<string, string>();
    for (const link of [...childLinks, ...siblingLinks]) {
        memberToCustomer.set(link.customer_member_id, link.customer_id);
    }

    const accessibleMemberIds = new Set(mirror.map((row) => row.customer_member_id));
    const accessibleCustomerIds = new Set<string>();
    for (const row of mirror) {
        const customerId = memberToCustomer.get(row.customer_member_id);
        if (customerId) accessibleCustomerIds.add(customerId);
    }

    out._household_child_links = childLinks.filter((link) =>
        accessibleMemberIds.has(link.customer_member_id)
    );
    out._sibling_links = siblingLinks.filter((link) =>
        accessibleMemberIds.has(link.customer_member_id)
    );
    out._household_adult_links = (
        (out._household_adult_links as PersonHouseholdAdultLinkRow[] | undefined) ?? []
    ).filter((link) => accessibleCustomerIds.has(link.customer_id));
    out._household_context = (
        (out._household_context as PersonHouseholdContextRow[] | undefined) ?? []
    ).filter((row) => accessibleCustomerIds.has(row.customer_id));
}
