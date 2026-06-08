import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerState, DrawerStackItem } from "@/contexts/AdminDrawerContext";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import { warmRelatedDrawerGraph } from "@/lib/adminV2/viewModel/drawer/vmRuntime/warmRelatedDrawerGraph";

const scheduledWarmKeys = new Set<string>();

function scheduleDrawerVmWarmTask(task: () => void, key: string): void {
    if (scheduledWarmKeys.has(key)) return;
    scheduledWarmKeys.add(key);

    queueMicrotask(() => {
        try {
            task();
        } catch {
            scheduledWarmKeys.delete(key);
        }
    });
}

export function buildDrawerVmRelatedWarmKey(params: {
    runtime: "opportunity" | "person" | "child";
    entityId: string;
    generation: string | null | undefined;
}): string {
    const id = params.entityId.trim();
    const gen = String(params.generation ?? "_").trim() || "_";
    return `${params.runtime}:${id}:${gen}`;
}

/**
 * After VM first paint, warm related drawer targets in the background without blocking render.
 */
export function scheduleWarmRelatedDrawerTargetsAfterVmApply(params: {
    drawer: AdminDrawerState;
    entityType: AdminDrawerEntityType;
    record: Record<string, unknown>;
    runtime: "opportunity" | "person" | "child";
    generation: string | null | undefined;
    /** Stack top — used to warm Back to Lead opportunity VM from Person/Child. */
    previousDrawer?: DrawerStackItem | null;
    /** Full stack — pins Back to Lead across Person → Child hops. */
    stack?: DrawerStackItem[];
}): void {
    const entityId = String(params.record.id ?? params.drawer.id ?? "").trim();
    if (!entityId) return;

    const warmKey = buildDrawerVmRelatedWarmKey({
        runtime: params.runtime,
        entityId,
        generation: params.generation,
    });

    scheduleDrawerVmWarmTask(() => {
        const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        logDrawerVmRuntimeDiagnostic("related_prefetch_start", {
            runtime: params.runtime,
            entity_type: params.entityType,
            entity_id: entityId,
            warm_key: warmKey,
        });
        logDrawerVmRuntime("related_prefetch_start", {
            runtime: params.runtime,
            entity_type: params.entityType,
            entity_id: entityId,
            warm_key: warmKey,
        });
        try {
            warmRelatedDrawerGraph({
                drawer: params.drawer,
                entityType: params.entityType,
                record: params.record,
                runtime: params.runtime,
                previousDrawer: params.previousDrawer ?? null,
                stack: params.stack ?? [],
            });
            const elapsedMs =
                typeof performance !== "undefined" ?
                    Math.round(performance.now() - startedAt)
                :   0;
            logDrawerVmRuntimeDiagnostic("related_prefetch_ready", {
                runtime: params.runtime,
                entity_type: params.entityType,
                entity_id: entityId,
                related_prefetch_ms: elapsedMs,
                warm_key: warmKey,
            });
            logDrawerVmRuntime("related_prefetch_ready", {
                runtime: params.runtime,
                entity_type: params.entityType,
                entity_id: entityId,
                related_prefetch_ms: elapsedMs,
                warm_key: warmKey,
            });
        } catch (err) {
            logDrawerVmRuntimeDiagnostic("related_prefetch_error", {
                runtime: params.runtime,
                entity_type: params.entityType,
                entity_id: entityId,
                warm_key: warmKey,
                error: err instanceof Error ? err.message : String(err),
            });
            logDrawerVmRuntime("related_prefetch_error", {
                runtime: params.runtime,
                entity_type: params.entityType,
                entity_id: entityId,
                warm_key: warmKey,
                error: err instanceof Error ? err.message : String(err),
            });
            scheduledWarmKeys.delete(warmKey);
        }
    }, warmKey);
}

/** @deprecated Use {@link scheduleWarmRelatedDrawerTargetsAfterVmApply} — kept for direct warm call sites. */
export function warmRelatedDrawerTargetsAfterVmApply(params: {
    drawer: AdminDrawerState;
    entityType: AdminDrawerEntityType;
    record: Record<string, unknown>;
    runtime: "opportunity" | "person" | "child";
}): void {
    scheduleWarmRelatedDrawerTargetsAfterVmApply({
        ...params,
        generation: String(params.record.generation ?? params.record.view_model_generation ?? "_"),
    });
}
