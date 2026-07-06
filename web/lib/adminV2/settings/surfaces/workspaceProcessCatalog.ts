/**
 * Workspace Process Summary — catalog-backed navigation.
 *
 * Real Business Processes come from `/api/admin/lifecycle-catalog` (same source as
 * Processes settings and the workspace runtime). No hardcoded operational-calculation
 * domains are surfaced as fake workspace processes.
 */

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import {
    isLegacyArtifactProcessName,
} from "@/lib/admin/buildOperatorLifecycleLanding";
import { businessProcessForProcessKey } from "@/lib/presentation/runtime/workspaceProcessSignal";
import type { WorkspaceProcessSurfaceConfig } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type { SurfaceConfigObject } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

export function isVisibleLifecycleCatalogEntry(entry: LifecycleCatalogEntry): boolean {
    if (!entry.workspace.user_has_access) return false;
    if (!entry.workspace.department_is_active) return false;
    if (!entry.workspace.visible_in_workspace_api) return false;
    if (isLegacyArtifactProcessName(entry.lifecycle_name)) return false;
    return entry.workspace.runtime_status === "visible" || entry.workspace.runtime_status === "name_mismatch";
}

/** Stable surface id for a catalog-backed Workspace Process Summary. */
export function workspaceProcessSurfaceId(catalogId: string): string {
    return `workspace-process-${catalogId.replace(/:/g, "-")}`;
}

export function catalogIdFromWorkspaceProcessSurfaceId(surfaceId: string): string | null {
    if (!surfaceId.startsWith("workspace-process-")) return null;
    const tail = surfaceId.slice("workspace-process-".length);
    const UUID_LEN = 36;
    if (tail.length < UUID_LEN * 2 + 1 || tail[UUID_LEN] !== "-") return null;
    return `${tail.slice(0, UUID_LEN)}:${tail.slice(UUID_LEN + 1)}`;
}

/** Config map key — matches runtime `businessProcessForProcessKey(processKey)`. */
export function workspaceProcessConfigKey(entry: Pick<LifecycleCatalogEntry, "process_key">): string | null {
    return businessProcessForProcessKey(entry.process_key) ?? (entry.process_key?.trim() || null);
}

function catalogEntryHasPersistedSummary(
    entry: LifecycleCatalogEntry,
    config: WorkspaceProcessSurfaceConfig,
): boolean {
    const key = workspaceProcessConfigKey(entry);
    if (!key) return false;
    return Boolean(config.primarySignalByProcess[key] || config.cardByProcess[key]);
}

/**
 * Catalog ids that should appear under Surfaces → Workspaces.
 * Explicit `summaryCatalogIds` wins; else bootstrap a single visible process; else entries with persisted config.
 */
export function resolveSummaryCatalogIds(
    catalog: readonly LifecycleCatalogEntry[],
    config: WorkspaceProcessSurfaceConfig,
): string[] {
    const visible = catalog.filter(isVisibleLifecycleCatalogEntry);
    const explicit = (config.summaryCatalogIds ?? []).filter((id) => visible.some((e) => e.id === id));
    if (explicit.length) return explicit;
    if (visible.length === 1) return [visible[0]!.id];
    return visible.filter((e) => catalogEntryHasPersistedSummary(e, config)).map((e) => e.id);
}

export function catalogEntriesAvailableToCreate(
    catalog: readonly LifecycleCatalogEntry[],
    config: WorkspaceProcessSurfaceConfig,
): LifecycleCatalogEntry[] {
    const visible = catalog.filter(isVisibleLifecycleCatalogEntry);
    const configured = new Set(resolveSummaryCatalogIds(catalog, config));
    return visible.filter((e) => !configured.has(e.id));
}

export function surfaceObjectForCatalogEntry(entry: LifecycleCatalogEntry): SurfaceConfigObject {
    return {
        id: workspaceProcessSurfaceId(entry.id),
        title: entry.lifecycle_name,
        subtitle: "Workspace Process Summary",
        editor: "workspace-processes",
        catalogId: entry.id,
        processKey: entry.process_key,
        departmentId: entry.department_id,
        processId: entry.process_id,
        liveHref: "/workspace",
    };
}

export function findCatalogEntryBySurfaceId(
    catalog: readonly LifecycleCatalogEntry[],
    surfaceId: string,
): LifecycleCatalogEntry | null {
    const catalogId = catalogIdFromWorkspaceProcessSurfaceId(surfaceId);
    if (!catalogId) return null;
    return catalog.find((e) => e.id === catalogId) ?? null;
}

export function withSummaryCatalogId(
    config: WorkspaceProcessSurfaceConfig,
    catalogId: string,
): WorkspaceProcessSurfaceConfig {
    const ids = new Set(config.summaryCatalogIds ?? []);
    ids.add(catalogId);
    return { ...config, summaryCatalogIds: [...ids] };
}
