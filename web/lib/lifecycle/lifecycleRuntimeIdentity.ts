import type { LifecycleCatalogEntry, LifecycleCatalogSource } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { lifecycleCatalogId } from "@/lib/lifecycle/lifecycleCatalog";

/**
 * Single source of truth for the selected lifecycle's runtime department.
 * `runtimeDepartmentId` is the only id used for validation, workspace, View links, WU/actions, delete, repair.
 */
export type LifecycleRuntimeIdentity = {
    lifecycleId: string;
    processId: string;
    lifecycleName: string;
    source: LifecycleCatalogSource;
    runtimeDepartmentId: string;
    catalogDepartmentId: string;
    isBuilderOwned: boolean;
    isLegacy: boolean;
    workspaceVisible: boolean;
};

export function buildIdentityFromCatalogEntry(entry: LifecycleCatalogEntry): LifecycleRuntimeIdentity {
    const deptId = entry.department_id.trim();
    return {
        lifecycleId: entry.id,
        processId: entry.process_id,
        lifecycleName: entry.lifecycle_name,
        source: entry.source,
        runtimeDepartmentId: deptId,
        catalogDepartmentId: deptId,
        isBuilderOwned: entry.activation_owned,
        isLegacy: entry.source === "legacy",
        workspaceVisible: entry.workspace.runtime_status === "visible",
    };
}

export function buildIdentityForNewLifecycle(
    runtimeDepartmentId: string,
    processId: string,
    lifecycleName: string
): LifecycleRuntimeIdentity {
    const deptId = runtimeDepartmentId.trim();
    const procId = processId.trim();
    return {
        lifecycleId: lifecycleCatalogId(deptId, procId),
        processId: procId,
        lifecycleName: lifecycleName.trim(),
        source: "builder_owned",
        runtimeDepartmentId: deptId,
        catalogDepartmentId: deptId,
        isBuilderOwned: true,
        isLegacy: false,
        workspaceVisible: false,
    };
}

export function applyRuntimeDepartmentId(
    identity: LifecycleRuntimeIdentity,
    runtimeDepartmentId: string,
    catalog?: LifecycleCatalogEntry[]
): LifecycleRuntimeIdentity {
    const runtime = runtimeDepartmentId.trim();
    if (!runtime) return identity;

    if (catalog) {
        const match =
            catalog.find(
                (e) => e.department_id === runtime && e.process_id === identity.processId
            ) ?? catalog.find((e) => e.department_id === runtime);
        if (match) {
            return { ...buildIdentityFromCatalogEntry(match), runtimeDepartmentId: runtime };
        }
    }

    return {
        ...identity,
        runtimeDepartmentId: runtime,
        lifecycleId: lifecycleCatalogId(runtime, identity.processId),
    };
}

export function identityHasSyncDrift(identity: LifecycleRuntimeIdentity): boolean {
    return identity.catalogDepartmentId.trim() !== identity.runtimeDepartmentId.trim();
}

export function hasRuntimeDepartmentId(identity: LifecycleRuntimeIdentity | null): identity is LifecycleRuntimeIdentity {
    return Boolean(identity?.runtimeDepartmentId?.trim());
}

export function findCatalogEntryForIdentity(
    catalog: LifecycleCatalogEntry[],
    identity: LifecycleRuntimeIdentity
): LifecycleCatalogEntry | null {
    return (
        catalog.find((e) => e.id === identity.lifecycleId) ??
        catalog.find(
            (e) => e.department_id === identity.runtimeDepartmentId && e.process_id === identity.processId
        ) ??
        null
    );
}

/** Align catalog selection row with authoritative runtime department (after repair). */
export function syncCatalogToRuntimeIdentity(
    identity: LifecycleRuntimeIdentity,
    catalog: LifecycleCatalogEntry[]
): LifecycleRuntimeIdentity {
    const match = catalog.find(
        (e) => e.department_id === identity.runtimeDepartmentId && e.process_id === identity.processId
    );
    if (match) return buildIdentityFromCatalogEntry(match);
    return {
        ...identity,
        catalogDepartmentId: identity.runtimeDepartmentId,
    };
}

export function workspaceDeptHref(runtimeDepartmentId: string): string {
    return "/workspace";
}
