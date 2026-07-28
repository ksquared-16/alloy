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
 * `resolveLatestProfilePhotoDocumentForPerson` is the thin async wrapper that actually
 * queries `documents` + signs a URL, used by the profile-photo API route.
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

const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days — long enough to survive between edits.

/**
 * Async wrapper: resolve + sign the canonical profile photo URL for a person, querying
 * `documents` directly (not the HTTP layer) so it can be reused by API routes and by
 * batch truth-hydration call sites without a network round-trip.
 */
export async function resolveLatestProfilePhotoDocumentForPerson(
    supabase: AdminSupabase,
    orgId: string,
    personId: string,
): Promise<{ documentId: string; photoUrl: string } | null> {
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

    const { data: signed, error } = await supabase.storage
        .from(doc.bucket)
        .createSignedUrl(doc.storage_path, SIGNED_URL_EXPIRES_IN_SECONDS);
    if (error || !signed?.signedUrl) return null;

    return { documentId: doc.id, photoUrl: signed.signedUrl };
}
