/**
 * Shared Surfaces → Runtime profile-photo persistence.
 * Documents upload (`entity_type=person`, `doc_type=profile_photo`) then bind via
 * `/api/admin/persons/:id/profile-photo` → `persons.metadata.profile_photo_document_id` + `photo_url`.
 */

export type PersistPersonProfilePhotoResult =
    | { ok: true; photoUrl: string; documentId: string }
    | { ok: false; error: string };

export type ClearPersonProfilePhotoResult =
    | { ok: true; photoUrl: null }
    | { ok: false; error: string };

/** Upload image bytes into documents storage for a person. Does not bind canonical metadata. */
export async function uploadPersonProfilePhotoDocument(args: {
    personId: string;
    file: File;
    title: string;
}): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
    const body = new FormData();
    body.append("file", args.file);
    body.append("entity_type", "person");
    body.append("entity_id", args.personId);
    body.append("doc_type", "profile_photo");
    body.append("title", args.title);

    const uploadRes = await fetch("/api/admin/documents/upload", { method: "POST", body });
    if (!uploadRes.ok) return { ok: false, error: "Upload failed" };
    const payload = (await uploadRes.json()) as { document?: { id?: string } };
    const documentId = payload.document?.id?.trim();
    if (!documentId) return { ok: false, error: "Upload response missing document id" };
    return { ok: true, documentId };
}

/** Bind an uploaded document as the person's canonical profile photo. */
export async function bindPersonProfilePhoto(args: {
    personId: string;
    documentId: string;
}): Promise<PersistPersonProfilePhotoResult> {
    const res = await fetch(`/api/admin/persons/${encodeURIComponent(args.personId)}/profile-photo`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: args.documentId }),
    });
    const json = (await res.json().catch(() => ({}))) as { photoUrl?: string; error?: string };
    if (!res.ok || !json.photoUrl) {
        return { ok: false, error: json.error ?? "Could not save photo" };
    }
    return { ok: true, photoUrl: json.photoUrl, documentId: args.documentId };
}

/** Upload + bind in one step (canonical Surfaces → Runtime path). */
export async function uploadAndBindPersonProfilePhoto(args: {
    personId: string;
    file: File;
    title: string;
}): Promise<PersistPersonProfilePhotoResult> {
    const uploaded = await uploadPersonProfilePhotoDocument(args);
    if (!uploaded.ok) return uploaded;
    return bindPersonProfilePhoto({ personId: args.personId, documentId: uploaded.documentId });
}

export async function clearPersonProfilePhoto(args: {
    personId: string;
}): Promise<ClearPersonProfilePhotoResult> {
    const res = await fetch(`/api/admin/persons/${encodeURIComponent(args.personId)}/profile-photo`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: json.error ?? "Could not remove photo" };
    }
    return { ok: true, photoUrl: null };
}

/**
 * Surfaces avatar display contract: showAvatar gates render; useProfilePhotos gates
 * whether a photo URL is shown (initials otherwise). Upload is allowed whenever the
 * avatar region is visible and the card is editable — not gated on useProfilePhotos.
 */
export function resolveSurfaceAvatarRuntime(args: {
    showAvatar: boolean;
    useProfilePhotos: boolean;
    imageUrl: string | null | undefined;
}): { visible: boolean; imageUrl: string | null } {
    if (!args.showAvatar) return { visible: false, imageUrl: null };
    return {
        visible: true,
        imageUrl: args.useProfilePhotos ? args.imageUrl ?? null : null,
    };
}
