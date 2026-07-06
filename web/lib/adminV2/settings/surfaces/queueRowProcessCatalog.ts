/**
 * Queue Row Surface — catalog-backed navigation (one surface per Business Process).
 *
 * Real Business Processes come from `/api/admin/lifecycle-catalog`. Pipeline / Waitlist
 * are presentation variants inside a process surface — not separate nav entries.
 */

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { isLegacyArtifactProcessName } from "@/lib/admin/buildOperatorLifecycleLanding";
import { businessProcessForProcessKey } from "@/lib/presentation/runtime/workspaceProcessSignal";
import type { SurfaceConfigObject } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import type { QueueRowSurfaceEnvelope } from "@/lib/presentation/runtime/queueRowSurfaceMetadata";

export function isVisibleQueueRowCatalogEntry(entry: LifecycleCatalogEntry): boolean {
    if (!entry.workspace.user_has_access) return false;
    if (!entry.workspace.department_is_active) return false;
    if (!entry.workspace.visible_in_workspace_api) return false;
    if (isLegacyArtifactProcessName(entry.lifecycle_name)) return false;
    return entry.workspace.runtime_status === "visible" || entry.workspace.runtime_status === "name_mismatch";
}

/** Stable surface id for a catalog-backed Queue Row surface. */
export function queueRowSurfaceId(catalogId: string): string {
    return `queue-row-${catalogId.replace(/:/g, "-")}`;
}

export function catalogIdFromQueueRowSurfaceId(surfaceId: string): string | null {
    if (!surfaceId.startsWith("queue-row-")) return null;
    const tail = surfaceId.slice("queue-row-".length);
    const UUID_LEN = 36;
    if (tail.length < UUID_LEN * 2 + 1 || tail[UUID_LEN] !== "-") return null;
    return `${tail.slice(0, UUID_LEN)}:${tail.slice(UUID_LEN + 1)}`;
}

export function queueRowLayoutKeyForProcessKey(processKey: string): string {
    const slug = processKey
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    return `queue_row_${slug || "default"}`;
}

export function queueRowProcessConfigKey(entry: Pick<LifecycleCatalogEntry, "process_key">): string | null {
    return businessProcessForProcessKey(entry.process_key) ?? (entry.process_key?.trim() || null);
}

export function defaultQueueRowSurfaceName(processName: string): string {
    const trimmed = processName.trim();
    return trimmed ? `${trimmed} Queue Row` : "Queue Row";
}

/** Visible lifecycle processes — each gets one Queue Row surface in Surfaces nav. */
export function resolveQueueRowCatalogIds(catalog: readonly LifecycleCatalogEntry[]): string[] {
    return catalog.filter(isVisibleQueueRowCatalogEntry).map((e) => e.id);
}

export function surfaceObjectForQueueRowCatalogEntry(
    entry: LifecycleCatalogEntry,
    envelope?: Pick<QueueRowSurfaceEnvelope, "name"> | null,
): SurfaceConfigObject {
    const processKey = queueRowProcessConfigKey(entry);
    return {
        id: queueRowSurfaceId(entry.id),
        title: envelope?.name?.trim() || defaultQueueRowSurfaceName(entry.lifecycle_name),
        subtitle: "Queue row presentation variants",
        editor: "queue-row-builder",
        entityType: "opportunities",
        businessProcess: processKey ?? undefined,
        catalogId: entry.id,
        processKey: entry.process_key ?? undefined,
        departmentId: entry.department_id,
        processId: entry.process_id,
    };
}

/** Legacy builder ids — removed from nav; still resolve for migration reads. */
export const LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID = "pipeline-queue-row";
export const LEGACY_WAITLIST_QUEUE_ROW_SURFACE_ID = "waitlist-queue-row";

export function isLegacyQueueRowSurfaceId(surfaceId: string): boolean {
    return (
        surfaceId === LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID ||
        surfaceId === LEGACY_WAITLIST_QUEUE_ROW_SURFACE_ID
    );
}
