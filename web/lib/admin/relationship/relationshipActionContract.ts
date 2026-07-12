/**
 * Relationship Action Framework — unified contract.
 *
 * Doctrine: choose/create identity → assign role → choose scope → confirm → write → event → refresh.
 */

import type { ChildScopedContactLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";
import type { PersonChildRelationshipMemberBag } from "@/lib/fields/personChildRelationship/attachPersonChildRelationshipsToEntityRecord";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const RELATIONSHIP_ACTION_KEYS = [
    "add_emergency_contact",
    "add_authorized_pickup",
    "add_billing_contact",
    "add_parent_guardian",
    "add_child",
    "link_existing_person",
    "link_existing_child",
    "make_primary_contact",
] as const;

export type RelationshipActionKey = (typeof RELATIONSHIP_ACTION_KEYS)[number];

export type RelationshipRoleKey = string;

export type RelationshipActionScope =
    | "this_child"
    | "selected_children"
    | "all_children_in_household"
    | "this_opportunity"
    | "household"
    | "selected_enrollments";

export const RELATIONSHIP_ACTION_SCOPES = [
    "this_child",
    "selected_children",
    "all_children_in_household",
    "this_opportunity",
    "household",
    "selected_enrollments",
] as const satisfies readonly RelationshipActionScope[];

export const RELATIONSHIP_ACTION_SCOPE_LABELS: Record<RelationshipActionScope, string> = {
    this_child: "This child only",
    selected_children: "Selected siblings",
    all_children_in_household: "All children in household",
    this_opportunity: "This opportunity / enrollment",
    household: "Household account",
    selected_enrollments: "Selected enrollments",
};

export type RelationshipActionSourceSurface =
    | "child_drawer"
    | "person_drawer"
    | "opportunity_drawer"
    | "bos_rail";

export type RelationshipActionContext = {
    sourceSurface: RelationshipActionSourceSurface;
    sourceRecordId: string;
    sourceEntityType: "child" | "person" | "opportunity";
    sourceOpportunityId: string | null;
    sourceChildPersonId: string | null;
    sourceCustomerId: string;
    anchorCustomerMemberId: string | null;
    householdChildren: RelationshipActionHouseholdChildTarget[];
    householdAdultCandidates: RelationshipActionPersonCandidate[];
    householdChildCandidates: RelationshipActionHouseholdChildTarget[];
    childDisplayName: string;
};

export type RelationshipActionHouseholdChildTarget = {
    customer_member_id: string;
    child_person_id: string | null;
    display_name: string;
    opportunity_customer_member_id?: string | null;
};

export type RelationshipActionPersonCandidate = {
    person_id: string;
    display_name: string;
    email?: string | null;
    phone?: string | null;
};

export type RelationshipActionCreatePersonDraft = {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
};

export type RelationshipActionCreateChildDraft = {
    first_name: string;
    last_name: string;
    date_of_birth?: string;
};

export type RelationshipActionAffectedRecordPreview = {
    label: string;
    table: string;
    record_ids?: string[];
};

export type RelationshipActionProposal = {
    actionKey: RelationshipActionKey;
    sourceSurface: RelationshipActionSourceSurface;
    sourceRecordId: string;
    sourceEntityType: RelationshipActionContext["sourceEntityType"];
    sourceOpportunityId?: string | null;
    sourceChildPersonId?: string | null;
    sourceCustomerId?: string;
    selectedPersonId?: string;
    selectedChildPersonId?: string;
    personDisplayName?: string;
    childDisplayName?: string;
    createPersonDraft?: RelationshipActionCreatePersonDraft;
    createChildDraft?: RelationshipActionCreateChildDraft;
    roleKey?: RelationshipRoleKey;
    scope?: RelationshipActionScope;
    selectedChildCustomerMemberIds?: string[];
    selectedOpportunityCustomerMemberIds?: string[];
    affectedRecordPreview?: RelationshipActionAffectedRecordPreview[];
    confirmationRequired: true;
    bosPrompt?: string;
};

export type RelationshipActionExecutionRequest = {
    actionKey: RelationshipActionKey;
    sourceSurface: RelationshipActionSourceSurface;
    sourceRecordId: string;
    sourceEntityType: RelationshipActionContext["sourceEntityType"];
    sourceOpportunityId?: string | null;
    sourceChildPersonId?: string | null;
    sourceCustomerId: string;
    anchorCustomerMemberId?: string | null;
    selectedPersonId?: string;
    selectedChildPersonId?: string;
    createPersonDraft?: RelationshipActionCreatePersonDraft;
    createChildDraft?: RelationshipActionCreateChildDraft;
    roleKey?: RelationshipRoleKey;
    scope: RelationshipActionScope;
    selectedChildCustomerMemberIds?: string[];
    selectedOpportunityCustomerMemberIds?: string[];
    confirmationRequired?: boolean;
};

export type RelationshipActionExecutionResult = {
    ok: true;
    actionKey: RelationshipActionKey;
    role_key: string | null;
    person_id: string | null;
    child_person_id: string | null;
    contact_id: string | null;
    customer_member_id: string | null;
    links_written: number;
    links_skipped_invalid_role: number;
    affected_children: RelationshipActionHouseholdChildTarget[];
    affected_record_preview: RelationshipActionAffectedRecordPreview[];
    scoped_contact_links: ChildScopedContactLinkRow[];
    person_child_relationships_by_member?: PersonChildRelationshipMemberBag[];
    refresh_hints: {
        entityType: "child" | "person" | "opportunities";
        entityId: string;
    };
};

function trimId(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text || null;
}

function childDisplayName(row: Record<string, unknown>): string {
    return (
        trimId(row.display_name)
        ?? trimId(row["child.name"])
        ?? [trimId(row.first_name), trimId(row.last_name)].filter(Boolean).join(" ")
        ?? trimId(row.person_id)
        ?? trimId(row.customer_member_id)
        ?? "Child"
    );
}

export function readHouseholdChildrenFromRuntimeRecord(
    record: ProofRuntimeRecord,
): RelationshipActionHouseholdChildTarget[] {
    const keys = ["_household_children", "household_children", "_inquiry_children", "children"] as const;
    const out: RelationshipActionHouseholdChildTarget[] = [];
    const seen = new Set<string>();

    for (const key of keys) {
        const raw = record[key];
        if (!Array.isArray(raw)) continue;
        for (const entry of raw) {
            if (!entry || typeof entry !== "object") continue;
            const row = entry as Record<string, unknown>;
            const customerMemberId =
                trimId(row.customer_member_id)
                ?? trimId(row.id)
                ?? trimId(row["child.customer_member_id"]);
            if (!customerMemberId || seen.has(customerMemberId)) continue;
            seen.add(customerMemberId);
            out.push({
                customer_member_id: customerMemberId,
                child_person_id:
                    trimId(row.person_id)
                    ?? trimId(row["child.id"])
                    ?? trimId(row.child_person_id),
                display_name: childDisplayName(row),
                opportunity_customer_member_id: trimId(row.ocm_id) ?? trimId(row.opportunity_customer_member_id),
            });
        }
    }

    const anchorMemberId =
        trimId(record.customer_member_id)
        ?? trimId(record["child.customer_member_id"]);
    const anchorPersonId = trimId(record["child.id"]) ?? trimId(record.id);
    if (anchorMemberId && !seen.has(anchorMemberId)) {
        out.unshift({
            customer_member_id: anchorMemberId,
            child_person_id: anchorPersonId,
            display_name:
                trimId(record["child.name"])
                ?? trimId(record.display_name)
                ?? "This child",
            opportunity_customer_member_id: trimId(record.ocm_id),
        });
    }

    return out;
}

export function readHouseholdAdultCandidatesFromRuntimeRecord(
    record: ProofRuntimeRecord,
): RelationshipActionPersonCandidate[] {
    const raw = record._household_adult_links;
    if (!Array.isArray(raw)) return [];
    const out: RelationshipActionPersonCandidate[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const row = entry as Record<string, unknown>;
        const personId = trimId(row.person_id);
        if (!personId || seen.has(personId)) continue;
        seen.add(personId);
        out.push({
            person_id: personId,
            display_name: trimId(row.display_name) ?? trimId(row.name) ?? personId,
            email: trimId(row.email),
            phone: trimId(row.phone),
        });
    }
    return out;
}

export function isRelationshipActionKey(value: string): value is RelationshipActionKey {
    return (RELATIONSHIP_ACTION_KEYS as readonly string[]).includes(value.trim());
}

export function isRelationshipActionScope(value: string): value is RelationshipActionScope {
    return (RELATIONSHIP_ACTION_SCOPES as readonly string[]).includes(value.trim());
}

export function proposalToExecutionRequest(
    proposal: RelationshipActionProposal,
): RelationshipActionExecutionRequest {
    if (!proposal.sourceCustomerId) {
        throw new Error("Relationship action proposal missing sourceCustomerId.");
    }
    return {
        actionKey: proposal.actionKey,
        sourceSurface: proposal.sourceSurface,
        sourceRecordId: proposal.sourceRecordId,
        sourceEntityType: proposal.sourceEntityType,
        sourceOpportunityId: proposal.sourceOpportunityId ?? null,
        sourceChildPersonId: proposal.sourceChildPersonId ?? null,
        sourceCustomerId: proposal.sourceCustomerId,
        anchorCustomerMemberId: proposal.selectedChildCustomerMemberIds?.[0] ?? null,
        selectedPersonId: proposal.selectedPersonId,
        selectedChildPersonId: proposal.selectedChildPersonId,
        createPersonDraft: proposal.createPersonDraft,
        createChildDraft: proposal.createChildDraft,
        roleKey: proposal.roleKey,
        scope: proposal.scope ?? "this_child",
        selectedChildCustomerMemberIds: proposal.selectedChildCustomerMemberIds,
        selectedOpportunityCustomerMemberIds: proposal.selectedOpportunityCustomerMemberIds,
        confirmationRequired: true,
    };
}

/** Child-scoped emergency contact scopes (legacy alias). */
export type RelationshipEmergencyContactScope = Extract<
    RelationshipActionScope,
    "this_child" | "selected_children" | "all_children_in_household"
>;

export const RELATIONSHIP_EMERGENCY_CONTACT_SCOPES = [
    "this_child",
    "selected_children",
    "all_children_in_household",
] as const satisfies readonly RelationshipEmergencyContactScope[];

export const RELATIONSHIP_EMERGENCY_CONTACT_SCOPE_LABELS: Record<RelationshipEmergencyContactScope, string> = {
    this_child: RELATIONSHIP_ACTION_SCOPE_LABELS.this_child,
    selected_children: RELATIONSHIP_ACTION_SCOPE_LABELS.selected_children,
    all_children_in_household: RELATIONSHIP_ACTION_SCOPE_LABELS.all_children_in_household,
};

export const EMERGENCY_CONTACT_TARGET_ROLE_KEY = "emergency_contact";

export {
    resolveEmergencyContactScopeMemberIds,
    resolveEmergencyContactScopeTargets,
} from "@/lib/admin/relationship/relationshipActionScope";
