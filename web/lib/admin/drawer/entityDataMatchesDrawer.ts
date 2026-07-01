import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

/** True when `data` is the loaded row for the open drawer id (strict for typed drawers). */
export function entityDataMatchesDrawer(
    data: Record<string, unknown> | null,
    drawerId: string | null | undefined,
    entityType?: AdminDrawerEntityType | null
): boolean {
    if (!drawerId || drawerId === "new") return true;
    if (!data) return entityType == null;
    if ((data as { _create?: boolean })._create) return drawerId === "new";
    const rowId = (data as { id?: string }).id;
    if (rowId == null || String(rowId).trim() === "") {
        return entityType == null;
    }
    return String(rowId) === String(drawerId);
}
