/**
 * Shared Work Unit surface config-bundle fetch (Trust Closure). The runtime config effect and the
 * navigation prewarm both resolve the SAME session-stable config (department metadata, queue
 * definition, sibling work units, queue-row layout) through this one function, so a prefetch writes
 * exactly the cache entry the runtime later seeds from — never a divergent shape or a second contract.
 */

import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { queueRowSurfaceId } from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { WorkViewCanonicalLocationWorkUnitRow } from "@/lib/workspace/resolveWorkViewCanonicalLocation";

export type WorkUnitSurfaceConfigBundle = {
    deptMetadata: unknown | null;
    queueDefinition: unknown | null;
    deptWorkUnits: WorkViewCanonicalLocationWorkUnitRow[] | null;
    queueRowLayoutConfig: QueueRecordLayoutConfigV3 | null;
    queueRowSurfaceId: string;
    /**
     * The core department + work-unit reads both succeeded. When false the bundle is a failure
     * shell (transient 404/network) — callers must NOT write it to the session cache, or a later
     * fresh-skip would trust an empty config.
     */
    ok: boolean;
};

/**
 * Resolve the published Queue Row surface id from the department lifecycle process. Falls back to
 * the legacy pipeline id when the catalog id cannot be derived.
 */
export function queueRowSurfaceIdForDepartment(departmentId: string | null, deptMetadata: unknown): string {
    const lifecycle = lifecycleBuilderFromDepartmentMetadata(deptMetadata);
    const process = lifecycle ? activeLifecycleProcess(lifecycle) : null;
    if (process && departmentId) {
        return queueRowSurfaceId(`${departmentId}:${process.id}`);
    }
    return "pipeline-queue-row";
}

/**
 * In-flight coalescing for the BUNDLE, not merely for its individual fetches.
 *
 * `dedupeAdminFetch` collapses only requests that overlap while in flight. The queue-row-layout
 * read happens AFTER the three parallel reads resolve, so two callers arriving a few hundred
 * milliseconds apart had both cleared the parallel block before either issued it — and the layout
 * was fetched twice with a byte-identical URL, observed on every Work Unit entry.
 *
 * This module already promises that "the runtime config effect and the navigation prewarm both
 * resolve the SAME config through this one function". Coalescing here is what makes that true for
 * the serial tail as well as the parallel head.
 */
const bundleInflight = new Map<string, Promise<WorkUnitSurfaceConfigBundle>>();

export function fetchWorkUnitSurfaceConfigBundle(args: {
    departmentId: string;
    workUnitId: string;
    fetchInit?: RequestInit;
}): Promise<WorkUnitSurfaceConfigBundle> {
    const inflightKey = `${args.departmentId}::${args.workUnitId}`;
    const existing = bundleInflight.get(inflightKey);
    if (existing) return existing;
    const started = resolveWorkUnitSurfaceConfigBundle(args).finally(() => {
        bundleInflight.delete(inflightKey);
    });
    bundleInflight.set(inflightKey, started);
    return started;
}

/** @internal test seam */
export function clearWorkUnitSurfaceConfigBundleInflightForTests(): void {
    bundleInflight.clear();
}

async function resolveWorkUnitSurfaceConfigBundle(args: {
    departmentId: string;
    workUnitId: string;
    fetchInit?: RequestInit;
}): Promise<WorkUnitSurfaceConfigBundle> {
    const { departmentId, workUnitId, fetchInit } = args;
    const [dept, wu, deptUnits] = await Promise.all([
        dedupeAdminFetch(`/api/admin/departments/${encodeURIComponent(departmentId)}`, fetchInit)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
        dedupeAdminFetch(`/api/admin/work-units/${encodeURIComponent(workUnitId)}`, fetchInit)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
        dedupeAdminFetch(`/api/admin/work-units?department_id=${encodeURIComponent(departmentId)}`, fetchInit)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
    ]);

    const deptMetadata = (dept as { metadata?: unknown } | null)?.metadata ?? null;
    const resolvedSurfaceId = queueRowSurfaceIdForDepartment(departmentId, deptMetadata);
    const lifecycle = lifecycleBuilderFromDepartmentMetadata(deptMetadata);
    const process = lifecycle ? activeLifecycleProcess(lifecycle) : null;
    const processKey = process?.key ?? "enrollment";
    const qs = processKey ? `?processKey=${encodeURIComponent(processKey)}` : "";
    const queueRowLayoutRes = await dedupeAdminFetch(
        `/api/admin/queue-row-layout/${encodeURIComponent(resolvedSurfaceId)}${qs}`,
        fetchInit,
    )
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);

    const items = (deptUnits as { items?: unknown } | null)?.items;
    const envelopeLayout =
        (queueRowLayoutRes as { envelope?: { layout?: unknown } } | null)?.envelope?.layout ??
        (queueRowLayoutRes as { config?: unknown } | null)?.config ??
        null;

    return {
        deptMetadata,
        queueDefinition: (wu as { queue_definition?: unknown } | null)?.queue_definition ?? null,
        deptWorkUnits: Array.isArray(items) ? (items as WorkViewCanonicalLocationWorkUnitRow[]) : null,
        queueRowLayoutConfig:
            envelopeLayout &&
            typeof envelopeLayout === "object" &&
            Array.isArray((envelopeLayout as { columns?: unknown }).columns)
                ? (envelopeLayout as QueueRecordLayoutConfigV3)
                : null,
        queueRowSurfaceId: resolvedSurfaceId,
        // The two core reads must both have returned to trust (and cache) this config.
        ok: dept != null && wu != null,
    };
}
