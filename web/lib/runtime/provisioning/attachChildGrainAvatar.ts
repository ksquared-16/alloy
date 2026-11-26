/**
 * CHILD-GRAIN QUEUE AVATARS — one batched resolution over the whole row set.
 *
 * The Work View path builds its rows through `childQueueRowContext`, which never carried an avatar,
 * while `QueueService`'s OCM-vintage `buildChildGrainQueueRowContext` did. Same product placement,
 * two builders, one of them blind — so Firefly's Waitlist showed initials for children who have a
 * durable Person photo (R-019).
 *
 * Ownership is unchanged and not re-invented here:
 *
 *     customer_members.id → customer_members.person_id → persons.metadata.profile_photo_document_id
 *       → projectResolvedProfilePhotosOntoRows (authorized, request-scoped)
 *       → row.avatarImageUrl → row_subject.image_url
 *
 * Modelled on `attachChildGrainInquiryProgramFallback`: one `customer_members` read for the member
 * ids on the page, then ONE batched photo projection. Never a request per row.
 *
 * The minted URL is short-lived by design and is presentation data only — nothing is written back,
 * and no signed URL becomes durable truth. A missing person, a photoless person, or an
 * unauthorized/absent actor all resolve the same way: the row stays valid with no image, and the
 * presentation falls back to initials.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocumentActor } from "@/lib/documents/assertDocumentAccess";
import { projectResolvedProfilePhotosOntoRows } from "@/lib/documents/projectPersonProfilePhotos";
import { resolveIdentityPhotoUrlFromRaw } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";
import type { ChildProvisioningRowWithPlacement } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";

/** A child row that has been offered an avatar. Absent stays absent — never an empty string. */
export type ChildProvisioningRowWithAvatar = ChildProvisioningRowWithPlacement & {
    avatarImageUrl?: string | null;
};

function str(value: unknown): string | null {
    const text = value == null ? "" : String(value).trim();
    return text.length > 0 ? text : null;
}

export async function attachChildGrainAvatar(params: {
    supabase: SupabaseClient;
    orgId: string;
    actor: DocumentActor | null | undefined;
    childRows: readonly ChildProvisioningRowWithPlacement[];
}): Promise<ChildProvisioningRowWithAvatar[]> {
    const rows: ChildProvisioningRowWithAvatar[] = params.childRows.map((r) => ({ ...r }));
    // No actor means no authorization to mint a URL. That is a valid answer, not a failure.
    if (!rows.length || !params.actor?.ok) return rows;

    const memberIds = [
        ...new Set(rows.map((r) => str(r.subjectId)).filter((id): id is string => Boolean(id))),
    ];
    if (!memberIds.length) return rows;

    try {
        const { data: members } = await params.supabase
            .from("customer_members")
            .select("id, person_id")
            .eq("org_id", params.orgId)
            .in("id", memberIds);

        const personIdByMember = new Map<string, string>();
        for (const raw of (members ?? []) as Array<Record<string, unknown>>) {
            const id = str(raw.id);
            const personId = str(raw.person_id);
            // `person_id` is nullable by design — a child may have no durable Person row.
            if (id && personId) personIdByMember.set(id, personId);
        }
        if (personIdByMember.size === 0) return rows;

        // ONE projection for every child on the page, keyed by person.
        const carriers = [...new Set(personIdByMember.values())].map((person_id) => ({ person_id }));
        const projected = await projectResolvedProfilePhotosOntoRows({
            supabase: params.supabase,
            orgId: params.orgId,
            actor: params.actor,
            rows: carriers,
        });

        const urlByPerson = new Map<string, string>();
        for (const carrier of projected) {
            const personId = str(carrier.person_id);
            // Read through the ONE canonical adapter — it decides what is presentable.
            const url = resolveIdentityPhotoUrlFromRaw(carrier as Record<string, unknown>);
            if (personId && url) urlByPerson.set(personId, url);
        }

        for (const row of rows) {
            const memberId = str(row.subjectId);
            const personId = memberId ? personIdByMember.get(memberId) : null;
            const url = personId ? urlByPerson.get(personId) : null;
            // Each row answers only for its own child — the map is keyed by that child's person.
            if (url) row.avatarImageUrl = url;
        }
        return rows;
    } catch {
        // Avatars are presentation. A read failure must never cost the operator their queue.
        return rows;
    }
}
