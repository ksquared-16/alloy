/**
 * Operational Graph — client materializer (Phase A · §1.5 "client materializes").
 *
 * Bridges the already-authorized client nav surface (the Workspace nav tree: departments + Work
 * Units, fetched under access control) plus each Work Unit's published Work Views into the pure
 * {@link compileOperationalGraph} input, then compiles. The client only *materializes* what the
 * server authored as reachable — it never invents nodes (§1.5).
 *
 * Work-View resolution is injected (`resolveWorkViews`) rather than fetched here, so this module
 * stays pure and unit-testable: the caller supplies the config source (e.g.
 * `savedWorkViewsFromDepartmentMetadata` over department metadata) and its revision.
 */

import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import {
    type CompileOperationalGraphInput,
    type CompileWorkUnitInput,
    type CompileWorkViewInput,
    compileOperationalGraph,
} from "@/lib/runtime/graph/compileOperationalGraph";
import type { GraphRevision, OperationalGraph } from "@/lib/runtime/graph/operationalGraph";

/** Minimal Work Unit shape the materializer needs (subset of `WorkspaceNavTreeWu`). */
export type MaterializeWorkUnit = {
    id: string;
    name?: string | null;
    department_id: string;
    displayOrder?: number;
    headerVariantRef?: string | null;
    defaultWorkViewId?: string | null;
};

/**
 * Map a published `WorkViewConfigV1Stored` (the stored Work View config) to compiler input. Use
 * `savedWorkViewsFromDepartmentMetadata(departmentMetadata)` to obtain the orphan-filtered stored
 * views, then map them through this to feed the graph — the lens binds to `compat_queue_key` when
 * present (the lane), else the view id.
 */
export function workViewInputFromStored(view: WorkViewConfigV1Stored): CompileWorkViewInput {
    return {
        id: view.id,
        label: view.label,
        lens: view.compat_queue_key ?? view.id,
        queueLayoutId: view.queue_layout_id ?? null,
        focusPanelLayoutId: view.focus_panel_layout_id ?? null,
        displayOrder: view.display_order,
        // Composition refs (queue-row variant, default-subject strategy) resolve through
        // resolveSurfaceVariant at prepare time; the graph carries the lens/layout pointers only.
        queueRowVariantRef: view.queue_layout_id ?? null,
    };
}

export type MaterializeOperationalGraphInput = {
    /** Authorized Work Units from the client nav tree, in display order. */
    workUnits: readonly MaterializeWorkUnit[];
    /** Per-Work-Unit published Work Views (already authorization/orphan filtered). */
    resolveWorkViews: (workUnit: MaterializeWorkUnit) => readonly CompileWorkViewInput[];
    revision?: Partial<GraphRevision>;
};

/** Materialize (and compile) the Operational Graph from the client nav surface. */
export function materializeOperationalGraph(
    input: MaterializeOperationalGraphInput,
): OperationalGraph {
    const workUnits: CompileWorkUnitInput[] = input.workUnits.map((wu, index) => ({
        id: wu.id,
        label: wu.name ?? null,
        departmentId: wu.department_id,
        headerVariantRef: wu.headerVariantRef ?? null,
        defaultWorkViewId: wu.defaultWorkViewId ?? null,
        displayOrder: wu.displayOrder ?? index + 1,
    }));

    const workViewsByWorkUnit: Record<string, CompileWorkViewInput[]> = {};
    for (const wu of input.workUnits) {
        workViewsByWorkUnit[wu.id] = [...input.resolveWorkViews(wu)];
    }

    const compileInput: CompileOperationalGraphInput = {
        workUnits,
        workViewsByWorkUnit,
        revision: input.revision,
    };
    return compileOperationalGraph(compileInput);
}
