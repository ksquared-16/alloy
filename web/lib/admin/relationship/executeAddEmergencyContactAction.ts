import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelationshipActionScope } from "@/lib/admin/relationship/relationshipActionContract";
import { executeRelationshipAction } from "@/lib/admin/relationship/executeRelationshipAction";

function trim(value: unknown): string {
    return value != null ? String(value).trim() : "";
}

/** Legacy emergency-contact request shape (maps to unified executor). */
export type AddEmergencyContactActionRequest = {
    customer_id: string;
    anchor_customer_member_id: string;
    scope: RelationshipActionScope;
    selected_customer_member_ids?: string[];
    person_id?: string;
    create_person?: {
        first_name: string;
        last_name: string;
        email?: string;
        phone?: string;
    };
    source_context?: string | null;
    source_record_id?: string;
    source_child_person_id?: string;
};

export type AddEmergencyContactActionResult = {
    ok: true;
    person_id: string;
    contact_id: string | null;
    role_key: string | null;
    links_written: number;
    links_skipped_invalid_role: number;
    affected_children: Array<{
        customer_member_id: string;
        child_person_id: string | null;
        display_name: string;
    }>;
    scoped_contact_links: import("@/lib/admin/person/personDrawerVisibilityTypes").ChildScopedContactLinkRow[];
};

export type ExecuteAddEmergencyContactActionInput = AddEmergencyContactActionRequest & {
    orgId: string;
    actorUserId?: string | null;
};

/** @deprecated Prefer executeRelationshipAction with actionKey add_emergency_contact. */
export async function executeAddEmergencyContactAction(
    supabase: SupabaseClient,
    input: ExecuteAddEmergencyContactActionInput,
): Promise<AddEmergencyContactActionResult> {
    const result = await executeRelationshipAction(supabase, {
        actionKey: "add_emergency_contact",
        sourceSurface: "child_drawer",
        sourceRecordId: trim(input.source_record_id) || trim(input.source_child_person_id) || trim(input.anchor_customer_member_id),
        sourceEntityType: "child",
        sourceChildPersonId: trim(input.source_child_person_id) || null,
        sourceCustomerId: trim(input.customer_id),
        anchorCustomerMemberId: trim(input.anchor_customer_member_id),
        selectedPersonId: trim(input.person_id) || undefined,
        createPersonDraft: input.create_person,
        scope: input.scope,
        selectedChildCustomerMemberIds: input.selected_customer_member_ids,
        confirmationRequired: true,
        orgId: input.orgId,
        actorUserId: input.actorUserId ?? null,
    });

    return {
        ok: true,
        person_id: result.person_id ?? "",
        contact_id: result.contact_id,
        role_key: result.role_key,
        links_written: result.links_written,
        links_skipped_invalid_role: result.links_skipped_invalid_role,
        affected_children: result.affected_children,
        scoped_contact_links: result.scoped_contact_links,
    };
}
