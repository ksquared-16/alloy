/**
 * AdminV2 entity drawer loading phases (conceptual):
 * - **initial**: no row yet — shell may show spinner/skeleton (`loading` true).
 * - **visible**: row matches open entity — render content; background refetch must not flip `loading`.
 * - **hydrating**: silent updates (refetch, merge); no blocking chrome.
 *
 * Data fetching URLs and payloads are unchanged; this only gates whether the global drawer `loading` flag is set during refetch.
 */
export function adminEntityRefetchShouldBlockDrawerShell(
    error: string | null | undefined,
    data: Record<string, unknown> | null,
    drawerId: string | null | undefined
): boolean {
    if (error) return true;
    if (!drawerId || drawerId === "new") return true;
    if (!data) return true;
    if ((data as { _create?: boolean })._create) return true;
    const id = (data as { id?: string }).id;
    if (id == null) return true;
    return String(id) !== String(drawerId);
}
