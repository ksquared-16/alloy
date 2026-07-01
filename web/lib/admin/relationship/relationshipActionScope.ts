/**
 * Relationship Action Framework — scope resolution.
 */

import type {
    RelationshipActionHouseholdChildTarget,
    RelationshipActionScope,
} from "@/lib/admin/relationship/relationshipActionContract";

export function resolveRelationshipScopeMemberIds(input: {
    scope: RelationshipActionScope;
    anchorCustomerMemberId: string | null;
    householdChildren: RelationshipActionHouseholdChildTarget[];
    selectedChildCustomerMemberIds?: string[];
}): string[] {
    const anchor = input.anchorCustomerMemberId?.trim() ?? "";
    const children = input.householdChildren;

    if (input.scope === "this_child") {
        return anchor ? [anchor] : [];
    }

    if (input.scope === "all_children_in_household" || input.scope === "household") {
        const ids = children.map((child) => child.customer_member_id.trim()).filter(Boolean);
        if (ids.length > 0) return [...new Set(ids)];
        return anchor ? [anchor] : [];
    }

    if (input.scope === "selected_children" || input.scope === "selected_enrollments") {
        const selected = (input.selectedChildCustomerMemberIds ?? [])
            .map((id) => id.trim())
            .filter(Boolean);
        const allowed = new Set(children.map((child) => child.customer_member_id));
        const filtered = selected.filter((id) => allowed.has(id));
        if (filtered.length > 0) return [...new Set(filtered)];
        return anchor ? [anchor] : [];
    }

    if (input.scope === "this_opportunity") {
        return anchor ? [anchor] : [];
    }

    return anchor ? [anchor] : [];
}

export function resolveRelationshipScopeTargets(input: {
    scope: RelationshipActionScope;
    anchorCustomerMemberId: string | null;
    householdChildren: RelationshipActionHouseholdChildTarget[];
    selectedChildCustomerMemberIds?: string[];
}): RelationshipActionHouseholdChildTarget[] {
    const memberIds = new Set(resolveRelationshipScopeMemberIds(input));
    const byId = new Map(
        input.householdChildren.map((child) => [child.customer_member_id, child] as const),
    );
    return [...memberIds].map((memberId) => {
        return (
            byId.get(memberId)
            ?? {
                customer_member_id: memberId,
                child_person_id: null,
                display_name: memberId,
            }
        );
    });
}

export function scopeAllowedForAction(
    allowedScopes: readonly RelationshipActionScope[],
    scope: RelationshipActionScope,
): boolean {
    return allowedScopes.includes(scope);
}

/** @deprecated Use resolveRelationshipScopeMemberIds */
export function resolveEmergencyContactScopeMemberIds(input: {
    scope: RelationshipActionScope;
    anchorCustomerMemberId: string | null;
    householdChildren: RelationshipActionHouseholdChildTarget[];
    selectedCustomerMemberIds?: string[];
}): string[] {
    return resolveRelationshipScopeMemberIds({
        scope: input.scope,
        anchorCustomerMemberId: input.anchorCustomerMemberId,
        householdChildren: input.householdChildren,
        selectedChildCustomerMemberIds: input.selectedCustomerMemberIds,
    });
}

/** @deprecated Use resolveRelationshipScopeTargets */
export function resolveEmergencyContactScopeTargets(input: {
    scope: RelationshipActionScope;
    anchorCustomerMemberId: string | null;
    householdChildren: RelationshipActionHouseholdChildTarget[];
    selectedCustomerMemberIds?: string[];
}): RelationshipActionHouseholdChildTarget[] {
    return resolveRelationshipScopeTargets({
        scope: input.scope,
        anchorCustomerMemberId: input.anchorCustomerMemberId,
        householdChildren: input.householdChildren,
        selectedChildCustomerMemberIds: input.selectedCustomerMemberIds,
    });
}
