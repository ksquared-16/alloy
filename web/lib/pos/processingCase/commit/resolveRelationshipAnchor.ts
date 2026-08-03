/**
 * Resolve and VALIDATE the anchor a configured relationship commit attaches to.
 *
 * A relationship is always written *somewhere*: to one child, to several named children, to every
 * child in a household, or to the household itself. Getting that wrong is not a cosmetic bug — it
 * silently grants an authorized pickup over a sibling, or attaches an emergency contact to a child
 * in another family. So the anchor is treated as authority, not as a hint.
 *
 * Two rules this module exists to enforce:
 *   • NEVER infer a single child from a household. If a child-scoped relationship arrives without a
 *     child, it is rejected — not resolved to "the only child" or "the first child".
 *   • NEVER silently expand a missing anchor to every child. Household-wide expansion happens only
 *     when the definition permits that scope AND the approved proposal explicitly selected it.
 *
 * Scope behaviour is read from the Relationship Definition. There is deliberately no branch on
 * guardian / emergency_contact / authorized_pickup anywhere here.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import type { RelationshipDefinition } from "@/lib/fields/relationship/relationshipDefinitions";

/** A household child the actor is allowed to anchor to, as loaded server-side. */
export type AnchorCandidate = {
    customer_member_id: string;
    customer_id: string;
    org_id: string;
};

export type RelationshipAnchorRequest = {
    /** Household/customer context — server-resolved from the case, never client-asserted. */
    customerId: string;
    /** Explicit child anchor. Required for child-scoped commits. */
    customerMemberId?: string | null;
    /** Explicit set for selected-children scope. */
    selectedCustomerMemberIds?: readonly string[] | null;
    /** The scope the approved proposal selected. */
    scope: string;
};

export type RelationshipAnchorFailure = {
    ok: false;
    status: 400 | 403;
    code:
        | "scope_not_supported"
        | "missing_child_anchor"
        | "anchor_wrong_household"
        | "anchor_wrong_organization"
        | "anchor_not_found"
        | "empty_selection"
        | "expansion_not_permitted";
    reason: string;
};

export type RelationshipAnchorSuccess = {
    ok: true;
    /** The member ids the relationship role will be written against. */
    memberIds: string[];
    /** Primary anchor when the commit is child-specific. */
    anchorCustomerMemberId: string | null;
    scope: string;
    /** True when the commit deliberately spans the household rather than a named child. */
    householdWide: boolean;
};

/** Scopes that name specific children and therefore need an explicit anchor. */
const CHILD_SPECIFIC_SCOPES = new Set(["this_child"]);
const SELECTION_SCOPES = new Set(["selected_children", "selected_enrollments"]);
const HOUSEHOLD_WIDE_SCOPES = new Set(["all_children_in_household", "household"]);

export function resolveRelationshipAnchor(input: {
    definition: RelationshipDefinition;
    request: RelationshipAnchorRequest;
    orgId: string;
    /** Household children loaded server-side for the case's customer. */
    householdChildren: readonly AnchorCandidate[];
}): RelationshipAnchorSuccess | RelationshipAnchorFailure {
    const { definition, request, orgId, householdChildren } = input;
    const scope = request.scope?.trim();

    if (!scope || !definition.scopes.includes(scope)) {
        return {
            ok: false,
            status: 400,
            code: "scope_not_supported",
            reason: `Scope "${scope ?? ""}" is not supported by the ${definition.label} relationship.`,
        };
    }

    /** Validate one candidate id against org + household. */
    const validate = (id: string): RelationshipAnchorFailure | AnchorCandidate => {
        const found = householdChildren.find((c) => c.customer_member_id === id);
        if (!found) {
            return {
                ok: false,
                status: 403,
                code: "anchor_not_found",
                reason: "Anchor child was not found in the resolved household.",
            };
        }
        if (found.org_id !== orgId) {
            return {
                ok: false,
                status: 403,
                code: "anchor_wrong_organization",
                reason: "Anchor child belongs to a different organization.",
            };
        }
        if (found.customer_id !== request.customerId) {
            return {
                ok: false,
                status: 403,
                code: "anchor_wrong_household",
                reason: "Anchor child belongs to a different household.",
            };
        }
        return found;
    };

    // ── child-specific ────────────────────────────────────────────────────────────────────────
    if (CHILD_SPECIFIC_SCOPES.has(scope)) {
        const id = request.customerMemberId?.trim();
        if (!id) {
            return {
                ok: false,
                status: 400,
                code: "missing_child_anchor",
                reason: `${definition.label} is child-scoped and requires an explicit child. A household is not a child.`,
            };
        }
        const checked = validate(id);
        if ("ok" in checked) return checked;
        return { ok: true, memberIds: [checked.customer_member_id], anchorCustomerMemberId: checked.customer_member_id, scope, householdWide: false };
    }

    // ── explicit selection ────────────────────────────────────────────────────────────────────
    if (SELECTION_SCOPES.has(scope)) {
        const ids = (request.selectedCustomerMemberIds ?? []).map((s) => s.trim()).filter(Boolean);
        if (ids.length === 0) {
            return {
                ok: false,
                status: 400,
                code: "empty_selection",
                reason: `${definition.label} was committed with selected-children scope but no children were selected.`,
            };
        }
        const resolved: string[] = [];
        for (const id of ids) {
            const checked = validate(id);
            if ("ok" in checked) return checked;
            resolved.push(checked.customer_member_id);
        }
        return {
            ok: true,
            memberIds: [...new Set(resolved)],
            anchorCustomerMemberId: resolved[0] ?? null,
            scope,
            householdWide: false,
        };
    }

    // ── household-wide ────────────────────────────────────────────────────────────────────────
    if (HOUSEHOLD_WIDE_SCOPES.has(scope)) {
        // Permitted only because the definition lists this scope AND the proposal chose it — never
        // as a fallback for a missing child anchor.
        const inHousehold = householdChildren.filter((c) => c.org_id === orgId && c.customer_id === request.customerId);
        // A genuinely household-scoped relationship does not need children at all.
        if (definition.relationship_scope === "household") {
            return { ok: true, memberIds: inHousehold.map((c) => c.customer_member_id), anchorCustomerMemberId: null, scope, householdWide: true };
        }
        if (inHousehold.length === 0) {
            return {
                ok: false,
                status: 400,
                code: "expansion_not_permitted",
                reason: "Household-wide scope was selected but the household has no children to attach to.",
            };
        }
        return {
            ok: true,
            memberIds: inHousehold.map((c) => c.customer_member_id),
            anchorCustomerMemberId: null,
            scope,
            householdWide: true,
        };
    }

    // ── anything else the definition permits (e.g. this_opportunity) ──────────────────────────
    return { ok: true, memberIds: [], anchorCustomerMemberId: null, scope, householdWide: false };
}
