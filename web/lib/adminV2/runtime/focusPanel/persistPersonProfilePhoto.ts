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

export type ResolvePersonIdForProfilePhotoResult =
    | { ok: true; personId: string }
    | { ok: false; error: string };

function trimId(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/**
 * Resolve the person id required for canonical profile-photo storage.
 * Prefer an explicit personId; otherwise resolve/ensure from customer_member.
 */
export async function resolvePersonIdForProfilePhoto(args: {
    personId?: string | null;
    customerMemberId?: string | null;
}): Promise<ResolvePersonIdForProfilePhotoResult> {
    const direct = trimId(args.personId);
    if (direct) return { ok: true, personId: direct };

    const memberId = trimId(args.customerMemberId);
    if (!memberId) {
        return { ok: false, error: "Link a person record before uploading a profile photo." };
    }

    const getRes = await fetch(`/api/admin/customer-members/${encodeURIComponent(memberId)}`, {
        credentials: "include",
    });
    if (getRes.ok) {
        const json = (await getRes.json().catch(() => ({}))) as { person_id?: unknown };
        const fromMember = trimId(json.person_id);
        if (fromMember) return { ok: true, personId: fromMember };
    }

    const ensureRes = await fetch(
        `/api/admin/customer-members/${encodeURIComponent(memberId)}/ensure-person`,
        { method: "POST", credentials: "include" },
    );
    const ensureJson = (await ensureRes.json().catch(() => ({}))) as {
        person_id?: unknown;
        error?: string;
    };
    const ensured = trimId(ensureJson.person_id);
    if (!ensureRes.ok || !ensured) {
        return {
            ok: false,
            error: ensureJson.error ?? "Could not link a person record for this child.",
        };
    }
    return { ok: true, personId: ensured };
}

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

    const uploadRes = await fetch("/api/admin/documents/upload", {
        method: "POST",
        credentials: "include",
        body,
    });
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
