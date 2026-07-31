/**
 * Canonical child/person profile photo resolution.
 *
 * `persons` has no dedicated `photo_document_id` / `avatar_document_id` column and this
 * change does not add one (no migration). Instead the canonical photo reference lives in
 * two places, checked in order:
 *
 *   1. `persons.metadata.profile_photo_document_id` — set once an operator explicitly
 *      chooses/uploads a photo (see `PATCH /api/admin/persons/[id]` `metadata` merge and
 *      `POST /api/admin/persons/[id]/profile-photo`).
 *   2. The LATEST `documents` row for that person with `doc_type = 'profile_photo'` —
 *      "mark latest as canonical" fallback for photos uploaded before a pointer existed
 *      (e.g. via the Surface Builder composer's upload-only flow).
 *
 * The selection logic below is pure and unit-tested without any Supabase/storage IO;
 * `findCanonicalProfilePhotoDocumentForPerson` is the thin async wrapper that queries
 * `documents`, used by the profile-photo API route. It deliberately does NOT sign —
 * signing happens in the route, after authorization.
 */

import type { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveIdentityPhotoUrlFromMetadata } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";

export type ProfilePhotoDocumentRow = {
    id: string;
    entity_type: string | null;
    entity_id: string | null;
    doc_type: string | null;
    created_at: string | null;
    bucket?: string | null;
    storage_path?: string | null;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/** Profile-photo documents for one person, newest first (pure — no IO). */
export function profilePhotoDocumentsForPerson(
    personId: string,
    documents: readonly ProfilePhotoDocumentRow[],
): ProfilePhotoDocumentRow[] {
    const id = personId.trim();
    if (!id) return [];
    return documents
        .filter((d) => d.entity_type === "person" && d.entity_id === id && d.doc_type === "profile_photo")
        .slice()
        .sort((a, b) => {
            const at = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
            return bt - at;
        });
}

/** The canonical (latest) profile-photo document for a person, or null. Pure — no IO. */
export function selectCanonicalProfilePhotoDocument(
    personId: string,
    documents: readonly ProfilePhotoDocumentRow[],
): ProfilePhotoDocumentRow | null {
    return profilePhotoDocumentsForPerson(personId, documents)[0] ?? null;
}

export type PersonPhotoReference = {
    /** The document id backing the resolved photo, when known. */
    documentId: string | null;
    /** An already-resolved, ready-to-render URL — present only when `metadata` carries one. */
    photoUrl: string | null;
};

/**
 * Resolve the canonical photo reference for a person from already-fetched evidence
 * (person metadata + a candidate documents set). Pure — no IO, no signed-URL calls.
 *
 * Priority: an explicit URL already cached on `metadata` (existing evidence-model
 * convention — `photo_url` / `avatar_url` / etc.) wins; otherwise fall back to the
 * canonical (latest) `profile_photo` document, if any.
 */
export function resolvePersonPhotoReference(
    personId: string,
    personMetadata: unknown,
    documents: readonly ProfilePhotoDocumentRow[],
): PersonPhotoReference {
    const meta =
        personMetadata && typeof personMetadata === "object" && !Array.isArray(personMetadata)
            ? (personMetadata as Record<string, unknown>)
            : {};
    const pointerDocumentId = trimOrNull(meta.profile_photo_document_id);
    const cachedUrl = resolveIdentityPhotoUrlFromMetadata(meta);
    if (cachedUrl) {
        return { documentId: pointerDocumentId, photoUrl: cachedUrl };
    }
    const latest = selectCanonicalProfilePhotoDocument(personId, documents);
    return { documentId: pointerDocumentId ?? latest?.id ?? null, photoUrl: null };
}

type AdminSupabase = ReturnType<typeof createAdminClient>;

/**
 * Find the canonical profile-photo document for a person. QUERY ONLY — it does
 * not sign.
 *
 * This used to resolve AND sign in one step, with a seven-day expiry, and the
 * caller authorized only afterwards. Both halves of that were wrong: the URL was
 * minted before the access decision, and a seven-day credential outlives the
 * authorization it was minted under — the same defect the profile-photo cache
 * correction removed elsewhere.
 *
 * Signing is now the caller's step, taken AFTER `assertDocumentAccess` and with
 * `signedUrlExpirySeconds`, which is capped at 15 minutes.
 */
export async function findCanonicalProfilePhotoDocumentForPerson(
    supabase: AdminSupabase,
    orgId: string,
    personId: string,
): Promise<ProfilePhotoDocumentRow | null> {
    const id = personId.trim();
    if (!id) return null;

    const { data: rows } = await supabase
        .from("documents")
        .select("id, entity_type, entity_id, doc_type, created_at, bucket, storage_path")
        .eq("org_id", orgId)
        .eq("entity_type", "person")
        .eq("entity_id", id)
        .eq("doc_type", "profile_photo")
        .order("created_at", { ascending: false })
        .limit(1);

    const doc = (rows as ProfilePhotoDocumentRow[] | null)?.[0] ?? null;
    if (!doc?.bucket || !doc.storage_path) return null;

    return doc;
}
