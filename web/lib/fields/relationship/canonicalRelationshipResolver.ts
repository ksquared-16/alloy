/**
 * Canonical relationship runtime resolver — consumer-neutral read resolution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    CONTACT_COMPAT_SELECT,
    CUSTOMER_CANONICAL_ADMIN_SELECT,
    PERSON_CANONICAL_IDENTITY_SELECT,
} from "@/lib/fields/canonicalEntitySelectColumns";
import type {
    CanonicalRelationshipResolveContext,
    RelationshipResolutionDataBag,
} from "@/lib/fields/relationship/canonicalRelationshipContext";
import type { CanonicalRelationshipResolution } from "@/lib/fields/relationship/canonicalRelationshipResolution";
import { collectRolePersonCandidates } from "@/lib/fields/relationship/relationshipRoleCandidateAdapters";
import { resolvePrimaryContactAuthority } from "@/lib/fields/relationship/primaryContactAuthority";
import { roleSupportsSingularRelationshipLeaf } from "@/lib/fields/relationship/relationshipSemanticShape";
import {
    policyForRelationshipId,
    relationshipRoleFromRelationshipId,
} from "@/lib/fields/relationship/relationshipRoleResolutionPolicy";

function trim(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function baseResolution(
    context: CanonicalRelationshipResolveContext,
    status: CanonicalRelationshipResolution["status"],
    extra: Partial<CanonicalRelationshipResolution> = {},
): CanonicalRelationshipResolution {
    const role = relationshipRoleFromRelationshipId(context.relationshipId) ?? undefined;
    return {
        status,
        relationship_id: context.relationshipId,
        role,
        source_entity_type: context.source.entityType,
        source_record_id: context.source.recordId,
        target_entity_type: "person",
        ...extra,
    };
}

export function resolveCanonicalRelationshipFromDataBag(
    context: CanonicalRelationshipResolveContext,
    data: RelationshipResolutionDataBag,
    customerId: string | null,
): CanonicalRelationshipResolution {
    const policy = policyForRelationshipId(context.relationshipId);
    if (!policy) {
        return baseResolution(context, "unsupported", {
            reason: `Unknown relationship_id "${context.relationshipId}".`,
        });
    }

    if (!policy.allowedSourceEntities.has(context.source.entityType)) {
        return baseResolution(context, "invalid_context", {
            reason: `Relationship "${context.relationshipId}" cannot resolve from source entity "${context.source.entityType}".`,
        });
    }

    if (policy.requiresCustomerMemberContext && !trim(context.customerMemberId)) {
        return baseResolution(context, "invalid_context", {
            reason: `Relationship "${context.relationshipId}" requires customer_member context.`,
        });
    }

    const primaryAuthority = resolvePrimaryContactAuthority({
        data,
        customerId,
        preferOpportunityPointer: context.source.entityType === "opportunity",
    });
    const excludePrimary = primaryAuthority.status === "resolved" ? primaryAuthority.target_person_id : null;

    if (policy.role === "primary") {
        if (primaryAuthority.status !== "resolved" || !primaryAuthority.target_person_id) {
            return baseResolution(context, primaryAuthority.status === "resolved" ? "missing" : primaryAuthority.status, {
                candidate_count: primaryAuthority.candidate_count,
                reason: primaryAuthority.reason,
                diagnostics: primaryAuthority.diagnostics,
            });
        }
        return baseResolution(context, "resolved", {
            target_record_id: primaryAuthority.target_person_id,
            candidate_count: 1,
            resolution_source: primaryAuthority.resolution_source,
            diagnostics: primaryAuthority.diagnostics.length ? primaryAuthority.diagnostics : undefined,
        });
    }

    if (!roleSupportsSingularRelationshipLeaf(policy.role)) {
        return baseResolution(context, "unsupported", {
            reason: `Role "${policy.role}" is a collection relationship — singular scalar leaves are unavailable in P3A.`,
        });
    }

    const candidates = collectRolePersonCandidates(policy.role, {
        customerId,
        customerMemberId: trim(context.customerMemberId),
        data,
        excludePrimaryPersonId: excludePrimary,
    });

    if (candidates.length === 0) {
        return baseResolution(context, "missing", {
            candidate_count: 0,
            reason: `No ${policy.role} contact found for source record.`,
        });
    }

    if (policy.rejectPluralForScalar && candidates.length > 1) {
        return baseResolution(context, "ambiguous", {
            candidate_count: candidates.length,
            reason: `Multiple ${policy.role} contacts match; singular scalar leaf requires exactly one.`,
        });
    }

    return baseResolution(context, "resolved", {
        target_record_id: candidates[0],
        candidate_count: 1,
    });
}

export async function loadRelationshipResolutionDataBag(
    supabase: SupabaseClient,
    orgId: string,
    context: CanonicalRelationshipResolveContext,
    customerId: string | null,
): Promise<RelationshipResolutionDataBag> {
    const data: RelationshipResolutionDataBag = {};

    if (customerId) {
        const { data: customerRow } = await supabase
            .from("customers")
            .select(CUSTOMER_CANONICAL_ADMIN_SELECT)
            .eq("org_id", orgId)
            .eq("id", customerId)
            .maybeSingle();
        data.customerRow = (customerRow as Record<string, unknown>) ?? null;

        const contactId = trim(data.customerRow?.primary_contact_id);
        if (contactId) {
            const { data: contactRow } = await supabase
                .from("contacts")
                .select(CONTACT_COMPAT_SELECT)
                .eq("org_id", orgId)
                .eq("id", contactId)
                .maybeSingle();
            data.contactRow = (contactRow as Record<string, unknown>) ?? null;
        }

        const { data: customerPersonRows } = await supabase
            .from("customer_persons")
            .select("person_id, customer_id, role_type, is_primary")
            .eq("org_id", orgId)
            .eq("customer_id", customerId);
        data.customerPersonRows = (customerPersonRows as Record<string, unknown>[]) ?? [];
    }

    if (context.source.entityType === "opportunity") {
        const { data: oppRow } = await supabase
            .from("opportunities")
            .select("primary_person_id, primary_contact_id, customer_id")
            .eq("org_id", orgId)
            .eq("id", context.source.recordId)
            .maybeSingle();
        data.opportunityRow = (oppRow as Record<string, unknown>) ?? null;

        const { data: opportunityPersonRows } = await supabase
            .from("opportunity_persons")
            .select("person_id, role_type")
            .eq("org_id", orgId)
            .eq("opportunity_id", context.source.recordId);
        data.opportunityPersonRows = (opportunityPersonRows as Record<string, unknown>[]) ?? [];
    }

    const memberId = trim(context.customerMemberId) ?? (context.source.entityType === "customer_member" ? context.source.recordId : null);
    if (memberId) {
        const { data: links } = await supabase
            .from("customer_member_contacts")
            .select("customer_member_id, role_key, is_active, contact:contacts(person_id)")
            .eq("org_id", orgId)
            .eq("customer_member_id", memberId)
            .eq("is_active", true);
        data.customerMemberContactLinks = (links as Record<string, unknown>[]) ?? [];
    }

    return data;
}

export async function resolveCanonicalRelationship(
    supabase: SupabaseClient,
    context: CanonicalRelationshipResolveContext,
    options?: {
        customerId?: string | null;
        dataBag?: RelationshipResolutionDataBag;
    },
): Promise<CanonicalRelationshipResolution> {
    const orgId = trim(context.organizationId);
    if (!orgId) {
        return baseResolution(context, "invalid_context", { reason: "organizationId is required." });
    }

    let customerId = trim(options?.customerId);
    if (!customerId && context.source.entityType === "customer") {
        customerId = context.source.recordId;
    }

    const data =
        options?.dataBag
        ?? (await loadRelationshipResolutionDataBag(supabase, orgId, context, customerId));

    if (!customerId && context.source.entityType === "customer_member") {
        const { data: memberRow } = await supabase
            .from("customer_members")
            .select("customer_id")
            .eq("org_id", orgId)
            .eq("id", context.source.recordId)
            .maybeSingle();
        customerId = trim((memberRow as { customer_id?: string } | null)?.customer_id);
    }

    if (!customerId && context.source.entityType === "opportunity") {
        const { data: oppRow } = await supabase
            .from("opportunities")
            .select("customer_id")
            .eq("org_id", orgId)
            .eq("id", context.source.recordId)
            .maybeSingle();
        customerId = trim((oppRow as { customer_id?: string } | null)?.customer_id);
    }

    if (!customerId && context.source.entityType !== "opportunity") {
        return baseResolution(context, "unavailable", {
            reason: "Cannot determine household customer for relationship root.",
        });
    }

    return resolveCanonicalRelationshipFromDataBag(context, data, customerId);
}

export async function verifyResolvedPersonOrgBoundary(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
): Promise<boolean> {
    const { data } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    return Boolean(data);
}
