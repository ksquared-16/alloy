/**
 * Typed input context for canonical relationship resolution.
 */

export type CanonicalRelationshipSourceEntity = "customer" | "opportunity" | "customer_member";

export type CanonicalRelationshipSource = {
    entityType: CanonicalRelationshipSourceEntity;
    recordId: string;
};

export type CanonicalRelationshipResolveContext = {
    organizationId: string;
    relationshipId: string;
    source: CanonicalRelationshipSource;
    customerMemberId?: string | null;
};

export type RelationshipResolutionDataBag = {
    customerRow?: Record<string, unknown> | null;
    contactRow?: Record<string, unknown> | null;
    customerPersonRows?: ReadonlyArray<Record<string, unknown>>;
    opportunityPersonRows?: ReadonlyArray<Record<string, unknown>>;
    customerMemberContactLinks?: ReadonlyArray<Record<string, unknown>>;
    opportunityRow?: Record<string, unknown> | null;
};

function trim(v: string | null | undefined): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

export function formsRelationshipContextFromLaunch(args: {
    orgId: string;
    relationshipId: string;
    customerId?: string | null;
    opportunityId?: string | null;
    customerMemberId?: string | null;
}): CanonicalRelationshipResolveContext | null {
    const orgId = trim(args.orgId);
    const relationshipId = trim(args.relationshipId);
    if (!orgId || !relationshipId) return null;

    const memberId = trim(args.customerMemberId);
    if (memberId) {
        return {
            organizationId: orgId,
            relationshipId,
            source: { entityType: "customer_member", recordId: memberId },
            customerMemberId: memberId,
        };
    }

    const customerId = trim(args.customerId);
    if (customerId) {
        return {
            organizationId: orgId,
            relationshipId,
            source: { entityType: "customer", recordId: customerId },
            customerMemberId: null,
        };
    }

    const opportunityId = trim(args.opportunityId);
    if (opportunityId) {
        return {
            organizationId: orgId,
            relationshipId,
            source: { entityType: "opportunity", recordId: opportunityId },
            customerMemberId: null,
        };
    }

    return null;
}
