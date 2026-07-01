import { perfDrawer, perfPrefetch } from "@/lib/perf/perfNamespaceLog";

export type LinkedDrawerVmPerfPhase = "prefetch" | "swap";
export type LinkedDrawerVmOpenPath = "cache_hit" | "inflight_join" | "cold_fetch";
export type LinkedDrawerVmCacheMissReason =
    | "no_entry"
    | "scope_mismatch"
    | "unsupported_entity"
    | "legacy_fallback";

function phasePrefix(kind: LinkedDrawerVmPerfPhase): string {
    return kind === "prefetch" ? "linked_prefetch" : "linked_swap";
}

export function logLinkedDrawerVmCacheMiss(input: {
    kind: LinkedDrawerVmPerfPhase;
    entityType: "persons" | "opportunities";
    entityId: string;
    reason: LinkedDrawerVmCacheMissReason;
    departmentId?: string | null;
    workUnitId?: string | null;
    orgId?: string | null;
    surface?: string | null;
}): void {
    perfDrawer("cache_miss", {
        entity_type: input.entityType,
        entity_id: input.entityId,
        cache_hit: false,
        source: input.reason === "legacy_fallback" ? "legacy" : "network",
        skipped_reason: input.reason,
        department_id: input.departmentId ?? undefined,
        work_unit_id: input.workUnitId ?? undefined,
        org_id: input.orgId ?? undefined,
        detail: input.surface ?? undefined,
    });
}

export function logLinkedDrawerVmStart(input: {
    kind: LinkedDrawerVmPerfPhase;
    entityType: "persons" | "opportunities";
    entityId: string;
    surface?: string | null;
}): void {
    const phase = `${phasePrefix(input.kind)}_start`;
    if (input.kind === "prefetch") {
        perfPrefetch(phase, {
            entity_type: input.entityType,
            entity_id: input.entityId,
            surface: input.surface ?? undefined,
        });
        return;
    }
    perfDrawer(phase, {
        entity_type: input.entityType,
        entity_id: input.entityId,
        detail: input.surface ?? undefined,
    });
}

export function logLinkedDrawerVmResolve(input: {
    kind: LinkedDrawerVmPerfPhase;
    entityType: "persons" | "opportunities";
    entityId: string;
    openPath: LinkedDrawerVmOpenPath;
    durationMs: number;
    cacheMissReason?: LinkedDrawerVmCacheMissReason;
    surface?: string | null;
}): void {
    const phase =
        input.openPath === "cache_hit" ?
            `${phasePrefix(input.kind)}_cache_hit`
        : input.openPath === "inflight_join" ?
            `${phasePrefix(input.kind)}_inflight_join`
        :   `${phasePrefix(input.kind)}_cold_fetch`;

    const payload = {
        entity_type: input.entityType,
        entity_id: input.entityId,
        duration_ms: input.durationMs,
        cache_hit: input.openPath !== "cold_fetch",
        source: input.openPath === "cold_fetch" ? "network" : "cache",
        skipped_reason: input.cacheMissReason,
        detail: input.surface ?? undefined,
    };

    if (input.kind === "prefetch" && input.openPath === "cold_fetch") {
        perfPrefetch(phase, payload);
        return;
    }
    perfDrawer(phase, payload);
}
