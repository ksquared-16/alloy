import { resolveInquiryChildIdentityFields } from "@/lib/admin/drawer/inquiryChildrenHydration";
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
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";
import {
    documentActorFromAdminParts,
    projectResolvedProfilePhotosOntoRows,
} from "@/lib/documents/projectPersonProfilePhotos";
import { DURABLE_CHILD_ROWS_KEY } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import {
    durableChildCollectionRow,
    type DurableChildSubject,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

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

    /*
     * THE CANONICAL PROFILE PHOTO, resolved through the platform's one projection.
     *
     * The person payload above does not carry a presentable photo URL — durable truth is a document
     * reference (`persons.metadata.profile_photo_document_id`), and only the projection may mint the
     * actor-scoped URL for it. Without this the configured Children card fell back to initials on a
     * child whose photo every other host shows, which reads as "no photo exists" — a different and
     * wronger statement than "this host did not resolve it".
     *
     * The admin service actor is used deliberately: this composer already runs behind the admin
     * route gate, and the same projection under the same actor is what the queue page rows resolve.
     */
    let resolvedPhotoUrl: string | null = null;
    if (personId) {
        const photoRows = await projectResolvedProfilePhotosOntoRows({
            supabase,
            orgId,
            actor: documentActorFromAdminParts({ ok: true, orgId, role: "admin", roleKeys: ["admin"], permissionKeys: [] }),
            rows: [{ person_id: personId }] as Record<string, unknown>[],
        }).catch(() => null);
        const url = photoRows?.[0]?.resolved_photo_url;
        resolvedPhotoUrl = typeof url === "string" && url.trim() ? url : null;
    }

    /*
     * THE CHILD'S OWN PROFILE SCALARS.
     *
     * Gender, allergies, medical notes, special instructions and preferred name are not columns on
     * `customer_members` — they are configured field values, and `loadCustomerMemberProfileFieldsByMemberId`
     * is the canonical reader the member's own GET route already uses. Composing without them left
     * the durable record able to name the child and nothing else, so the canonical Children card
     * rendered its configured medical rows as permanently unset. That read as "this child has no
     * allergies recorded", which is a different and more dangerous statement than "this host did not
     * fetch them".
     *
     * A read failure is not fatal, for the same reason the person enrichment above is not: the child
     * is still identifiable, and refusing the record over an optional enrichment is the queue-scoped
     * mistake in a new place.
     */
    const profile =
        (await loadCustomerMemberProfileFieldsByMemberId(supabase, orgId, [id]).catch(() => null))?.get(id)
        ?? null;

    /*
     * LAW 34 — for a person-backed child, `persons` owns intrinsic identity; the member row is the
     * fallback only while no Person exists. Resolved through the SHARED authority
     * (`resolveInquiryChildIdentityFields`) so this surface cannot drift from the drawer record,
     * Records, or the placement projection. "Child" is the last resort and means the data is wrong.
     */
    const identity = resolveInquiryChildIdentityFields({
        personId,
        person: personId && personRecord
            ? {
                  first_name: trimOrNull(personRecord.first_name),
                  last_name: trimOrNull(personRecord.last_name),
                  full_name: trimOrNull(personRecord.full_name),
                  date_of_birth: trimOrNull(personRecord.date_of_birth),
              }
            : null,
        member: {
            first_name: member.first_name,
            last_name: member.last_name,
            display_name: member.display_name,
            dob: member.dob,
        },
    });
    const label =
        trimOrNull(identity.display_name)
        ?? trimOrNull([identity.first_name, identity.last_name].filter(Boolean).join(" "))
        ?? "Child";

    // Member facts last for PARTICIPATION keys (relationship, active, status, profile) — those the
    // membership genuinely owns. Identity keys are resolved above and are NOT overridden here:
    // treating the member as the winner on a shared identity key is what made it a second writable
    // identity authority, which law 34 forbids.
    const truth: Record<string, unknown> = {
        ...(personRecord ?? {}),
        customer_member_id: member.id,
        person_id: personId,
        customer_id: householdId,
        // Identity from the canonical owner (law 34); the member row supplies it only when personless.
        display_name: identity.display_name,
        first_name: identity.first_name,
        last_name: identity.last_name,
        dob: identity.dob,
        relationship: trimOrNull(member.relationship),
        is_active: member.is_active !== false,
        status_key: trimOrNull(member.status_key),
        preferred_name: trimOrNull(profile?.preferred_name),
        gender: trimOrNull(profile?.gender),
        allergies: trimOrNull(profile?.allergies),
        medical_notes: trimOrNull(profile?.medical_notes),
        special_instructions: trimOrNull(profile?.special_instructions),
        _household_name: householdName,
        _child_identity_source: personRecord ? "member+person" : "member",
        // The one key the photo adapters trust by PROVENANCE. Null is omitted rather than written:
        // an explicit null would overwrite a value a wider person payload legitimately carried.
        ...(resolvedPhotoUrl ? { resolved_photo_url: resolvedPhotoUrl } : {}),
    };

    const subject: DurableChildSubject = {
        memberId: String(member.id),
        personId,
        householdId,
        label,
        dateOfBirth: trimOrNull(member.dob),
        householdName,
        isActive: member.is_active !== false,
        truth,
    };

    /*
     * THE CANONICAL CHILD CARD'S COLLECTION, COMPOSED SERVER-SIDE.
     *
     * The card that answers "who is this child" is a collection card, so the subject has to appear
     * in its own collection for the card to compose at all. Writing that here rather than in a host
     * is what makes every host agree: the Operations overlay and the record panel render the same
     * card because they are handed the same truth, not because two components were written to match.
     *
     * Under `_durable_child_rows`, never `_inquiry_children`. Both would render identically today,
     * and the second would tell every later reader — a roster count, a stage projection, a tuition
     * estimate — that this child sits on an inquiry when no inquiry exists.
     */
    truth[DURABLE_CHILD_ROWS_KEY] = [durableChildCollectionRow(subject)];

    return { ok: true, subject };
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
