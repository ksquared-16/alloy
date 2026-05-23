import type { RoutePipelineState } from "@/lib/adminV2/routeShellPipeline/types";
import type { WorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { workUnitAboveFoldAtomicPaintReady } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";

export type BuildWorkUnitRoutePipelineInput = {
    department_id: string;
    work_unit_id: string;
    department_title: string;
    work_unit_title: string;
    department_key?: string;
    /** Page `loading` blocks shell identity. */
    shell_identity_ready: boolean;
    /** Route shell identity not ready (WU+dept). Queue rows hydrate in-lane after shell. */
    oper_lane_loading: boolean;
    kpi_placeholder: boolean;
    primary_loaded: boolean;
    full_complete: boolean;
    workspace_base_path?: string;
    work_unit_above_fold: WorkUnitAboveFoldRenderModel;
};

const WORKSPACE_BASE = "/adminV2/workspace";

export function buildWorkUnitRoutePipelineState(input: BuildWorkUnitRoutePipelineInput): RoutePipelineState {
    const base = input.workspace_base_path ?? WORKSPACE_BASE;
    const deptHref = `${base}/dept/${encodeURIComponent(input.department_id)}`;

    const shell_identity_ready = input.shell_identity_ready;
    const oper_lane_loading = input.oper_lane_loading || !shell_identity_ready;
    const above_fold_coordinated = workUnitAboveFoldAtomicPaintReady(input.work_unit_above_fold);

    return {
        shell: {
            route_id: "work_unit",
            layout_version: "work-unit-route-v1",
            breadcrumbs: [
                { href: base, label: "Workspace" },
                { href: deptHref, label: input.department_title },
                { label: input.work_unit_title },
            ],
            title: input.work_unit_title,
            subtitle: "",
            regions: [
                { region_key: "header", lifecycle: "immediate" },
                { region_key: "kpi_strip", lifecycle: "reserved_placeholder" },
                { region_key: "queue_lane", lifecycle: "immediate" },
                { region_key: "automation_footer", lifecycle: "deferred" },
            ],
            geometry: {
                header_signals_reserved: false,
                queue_lane_min_h: "min-h-[12rem]",
                enrollment_actions_rail: Boolean(input.department_key && input.department_key.includes("enroll")),
            },
        },
        enrichment: {
            record_surface: input.full_complete ? "full" : input.primary_loaded ? "primary" : "bootstrap",
            primary_loaded: input.primary_loaded,
            full_pending: input.primary_loaded && !input.full_complete,
            full_complete: input.full_complete,
            background_full_failed: false,
        },
        hydration_plan: {
            route_id: "work_unit",
            surfaces: {
                bootstrap: { enabled: true, owner: "page" },
                primary: { enabled: true },
                full: { enabled: true, deferred: true },
            },
        },
        above_fold: {
            header_ready: above_fold_coordinated || shell_identity_ready,
            queue_lane: {
                reserved: true,
                value_phase: input.work_unit_above_fold.queue_lane.state === "ready" ? "value" : "skeleton",
                oper_lane_loading,
            },
            kpi_strip: {
                reserved: true,
                value_phase: input.kpi_placeholder ? "skeleton" : shell_identity_ready ? "value" : "skeleton",
                placeholder: input.kpi_placeholder,
            },
            sections: [
                {
                    region_key: "queue_lane",
                    lifecycle: "immediate",
                    value_phase: oper_lane_loading ? "skeleton" : "value",
                },
                {
                    region_key: "kpi_strip",
                    lifecycle: "reserved_placeholder",
                    value_phase: input.kpi_placeholder ? "skeleton" : "value",
                },
            ],
        },
        work_unit_above_fold: input.work_unit_above_fold,
    };
}
