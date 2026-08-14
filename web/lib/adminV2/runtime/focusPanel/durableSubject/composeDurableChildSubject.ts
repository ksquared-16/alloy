import "server-only";

/**
 * DURABLE CHILD SUBJECT — the server composition.
 *
 * Opens a child from its `customer_members` row alone. No Opportunity, no enrollment
 * `process_instances` row, no active Work Unit — and none of them is created as a side effect. The
 * three cases that must all work:
 *
 *   1. enrollment completed and the case left the active queue   → member row still there
 *   2. household child that never entered an enrollment process  → member row still there
 *   3. active enrollment                                         → member row still there
 *
 * The member row is the invariant, which is exactly why it is the identity of record.
 *
 * ── PERSON IS ENRICHMENT, NOT A PRECONDITION ──
 *
 * `customer_members.person_id` is nullable. When present, the canonical person payload
 * (`buildPersonDrawerEntityPayloadForViewModel`, the same composer Person and the child drawer VM
 * both use) is merged UNDER the member's own facts — the member wins on any identity field, because
 * a child's name and DOB as recorded on the membership are what the operator maintains. When absent,
 * the member row alone is a complete answer, and nothing degrades.
 *
 * A person read failure is likewise not fatal: the child is still identifiable without it, and
 * refusing the record because an optional enrichment failed would be the queue-scoped mistake in a
 * new place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { buildPersonDrawerEntityPayloadForViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerEntityPayloadForViewModel";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

export type ComposeDurableChildSubjectResult =
    | { ok: true; subject: DurableChildSubject }
    | { ok: false; reason: "not_found" };

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

type MemberRow = {
    id?: string | null;
    person_id?: string | null;
    customer_id?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    relationship?: string | null;
    is_active?: boolean | null;
    status_key?: string | null;
};

export async function composeDurableChildSubject(
    supabase: SupabaseClient,
    orgId: string,
    memberId: string,
    dimensions?: AdminAccessScopeDimensions | null,
): Promise<ComposeDurableChildSubjectResult> {
    const id = memberId.trim();
    if (!id) return { ok: false, reason: "not_found" };

    const { data, error } = await supabase
        .from("customer_members")
        .select("id, person_id, customer_id, display_name, first_name, last_name, dob, relationship, is_active, status_key")
        .eq("org_id", orgId)
        .eq("id", id)
        .limit(1);
    if (error) throw new Error(error.message);

    const member = (data ?? [])[0] as MemberRow | undefined;
    if (!member?.id) return { ok: false, reason: "not_found" };

    const personId = trimOrNull(member.person_id);
    const householdId = trimOrNull(member.customer_id);

    // Optional enrichment. A failure here must not cost the operator the record.
    let personRecord: Record<string, unknown> | null = null;
    if (personId) {
        const payload = await buildPersonDrawerEntityPayloadForViewModel(
            supabase,
            orgId,
            personId,
            dimensions ?? null,
            "full",
        ).catch(() => null);
        if (payload?.ok) personRecord = payload.record;
    }

    const householdName = householdId ? await householdNameFor(supabase, orgId, householdId) : null;

    // `display_name` is NOT NULL in the schema, so the name parts are a defence against whitespace,
    // not a real second source. "Child" is the last resort and means the data is wrong, not absent.
    const label =
        trimOrNull(member.display_name)
        ?? trimOrNull([trimOrNull(member.first_name), trimOrNull(member.last_name)].filter(Boolean).join(" "))
        ?? "Child";

    // Member facts LAST: they override the person payload on any shared identity key, because the
    // membership is what the operator maintains for a child.
    const truth: Record<string, unknown> = {
        ...(personRecord ?? {}),
        customer_member_id: member.id,
        person_id: personId,
        customer_id: householdId,
        display_name: trimOrNull(member.display_name),
        first_name: trimOrNull(member.first_name),
        last_name: trimOrNull(member.last_name),
        dob: trimOrNull(member.dob),
        relationship: trimOrNull(member.relationship),
        is_active: member.is_active !== false,
        status_key: trimOrNull(member.status_key),
        _household_name: householdName,
        _child_identity_source: personRecord ? "member+person" : "member",
    };

    return {
        ok: true,
        subject: {
            memberId: String(member.id),
            personId,
            householdId,
            label,
            dateOfBirth: trimOrNull(member.dob),
            householdName,
            isActive: member.is_active !== false,
            truth,
        },
    };
}

async function householdNameFor(
    supabase: SupabaseClient,
    orgId: string,
    householdId: string,
): Promise<string | null> {
    const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("id", householdId)
        .limit(1);
    const row = (data ?? [])[0] as { name?: string | null } | undefined;
    return trimOrNull(row?.name);
}
