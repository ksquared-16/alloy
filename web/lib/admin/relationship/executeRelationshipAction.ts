import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyChildScopedContactAssignments,
    ensureContactForPerson,
    type ChildScopedContactAssignment,
} from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import { applyCanonicalChildScopedRelationships } from "@/lib/admin/actions/createLeadPersonChildRelationshipPersistence";
import { shouldWriteChildScopedRelationshipsToPcr } from "@/lib/admin/actions/childScopedContactRoleMapping";
import { attachPersonChildRelationshipsToEntityRecord } from "@/lib/fields/personChildRelationship/attachPersonChildRelationshipsToEntityRecord";
import {
    applyCreateLeadChildParticipationFromIdentity,
    type CreateLeadChildIdentity,
    type CreateLeadChildOcmFields,
} from "@/lib/admin/actions/createLeadChildOcmPersistence";
import {
    ensureCustomerPersonRoleLink,
    ensureOpportunityPersonExplicitRole,
} from "@/lib/admin/actions/createLeadRoleContactPersistence";
import { validatePersonIdentityFields } from "@/lib/admin/person/upsertAndLinkPersonForAdmin";
import {
    attachChildScopedContactLinksToRecord,
    memberRowsFromInquiryChildren,
} from "@/lib/admin/person/fetchChildScopedContactLinks";
import type { ChildScopedContactLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";
import { findOrCreateChildPersonInOrg } from "@/lib/admin/person/findOrCreateChildPersonInOrg";
import type {
    RelationshipActionAffectedRecordPreview,
    RelationshipActionExecutionRequest,
    RelationshipActionExecutionResult,
    RelationshipActionHouseholdChildTarget,
} from "@/lib/admin/relationship/relationshipActionContract";
import { emitRelationshipActionEvent } from "@/lib/admin/relationship/emitRelationshipActionEvent";
import {
    loadRelationshipActionRoleKeys,
    relationshipRoleConfigError,
    resolveRelationshipRoleKeyForAction,
} from "@/lib/admin/relationship/relationshipActionRoleResolution";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";
import {
    resolveRelationshipScopeMemberIds,
    resolveRelationshipScopeTargets,
    scopeAllowedForAction,
} from "@/lib/admin/relationship/relationshipActionScope";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";

function trim(value: unknown): string {
    return value != null ? String(value).trim() : "";
}

const EMPTY_CHILD_OCM: CreateLeadChildOcmFields = {
    location_id: null,
    program_key: null,
    program_category_id: null,
    schedule_type: null,
    start_date: null,
    program_room_cohort_key: null,
    notes: null,
};

export type ExecuteRelationshipActionInput = RelationshipActionExecutionRequest & {
    orgId: string;
    actorUserId?: string | null;
};

async function loadHouseholdChildren(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
): Promise<RelationshipActionHouseholdChildTarget[]> {
    const { data, error } = await supabase
        .from("customer_members")
        .select("id, person_id, persons(first_name, last_name)")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);

    if (error) throw new Error(error.message ?? "Could not load household children.");

    return (data ?? [])
        .map((row) => {
            const member = row as {
                id?: string;
                person_id?: string | null;
                persons?: { first_name?: string | null; last_name?: string | null }
                    | { first_name?: string | null; last_name?: string | null }[]
                    | null;
            };
            const person = Array.isArray(member.persons) ? member.persons[0] : member.persons;
            const displayName =
                [trim(person?.first_name), trim(person?.last_name)].filter(Boolean).join(" ")
                || trim(member.person_id)
                || trim(member.id);
            return {
                customer_member_id: trim(member.id),
                child_person_id: trim(member.person_id) || null,
                display_name: displayName || "Child",
            };
        })
        .filter((child) => child.customer_member_id);
}

async function resolvePersonId(
    supabase: SupabaseClient,
    orgId: string,
    input: ExecuteRelationshipActionInput,
): Promise<string> {
    const existing = trim(input.selectedPersonId);
    if (existing) {
        const { data, error } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .eq("id", existing)
            .maybeSingle();
        if (error || !data?.id) throw new Error("Person not found for this organization.");
        return String(data.id);
    }

    const draft = input.createPersonDraft;
    if (!draft) throw new Error("selectedPersonId or createPersonDraft is required.");

    const validationError = validatePersonIdentityFields({
        first_name: draft.first_name,
        last_name: draft.last_name,
        email: draft.email ?? null,
        phone: draft.phone ?? null,
    });
    if (validationError) throw new Error(validationError);

    const foundOrCreated = await findOrCreatePersonInOrgWithMeta(supabase, {
        org_id: orgId,
        first_name: trim(draft.first_name),
        last_name: trim(draft.last_name),
        email: trim(draft.email) || null,
        phone: trim(draft.phone) || null,
    });
    if (foundOrCreated?.id) return foundOrCreated.id;

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: orgId,
            first_name: trim(draft.first_name),
            last_name: trim(draft.last_name),
            email: trim(draft.email) || null,
            phone: trim(draft.phone) || null,
        })
        .select("id")
        .single();
    if (error || !created?.id) throw new Error(error?.message ?? "Could not create person.");
    return String(created.id);
}

async function resolveChildPersonId(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    input: ExecuteRelationshipActionInput,
): Promise<string> {
    const existing = trim(input.selectedChildPersonId);
    if (existing) {
        const { data } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .eq("id", existing)
            .maybeSingle();
        if (!data?.id) throw new Error("Child person not found.");
        return String(data.id);
    }

    const draft = input.createChildDraft;
    if (!draft) throw new Error("selectedChildPersonId or createChildDraft is required.");

    const firstName = trim(draft.first_name);
    const lastName = trim(draft.last_name);
    if (!firstName || !lastName) throw new Error("Child first and last name are required.");

    const child = await findOrCreateChildPersonInOrg(supabase, {
        orgId,
        customerId,
        firstName,
        lastName,
        dob: trim(draft.date_of_birth) || null,
    });
    if (!child?.person_id) throw new Error("Could not create or resolve child person.");
    return child.person_id;
}

async function findCustomerMemberForChild(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    childPersonId: string,
): Promise<string | null> {
    const { data } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("person_id", childPersonId)
        .eq("relationship", "child")
        .maybeSingle();
    return data?.id ? String(data.id) : null;
}

async function ensureOpportunityCustomerMemberLink(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    customerMemberId: string,
): Promise<{ ocmId: string; created: boolean }> {
    return ensureOpportunityCustomerMemberParticipation({
        supabase,
        orgId,
        opportunityId,
        customerMemberId,
        source: "relationship_action",
    });
}

async function refreshScopedContactLinks(
    supabase: SupabaseClient,
    orgId: string,
    householdChildren: RelationshipActionHouseholdChildTarget[],
): Promise<ChildScopedContactLinkRow[]> {
    const memberRows = memberRowsFromInquiryChildren(
        householdChildren.map((child) => ({
            customer_member_id: child.customer_member_id,
            person_id: child.child_person_id,
        })),
    );
    const refreshBag: Record<string, unknown> = {};
    await attachChildScopedContactLinksToRecord(supabase, orgId, memberRows, refreshBag);
    return (refreshBag._child_scoped_contact_links ?? []) as ChildScopedContactLinkRow[];
}

function buildRefreshHint(input: ExecuteRelationshipActionInput): RelationshipActionExecutionResult["refresh_hints"] {
    if (input.sourceEntityType === "child" && input.sourceChildPersonId) {
        return { entityType: "child", entityId: input.sourceChildPersonId };
    }
    if (input.sourceEntityType === "person") {
        return { entityType: "person", entityId: input.sourceRecordId };
    }
    return { entityType: "opportunities", entityId: input.sourceRecordId };
}

/** Shared relationship action executor — routes by registry entry. */
export async function executeRelationshipAction(
    supabase: SupabaseClient,
    input: ExecuteRelationshipActionInput,
): Promise<RelationshipActionExecutionResult> {
    const orgId = trim(input.orgId);
    const customerId = trim(input.sourceCustomerId);
    const actionKey = input.actionKey;
    if (!orgId || !customerId) throw new Error("org and sourceCustomerId are required.");

    const entry = relationshipActionRegistryEntry(actionKey);
    if (!entry) throw new Error(`Unregistered relationship action: ${actionKey}`);
    if (entry.externalExecutor) {
        throw new Error(`${entry.label} uses a dedicated executor path.`);
    }
    if (!scopeAllowedForAction(entry.allowedScopes, input.scope)) {
        throw new Error(`Scope "${input.scope}" is not allowed for ${entry.label}.`);
    }

    const householdChildren = await loadHouseholdChildren(supabase, orgId, customerId);
    const anchorMemberId = trim(input.anchorCustomerMemberId);
    const memberIds = resolveRelationshipScopeMemberIds({
        scope: input.scope,
        anchorCustomerMemberId: anchorMemberId || null,
        householdChildren,
        selectedChildCustomerMemberIds: input.selectedChildCustomerMemberIds,
    });

    const activeRoleKeys = await loadRelationshipActionRoleKeys(supabase, orgId);
    const roleKey = resolveRelationshipRoleKeyForAction({
        actionKey,
        activeRoleKeys,
        requestedRoleKey: input.roleKey ?? entry.defaultRoleKey,
    });

    if (
        entry.writeTargets.includes("customer_member_contacts")
        && !roleKey
        && entry.executorKind !== "add_child"
        && entry.executorKind !== "link_child"
    ) {
        throw new Error(relationshipRoleConfigError(actionKey, entry.defaultRoleKey ?? "role"));
    }

    let personId: string | null = null;
    let childPersonId: string | null = null;
    let contactId: string | null = null;
    let customerMemberId: string | null = null;
    let linksWritten = 0;
    let linksSkippedInvalidRole = 0;
    const affectedPreview: RelationshipActionAffectedRecordPreview[] = [];

    if (entry.executorKind === "add_child" || entry.executorKind === "link_child") {
        const opportunityId = trim(input.sourceOpportunityId);
        if (entry.executorKind === "add_child" && input.scope === "this_opportunity" && !opportunityId) {
            throw new Error("Opportunity id is required to add a child to this enrollment.");
        }

        childPersonId = await resolveChildPersonId(supabase, orgId, customerId, input);
        personId = childPersonId;

        let memberId = await findCustomerMemberForChild(supabase, orgId, customerId, childPersonId);
        if (!memberId) {
            const identity: CreateLeadChildIdentity = {
                first_name: input.createChildDraft?.first_name ?? null,
                last_name: input.createChildDraft?.last_name ?? null,
                dob: input.createChildDraft?.date_of_birth ?? null,
                display_name:
                    [trim(input.createChildDraft?.first_name), trim(input.createChildDraft?.last_name)]
                        .filter(Boolean)
                        .join(" ") || childPersonId,
            };
            if (opportunityId && input.scope === "this_opportunity") {
                const participation = await applyCreateLeadChildParticipationFromIdentity(supabase, {
                    orgId,
                    opportunityId,
                    customerId,
                    identity,
                    ocm: EMPTY_CHILD_OCM,
                    existingPersonId: childPersonId,
                });
                memberId = participation.customer_member_id;
                linksWritten += 1;
                affectedPreview.push({
                    label: "Opportunity enrollment",
                    table: "process_instances",
                    record_ids: participation.process_instance_id ? [participation.process_instance_id] : [],
                });
            } else {
                const { data: cm, error } = await supabase
                    .from("customer_members")
                    .insert({
                        org_id: orgId,
                        customer_id: customerId,
                        person_id: childPersonId,
                        display_name: identity.display_name,
                        first_name: identity.first_name,
                        last_name: identity.last_name,
                        dob: identity.dob,
                        relationship: "child",
                        is_active: true,
                        metadata: { source: "relationship_action" },
                    })
                    .select("id")
                    .single();
                if (error?.code === "23505") {
                    memberId = await findCustomerMemberForChild(supabase, orgId, customerId, childPersonId);
                } else if (error || !cm) {
                    throw new Error(error?.message ?? "Could not create customer member for child.");
                } else {
                    memberId = String((cm as { id: string }).id);
                    linksWritten += 1;
                }
                affectedPreview.push({ label: "Household child member", table: "customer_members", record_ids: memberId ? [memberId] : [] });
            }
        } else if (
            opportunityId
            && input.scope === "this_opportunity"
            // The bridge is written only by actions that DECLARE it. `add_child` no longer does:
            // its participation owner is `process_instances`, and this branch was the last place
            // the removed OCM bridge could still be created behind a stale declaration.
            // `link_existing_child` keeps it, and keeps saying so.
            && entry.writeTargets.includes("opportunity_customer_members")
        ) {
            const ocmLink = await ensureOpportunityCustomerMemberLink(
                supabase,
                orgId,
                opportunityId,
                memberId,
            );
            if (ocmLink.created) {
                linksWritten += 1;
                affectedPreview.push({
                    label: "Opportunity enrollment",
                    table: "opportunity_customer_members",
                    record_ids: [ocmLink.ocmId],
                });
            }
        }
        customerMemberId = memberId;
    } else {
        personId = await resolvePersonId(supabase, orgId, input);
        contactId = await ensureContactForPerson(supabase, { orgId, customerId, personId });

        if (entry.writeTargets.includes("customer_persons") && roleKey) {
            await ensureCustomerPersonRoleLink(supabase, {
                orgId,
                customerId,
                personId,
                roleType: roleKey,
            });
            linksWritten += 1;
            affectedPreview.push({ label: "Household adult role", table: "customer_persons" });
        }

        const opportunityId = trim(input.sourceOpportunityId);
        if (
            entry.writeTargets.includes("opportunity_persons")
            && opportunityId
            && roleKey
            && (input.scope === "this_opportunity" || input.scope === "household")
        ) {
            await ensureOpportunityPersonExplicitRole(supabase, {
                orgId,
                opportunityId,
                personId,
                roleType: roleKey,
                metadata: { source: "relationship_action" },
            });
            linksWritten += 1;
            affectedPreview.push({ label: "Opportunity contact role", table: "opportunity_persons" });
        }

        const writeChildMemberRoles =
            Boolean(roleKey)
            && memberIds.length > 0
            && (
                shouldWriteChildScopedRelationshipsToPcr({ executorKind: entry.executorKind, roleKey, actionKey })
                || entry.writeTargets.includes("customer_member_contacts")
            );

        if (writeChildMemberRoles) {
            const assignments: ChildScopedContactAssignment[] = memberIds.map((id) => ({
                customer_member_id: id,
                person_id: personId!,
                role_key: roleKey!,
                source: "explicit_child",
            }));
            if (shouldWriteChildScopedRelationshipsToPcr({ executorKind: entry.executorKind, roleKey, actionKey })) {
                const pcrWrite = await applyCanonicalChildScopedRelationships(supabase, {
                    orgId,
                    customerId,
                    assignments,
                });
                linksWritten += pcrWrite.roles_written;
                linksSkippedInvalidRole += pcrWrite.skipped;
                if (pcrWrite.skipped > 0 && pcrWrite.roles_written === 0) {
                    throw new Error(relationshipRoleConfigError(actionKey, entry.defaultRoleKey ?? "role"));
                }
                affectedPreview.push({
                    label: "Person ↔ Child relationships",
                    table: "person_child_relationships",
                    record_ids: memberIds,
                });
            } else {
                const writeResult = await applyChildScopedContactAssignments(supabase, {
                    orgId,
                    customerId,
                    assignments,
                });
                linksWritten += writeResult.links_written;
                linksSkippedInvalidRole += writeResult.links_skipped_invalid_role;
                if (writeResult.links_skipped_invalid_role > 0 && writeResult.links_written === 0) {
                    throw new Error(relationshipRoleConfigError(actionKey, entry.defaultRoleKey ?? "role"));
                }
                affectedPreview.push({
                    label: "Child-scoped contact links",
                    table: "customer_member_contacts",
                    record_ids: memberIds,
                });
            }
        }
    }

    const scopedLinks = await refreshScopedContactLinks(supabase, orgId, householdChildren);
    const memberChildIds = new Map(
        householdChildren.map((child) => [child.customer_member_id, child.child_person_id]),
    );
    const personChildRelationshipsByMember = await attachPersonChildRelationshipsToEntityRecord({
        supabase,
        orgId,
        customerId,
        customerMemberIds: memberIds.length > 0 ? memberIds : householdChildren.map((c) => c.customer_member_id),
        memberChildIds,
    });
    const affectedChildren = resolveRelationshipScopeTargets({
        scope: input.scope,
        anchorCustomerMemberId: anchorMemberId || null,
        householdChildren,
        selectedChildCustomerMemberIds: input.selectedChildCustomerMemberIds,
    });

    try {
        await emitRelationshipActionEvent({
            orgId,
            customerId,
            request: input,
            personId,
            contactId,
            roleKey,
            customerMemberIds: memberIds,
            linksWritten,
            actorUserId: input.actorUserId ?? null,
        });
    } catch (eventErr) {
        console.error("[relationship_action] workflow event emit failed", eventErr);
    }

    return {
        ok: true,
        actionKey,
        role_key: roleKey,
        person_id: personId,
        child_person_id: childPersonId,
        contact_id: contactId,
        customer_member_id: customerMemberId,
        links_written: linksWritten,
        links_skipped_invalid_role: linksSkippedInvalidRole,
        affected_children: affectedChildren,
        affected_record_preview: affectedPreview,
        scoped_contact_links: scopedLinks,
        person_child_relationships_by_member: personChildRelationshipsByMember,
        refresh_hints: buildRefreshHint(input),
    };
}
