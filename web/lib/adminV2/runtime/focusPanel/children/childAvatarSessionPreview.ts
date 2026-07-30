/**
 * Work-Unit session preview for child avatars.
 * Survives Focus Panel remounts when composer context is absent (live drawer),
 * until `_inquiry_children` evidence catches up with `photo_url`.
 */

const previews = new Map<string, string>();

function trimId(value: string | null | undefined): string | null {
    const text = (value ?? "").trim();
    return text.length > 0 ? text : null;
}

export function getChildAvatarSessionPreview(childId: string | null | undefined): string | null {
    const id = trimId(childId);
    if (!id) return null;
    return previews.get(id) ?? null;
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
    previews.set(id, next);
}

/** Test seam. */
export function clearChildAvatarSessionPreviews(): void {
    previews.clear();
}
