"use client";

import LifecycleDepartmentIdAuditTable from "@/components/adminV2/settings/lifecycle/LifecycleDepartmentIdAuditTable";
import type { LifecycleDepartmentIdAudit } from "@/lib/lifecycle/lifecycleDepartmentIdAudit";
import { readLifecycleDebugSelection } from "@/lib/lifecycle/lifecycleDebugSelection";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import type { WorkspaceTilePipelineTrace } from "@/lib/workspace/workspaceRootTilePipeline";

type Props = {
    trace: WorkspaceTilePipelineTrace | null;
    renderedDepartmentsCount: number;
    reactStateDepartmentIds: string[];
    highlightDepartmentId?: string | null;
    idAudit?: LifecycleDepartmentIdAudit | null;
};

/**
 * Dev-only workspace tile pipeline visibility (NODE_ENV development).
 */
export function WorkspaceTileDebugPanel({
    trace,
    renderedDepartmentsCount,
    reactStateDepartmentIds,
    highlightDepartmentId,
    idAudit,
}: Props) {
    if (!isLifecycleDebugUiEnabled()) return null;
    if (!trace) return null;

    const debugSel = readLifecycleDebugSelection();
    const highlight = (highlightDepartmentId ?? debugSel?.department_id ?? "").trim();
    const step = (ids: string[], label: string) => (
        <div className="rounded border border-alloy-forge/15 bg-white/90 p-2 text-[10px] font-mono">
            <div className="font-semibold text-alloy-midnight/80">{label}</div>
            <div className="mt-1 text-alloy-midnight/60">
                count={ids.length}
                {highlight ? (
                    <span className={ids.includes(highlight) ? " text-alloy-pine" : " text-red-700"}>
                        {" "}
                        lifecycle_dept={highlight} {ids.includes(highlight) ? "present" : "MISSING"}
                    </span>
                ) : null}
            </div>
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[9px]">
                {ids.join("\n") || "(empty)"}
            </pre>
        </div>
    );

    return (
        <aside
            className="mt-4 rounded-lg border border-dashed border-amber-400/50 bg-amber-50/40 p-3"
            data-testid="workspace-tile-debug-panel"
        >
            <p className="text-[11px] font-semibold text-amber-900">Workspace tile debug (development)</p>
            {debugSel ? (
                <dl className="mt-1 grid gap-0.5 font-mono text-[10px] text-amber-950/85">
                    <div>
                        <dt className="inline opacity-60">selected department_id: </dt>
                        <dd className="inline break-all">{debugSel.department_id}</dd>
                    </div>
                    <div>
                        <dt className="inline opacity-60">lifecycle name: </dt>
                        <dd className="inline">{debugSel.lifecycle_name}</dd>
                    </div>
                    <div>
                        <dt className="inline opacity-60">expected tile name: </dt>
                        <dd className="inline">{debugSel.expected_tile_name}</dd>
                    </div>
                </dl>
            ) : null}
            <p className="mt-0.5 text-[10px] text-amber-900/70">
                Rendered tiles in React state: {renderedDepartmentsCount}
            </p>
            {idAudit ? (
                <div className="mt-2">
                    <LifecycleDepartmentIdAuditTable
                        audit={idAudit}
                        reactStateDepartmentIds={reactStateDepartmentIds}
                        title="Lifecycle ID audit (workspace page)"
                    />
                </div>
            ) : null}
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {step(trace.apiDepartmentIds, "1. API response IDs")}
                {step(trace.afterActiveFilterIds, "2. After is_active filter")}
                {step(trace.renderedTileIds, "3. Rendered tile IDs")}
            </div>
        </aside>
    );
}
