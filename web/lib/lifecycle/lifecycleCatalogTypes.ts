/**
 * Unified Lifecycle catalog — legacy processes (shared dept) + builder-owned departments.
 */

import type { ProcessModelV1 } from "@/lib/lifecycle/processModelV1";

export type LifecycleCatalogSource = "legacy" | "builder_owned";

export type LifecycleWorkspaceRuntimeStatus =
    | "visible"
    | "not_visible"
    | "access_issue"
    | "name_mismatch"
    | "inactive";

export type LifecycleCatalogEntry = {
    /** Stable key `${departmentId}:${processId}` */
    id: string;
    /** Where this row was read from (primary builder: explicit metadata only). */
    config_source: "departments.metadata.lifecycle_builder_v1";
    department_id: string;
    department_key: string;
    department_name: string;
    process_id: string;
    process_key: string;
    /**
     * How the process executes (BP V2 S1), resolved from its published configuration. Absent on rows
     * built before the field existed, which reads as staged lifecycle (`resolveProcessModel`).
     */
    process_model?: ProcessModelV1;
    lifecycle_name: string;
    source: LifecycleCatalogSource;
    stage_count: number;
    track_count: number;
    work_unit_count: number;
    activation_owned: boolean;
    can_delete: boolean;
    can_repair: boolean;
    workspace: {
        backing_department_exists: boolean;
        department_is_active: boolean;
        visible_in_workspace_api: boolean;
        user_has_access: boolean;
        name_matches_tile: boolean;
        runtime_status: LifecycleWorkspaceRuntimeStatus;
        tile_name: string | null;
    };
};

export type LifecycleCatalogValidationTruth = {
    exists_in_builder: boolean;
    backing_department_exists: boolean;
    visible_in_workspace_api: boolean;
    visible_after_cache_refresh: "unknown";
    user_has_access: boolean;
    workspace_pass: boolean;
    detail: string;
};
