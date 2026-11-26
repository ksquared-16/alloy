/**
 * Work-Unit session preview for child avatars.
 * Survives Focus Panel remounts when composer context is absent (live drawer),
 * until `_inquiry_children` evidence catches up with `photo_url`.
 *
 * Only durable (non-`blob:`) URLs may be stored. Object-URL previews are
 * component-local — writing them here leaves dead links after revoke/remount
 * (initials + Change/Remove, or a fall-through to Add photo).
 */

const previews = new Map<string, string>();

function trimId(value: string | null | undefined): string | null {
    const text = (value ?? "").trim();
    return text.length > 0 ? text : null;
}

function isDurablePhotoUrl(url: string): boolean {
    return !url.startsWith("blob:");
}

export function getChildAvatarSessionPreview(childId: string | null | undefined): string | null {
    const id = trimId(childId);
    if (!id) return null;
    const hit = previews.get(id) ?? null;
    // Drop stale blob entries left by older builds.
    if (hit && !isDurablePhotoUrl(hit)) {
        previews.delete(id);
        return null;
    }
    return hit;
}

export function setChildAvatarSessionPreview(
    childId: string | null | undefined,
    url: string | null | undefined,
): void {
    const id = trimId(childId);
    if (!id) return;
    const next = (url ?? "").trim();
    if (!next) {
        previews.delete(id);
        return;
    }
    if (!isDurablePhotoUrl(next)) return;
    previews.set(id, next);
}

/** Clear any session keys still pointing at a revoked object URL. */
export function clearChildAvatarSessionPreviewMatchingUrl(url: string | null | undefined): void {
    const target = (url ?? "").trim();
    if (!target) return;
    for (const [id, stored] of previews) {
        if (stored === target) previews.delete(id);
    }
}

/** Test seam — allows seeding legacy blob entries to assert getter scrub. */
export function seedChildAvatarSessionPreviewForTests(
    childId: string | null | undefined,
    url: string,
): void {
    const id = trimId(childId);
    if (!id) return;
    previews.set(id, url);
}

/** Test seam. */
export function clearChildAvatarSessionPreviews(): void {
    previews.clear();
}

/**
 * Display URL for a child avatar: evidence first, then session preview under any
 * known id (inquiry child / person / customer_member). Used so Context↔Summary
 * remounts keep a just-saved photo before `_inquiry_children` catches up.
 */
export function resolveChildDisplayImageUrl(args: {
    imageUrl?: string | null;
    childId?: string | null;
    personId?: string | null;
    customerMemberId?: string | null;
}): string | null {
    const evidence = (args.imageUrl ?? "").trim();
    if (evidence) return evidence;
    return (
        getChildAvatarSessionPreview(args.childId)
        ?? getChildAvatarSessionPreview(args.personId)
        ?? getChildAvatarSessionPreview(args.customerMemberId)
    );
}
