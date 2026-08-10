import type { SupabaseClient } from "@supabase/supabase-js";
import { OPERATOR_WORKSPACE_HREF, operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { loadLifecycleBuilderConfiguredActions } from "@/lib/lifecycle/loadLifecycleBuilderConfiguredActions";
import {
    loadEnrollmentPipelineWorkUnitForDepartment,
    statusKeysForOperatorStageQueueSync,
} from "@/lib/lifecycle/lifecycleRuntimeBinding";
import {
    deptPipelineSurfaceShowsLegacyEnrollmentLanes,
    deptUsesBuilderOwnedLifecycleRuntime,
} from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import {
    isLifecycleStageWorkUnitKey,
    listLifecycleStageWorkUnitsForDepartment,
    loadLifecycleStageWorkUnitForDepartment,
    LIFECYCLE_STAGE_WORK_UNIT_KEY_PREFIX,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import { extractPipelineExecutionLanes } from "@/lib/workspace/extractPipelineExecutionLanes";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import {
    LIFECYCLE_RECORDS_QUERY_ZERO_COPY,
    LIFECYCLE_RECORDS_QUERY_ZERO_EXISTING_COPY,
    LIFECYCLE_NO_RECORDS_IN_LIFECYCLE_YET_COPY,
    lifecycleRecordsVisibleNotAssignedCopy,
    queueStatusKeysForLifecycleWorkUnitValidation,
    queueFilterIncludesExpectedStatuses,
    summarizeBuilderOwnedQueueFilterValidation,
    validateLifecycleStageWorkUnitQueueFilter,
} from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import { countLifecycleOpportunityRecordsForWorkUnit } from "@/lib/lifecycle/lifecycleOpportunityQueueScope";
import {
    formatLifecycleActionPlacementDetail,
    lifecycleNeedsAttentionWorkUnitConfigured,
    summarizeLifecycleActionPlacementSurfaces,
} from "@/lib/lifecycle/lifecycleRuntimeSurfaceValidation";
import {
    activeLifecycleProcess,
    configuredStageKeysForMetadata,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    assignedStatusKeysFromPayloadForStage,
    processIdFromDepartmentMetadata,
    resolveLifecycleStageWorkUnitIdentityForDepartment,
} from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { buildLifecycleCatalog, catalogEntryForProcess } from "@/lib/lifecycle/lifecycleCatalog";
import {
    buildLifecycleDepartmentIdAudit,
    type LifecycleDepartmentIdAudit,
} from "@/lib/lifecycle/lifecycleDepartmentIdAudit";
import { departmentIdAllowed } from "@/lib/admin/accessScope";
import { resolveLifecycleDepartmentWorkspaceAccess } from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import { fetchWorkspaceActiveDepartments } from "@/lib/workspace/workspaceActiveDepartments";
import type { WorkspaceRootDepartmentRow } from "@/lib/workspace/workspaceRootDepartmentTypes";
import {
    traceWorkspaceRootDepartmentTiles,
    workspaceRenderedTileFailureReason,
} from "@/lib/workspace/workspaceRootTilePipeline";
import { workspaceDeptHref } from "@/lib/lifecycle/lifecycleRuntimeIdentity";

function lifecycleValidationWorkUnitHref(workUnit: { id: string; key?: string | null } | null | undefined): string | null {
    if (!workUnit) return null;
    const key = String(workUnit.key ?? "").trim();
    if (key) return operatorWorkUnitHrefFromKey(key);
    return OPERATOR_WORKSPACE_HREF;
}

export { fetchWorkspaceActiveDepartments };
export type { LifecycleDepartmentIdAudit };

export type ValidateLifecycleActivationRuntimeResult = {
    checks: LifecycleActivationCheckResult[];
    id_audit: LifecycleDepartmentIdAudit;
};

export type WorkspaceDeptTileRow = {
    id: string;
    name: string | null;
    key: string | null;
    is_active?: boolean;
};

/** Pure workspace tile check (scoped department list + activation-owned name match). */
export function workspaceTileVisibleForActivation(
    workspaceDepartments: WorkspaceDeptTileRow[],
    departmentId: string,
    activation: LifecycleActivationV1,
    opts?: { existsInOrg?: boolean; accessScopeRestricted?: boolean }
): { pass: boolean; detail: string } {
    const tile = workspaceDepartments.find((d) => d.id === departmentId);
    if (!tile) {
        if (opts?.existsInOrg && opts?.accessScopeRestricted) {
            return {
                pass: false,
                detail: "Department exists in org but is outside your workspace access scope.",
            };
        }
        return {
            pass: false,
            detail: "Department not in workspace API list — open /workspace after repair or check Lifecycle access.",
        };
    }
    if (tile.is_active === false) {
        return { pass: false, detail: "Department is inactive on workspace." };
    }
    const lifecycleName = activation.lifecycle_name?.trim() ?? "";
    const tileName = (tile.name ?? "").trim();
    if (
        activation.activation_owned &&
        lifecycleName &&
        tileName.toLowerCase() !== lifecycleName.toLowerCase()
    ) {
        return {
            pass: false,
            detail: `Workspace tile is “${tileName}” but Lifecycle name is “${lifecycleName}”.`,
        };
    }
    return { pass: true, detail: "Visible on /workspace." };
}

export type LifecycleActivationCheckId =
    | "builder_catalog"
    | "runtime_department_row"
    | "builder_owned_marker"
    | "settings_only_legacy"
    | "backing_department"
    | "workspace_api"
    | "workspace_rendered_tiles"
    | "user_access"
    | "workspace_tile"
    | "workspace_access"
    | "identity_sync"
    | "workspace_browser_cache"
    | "dept_queue"
    | "work_unit_queue_filters"
    | "work_unit_records"
    | "work_unit_records_query"
    | "dept_runtime_lifecycle_work_units"
    | "dept_no_legacy_pipeline_lanes"
    | "drawer_actions"
    | "lifecycle_visibility_ui_parity"
    | "needs_attention_optional";

export type LifecycleActivationCheckResult = {
    id: LifecycleActivationCheckId;
    label: string;
    pass: boolean;
    href: string | null;
    detail: string;
};

function isOperatorStage(stage: string): stage is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(stage);
}

export async function validateLifecycleActivationRuntime(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    activation: LifecycleActivationV1,
    dim?: AdminAccessScopeDimensions,
    currentUserId?: string | null
): Promise<ValidateLifecycleActivationRuntimeResult> {
    const scopeDim = dim ?? {
        departmentScope: "all" as const,
        allowedDepartmentIds: [],
        siteScope: "all" as const,
        allowedSiteLocationIds: [],
    };
    const selectedDepartmentId = departmentId.trim();

    const { data: deptRow } = await supabase
        .from("departments")
        .select("id, name, is_active, metadata")
        .eq("id", selectedDepartmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    const deptExists = Boolean(deptRow);
    const builderOwnedMarker = isLifecycleBuilderOwnedDepartmentMetadata(deptRow?.metadata);
    const legacySettingsOnly =
        activation.activation_owned === true && deptExists && !builderOwnedMarker;
    const catalog = await buildLifecycleCatalog(supabase, orgId, scopeDim);
    const entry = catalogEntryForProcess(catalog, selectedDepartmentId, activation.process_id);
    const catalogMatchesSelected = Boolean(
        entry && entry.department_id === selectedDepartmentId && entry.process_id === activation.process_id
    );

    const workspaceRows = await fetchWorkspaceActiveDepartments(supabase, orgId, scopeDim);
    const tileTrace = traceWorkspaceRootDepartmentTiles(workspaceRows as WorkspaceRootDepartmentRow[]);
    const inApi = tileTrace.apiDepartmentIds.includes(selectedDepartmentId);
    const inRenderedTiles = tileTrace.renderedTileIds.includes(selectedDepartmentId);
    const renderedFailReason = workspaceRenderedTileFailureReason(tileTrace, selectedDepartmentId);

    const id_audit = await buildLifecycleDepartmentIdAudit(
        supabase,
        orgId,
        selectedDepartmentId,
        activation.process_id,
        activation.lifecycle_name,
        activation.activation_owned === true,
        entry,
        tileTrace,
        scopeDim
    );

    const userHasAccess = departmentIdAllowed(scopeDim, selectedDepartmentId);

    let workspaceAccessPass = userHasAccess;
    let workspaceAccessDetail = userHasAccess
        ? `Access scope includes selected department_id ${selectedDepartmentId}.`
        : `Access scope excludes selected department_id ${selectedDepartmentId}.`;

    if (currentUserId?.trim()) {
        const accessState = await resolveLifecycleDepartmentWorkspaceAccess(
            supabase,
            orgId,
            currentUserId.trim(),
            selectedDepartmentId
        );
        workspaceAccessPass = accessState.membership_provisioned && accessState.visible_in_departments_api;
        workspaceAccessDetail =
            accessState.department_scope === "all"
                ? `department_scope=all — no user_department_access row required; department is visible on /workspace API when active.`
                : workspaceAccessPass
                  ? `user_department_access row exists for ${selectedDepartmentId} (required when department_scope=restricted).`
                  : `Missing user_department_access for ${selectedDepartmentId}. Ask another administrator to add this department to your department scope — W-8 removed self-provisioning.`;
    }

    const checks: LifecycleActivationCheckResult[] = [];
    const apiIdsList = tileTrace.apiDepartmentIds.join(", ") || "(none)";
    const inApiForUser = inApi && workspaceAccessPass && deptExists && !legacySettingsOnly;

    checks.push({
        id: "runtime_department_row",
        label: "Runtime department row exists",
        pass: deptExists,
        href: null,
        detail: deptExists
            ? `departments.id === ${selectedDepartmentId} exists in org ${orgId}.`
            : `No departments row for runtimeDepartmentId ${selectedDepartmentId}. Create flow did not persist a workspace department.`,
    });

    checks.push({
        id: "builder_owned_marker",
        label: "Builder-owned metadata marker",
        pass: builderOwnedMarker,
        href: null,
        detail: builderOwnedMarker
            ? `metadata.lifecycle_builder_owned_v1 (or legacy marker) is present.`
            : `Missing lifecycle_builder_owned_v1 on department metadata. Lifecycle exists as settings/config only until a dedicated department is created.`,
    });

    checks.push({
        id: "settings_only_legacy",
        label: "Not settings-only (has runtime department)",
        pass: !legacySettingsOnly,
        href: null,
        detail: legacySettingsOnly
            ? `activation_owned is set but department lacks lifecycle_builder_owned_v1 — likely legacy config on a shared department, not a builder runtime tile.`
            : `Runtime department is provisioned for workspace.`,
    });

    checks.push({
        id: "builder_catalog",
        label: "Exists in Lifecycle Builder",
        pass: catalogMatchesSelected,
        href: null,
        detail: catalogMatchesSelected
            ? `Catalog row department_id === ${selectedDepartmentId}.`
            : entry
              ? `Catalog has process on department ${entry.department_id}, not selected ${selectedDepartmentId}.`
              : `No catalog row for selected id ${selectedDepartmentId} + process ${activation.process_id}.`,
    });

    checks.push({
        id: "backing_department",
        label: "Backing department exists",
        pass: id_audit.presence.in_backing_department_row,
        href: null,
        detail: id_audit.presence.in_backing_department_row
            ? `departments.id === ${selectedDepartmentId} exists in org ${orgId}.`
            : `No backing row for selected department_id ${selectedDepartmentId}.`,
    });

    checks.push({
        id: "workspace_access",
        label: "Workspace access/membership provisioned",
        pass: workspaceAccessPass,
        href: null,
        detail: workspaceAccessDetail,
    });

    checks.push({
        id: "workspace_api",
        label: "Visible in /workspace API",
        pass: inApiForUser,
        href: inApiForUser ? workspaceDeptHref(selectedDepartmentId) : null,
        detail: inApiForUser
            ? `Selected id ${selectedDepartmentId} is in GET /api/admin/departments (${tileTrace.apiDepartmentIds.length} ids).`
            : !inApi
              ? `Fail: Selected lifecycle department ID is not returned by /workspace API. Selected=${selectedDepartmentId}. API ids=[${apiIdsList}]. ${id_audit.mismatch_hints.join(" ")}`
              : `Department row exists but workspace access/membership is not provisioned for restricted scope.`,
    });

    checks.push({
        id: "workspace_rendered_tiles",
        label: "Rendered workspace tile list",
        pass: inRenderedTiles && workspaceAccessPass,
        href: inRenderedTiles && workspaceAccessPass ? workspaceDeptHref(selectedDepartmentId) : null,
        detail:
            inRenderedTiles && workspaceAccessPass
                ? `Selected id ${selectedDepartmentId} is in rendered tile list (${tileTrace.renderedTileIds.length} ids).`
                : renderedFailReason ??
                  `Selected id ${selectedDepartmentId} missing from rendered tiles or access. API ids=[${apiIdsList}].`,
    });

    checks.push({
        id: "user_access",
        label: "Current user access",
        pass: userHasAccess,
        href: null,
        detail: userHasAccess
            ? `Access scope includes selected department_id ${selectedDepartmentId}.`
            : `Access scope excludes selected department_id ${selectedDepartmentId}.`,
    });

    const tileRow = workspaceRows.find((d) => d.id === selectedDepartmentId);
    const tileName = (tileRow?.name ?? "").trim();
    const lifecycleName = activation.lifecycle_name?.trim() ?? "";
    const nameMatchPass =
        !activation.activation_owned ||
        !lifecycleName ||
        (Boolean(tileRow) && tileName.toLowerCase() === lifecycleName.toLowerCase());

    checks.push({
        id: "workspace_tile",
        label: "Lifecycle name matches tile",
        pass: nameMatchPass,
        href: nameMatchPass ? OPERATOR_WORKSPACE_HREF : null,
        detail: !activation.activation_owned
            ? "Legacy lifecycle uses shared department tile (name match not required)."
            : !tileRow
              ? `Cannot match name — selected id ${selectedDepartmentId} not in workspace API.`
              : nameMatchPass
                ? `Tile “${tileName}” matches lifecycle “${lifecycleName}”.`
                : `Tile “${tileName}” does not match lifecycle “${lifecycleName}”.`,
    });

    type WorkUnitRow = {
        id: string;
        key: string;
        name: string;
        is_active: boolean;
        queue_definition: unknown;
        department_id: string;
    };

    let workUnit: WorkUnitRow | null = null;

    if (activation.work_unit_id) {
        const { data: wu } = await supabase
            .from("work_units")
            .select("id, key, name, queue_definition, department_id, is_active")
            .eq("id", activation.work_unit_id)
            .eq("org_id", orgId)
            .eq("department_id", departmentId)
            .maybeSingle();
        if (wu && (wu as { is_active?: boolean }).is_active !== false) {
            workUnit = wu as WorkUnitRow;
        }
    }
    if (!workUnit && activation.stage_key) {
        const stageWu = await loadLifecycleStageWorkUnitForDepartment(
            supabase,
            orgId,
            departmentId,
            activation.stage_key
        );
        if (stageWu) workUnit = stageWu as WorkUnitRow;
    }
    const { data: deptWorkUnits } = await supabase
        .from("work_units")
        .select("id, key, name, is_active, queue_definition, metadata")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("is_active", true);

    const deptMetaForRuntime =
        id_audit.presence.in_backing_department_row && deptExists
            ? (
                  await supabase
                      .from("departments")
                      .select("metadata")
                      .eq("id", departmentId)
                      .eq("org_id", orgId)
                      .maybeSingle()
              ).data?.metadata
            : null;
    const builderOwnedRuntime = deptUsesBuilderOwnedLifecycleRuntime(
        deptMetaForRuntime,
        deptWorkUnits ?? []
    );

    if (!workUnit && !builderOwnedRuntime) {
        const pipeline = await loadEnrollmentPipelineWorkUnitForDepartment(supabase, orgId, departmentId);
        if (pipeline) workUnit = pipeline as WorkUnitRow;
    }

    const lifecycleStageWorkUnits = await listLifecycleStageWorkUnitsForDepartment(
        supabase,
        orgId,
        departmentId
    );

    const listedOnDept =
        workUnit &&
        (deptWorkUnits ?? []).some((r) => (r as { id: string }).id === workUnit!.id);

    const expectedQueueName = activation.work_unit_name?.trim() ?? "";
    const runtimeName = workUnit?.name?.trim() ?? "";
    const nameMatches = Boolean(
        workUnit &&
            runtimeName &&
            (expectedQueueName
                ? runtimeName.toLowerCase() === expectedQueueName.toLowerCase()
                : runtimeName.toLowerCase() !== "enrollment pipeline")
    );

    const isStageWu = workUnit ? isLifecycleStageWorkUnitKey(workUnit.key) : false;
    const isPipelineWu = workUnit?.key === ENROLLMENT_PIPELINE_WORK_UNIT_KEY;
    const deptQueuePass = builderOwnedRuntime
        ? lifecycleStageWorkUnits.length > 0
        : Boolean(workUnit && listedOnDept && nameMatches && (isStageWu || isPipelineWu));
    const stageWuNames = lifecycleStageWorkUnits.map((w) => w.name.trim()).filter(Boolean);
    const multiWuDetail =
        lifecycleStageWorkUnits.length > 1
            ? `${lifecycleStageWorkUnits.length} work units on /dept: ${stageWuNames.join(", ")}.`
            : lifecycleStageWorkUnits.length === 1
              ? `“${lifecycleStageWorkUnits[0]!.name}” is listed on the department page.`
              : null;

    checks.push({
        id: "dept_queue",
        label: "Department — Work Unit Queue",
        pass: deptQueuePass || lifecycleStageWorkUnits.length > 0,
        href:
            departmentId && (workUnit || lifecycleStageWorkUnits.length)
                ? OPERATOR_WORKSPACE_HREF
                : null,
        detail: !workUnit && !lifecycleStageWorkUnits.length
            ? "No Work Unit Queue saved for this department. Complete the Work Unit Queue step with a name and create the queue."
            : multiWuDetail ??
              (!listedOnDept
                  ? "Work unit exists in the database but is not listed on /dept for this department."
                  : !nameMatches
                    ? `Queue name in runtime is “${workUnit?.name ?? ""}” but activation saved “${expectedQueueName || "(empty)"}”.`
                    : `“${workUnit?.name ?? ""}” is listed on the department page.`),
    });

    let legacyPipelineLanesVisible = false;
    if (builderOwnedRuntime && (deptWorkUnits ?? []).length) {
        const pipelinePick = pickDeptPipelineWorkUnit(
            (deptWorkUnits ?? []).map((r) => ({
                id: (r as { id: string }).id,
                key: (r as { key?: string | null }).key ?? null,
                queue_definition: (r as { queue_definition?: unknown }).queue_definition,
                department_id: departmentId,
                metadata: (r as { metadata?: unknown }).metadata,
            })),
            departmentId
        );
        if (pipelinePick) {
            const bundle = tryLoadWorkUnitQueueDefinitionBundle(pipelinePick.queue_definition);
            if (bundle) {
                const lanes = extractPipelineExecutionLanes(bundle.def);
                legacyPipelineLanesVisible = deptPipelineSurfaceShowsLegacyEnrollmentLanes(lanes);
            }
        }
    }

    checks.push({
        id: "dept_runtime_lifecycle_work_units",
        label: "Department uses lifecycle work units",
        pass: !builderOwnedRuntime || lifecycleStageWorkUnits.length > 0,
        href: departmentId ? OPERATOR_WORKSPACE_HREF : null,
        detail: !builderOwnedRuntime
            ? "Legacy department — lifecycle work unit mode not required."
            : lifecycleStageWorkUnits.length > 0
              ? `${lifecycleStageWorkUnits.length} lifecycle work unit(s) ready for /dept (${stageWuNames.join(", ") || "unnamed"}).`
              : "No lifecycle_wu_* work units found. Create or repair stage queues.",
    });

    checks.push({
        id: "dept_no_legacy_pipeline_lanes",
        label: "No legacy enrollment pipeline lanes on /dept",
        pass: !builderOwnedRuntime || !legacyPipelineLanesVisible,
        href: departmentId ? OPERATOR_WORKSPACE_HREF : null,
        detail: !builderOwnedRuntime
            ? "Not a builder-owned lifecycle department."
            : legacyPipelineLanesVisible
              ? "/dept would still show legacy template lanes (Tours, Follow Up, Waitlist…). Run Repair lifecycle work units and refresh."
              : "Builder-owned /dept will not render enrollment_pipeline lane cards.",
    });

    const statusRows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", {
        activeOnly: true,
    });
    const builder = lifecycleBuilderFromDepartmentMetadata(deptMetaForRuntime);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const configuredStageKeys =
        process?.stages.map((s) => s.key.trim()).filter(Boolean) ??
        configuredStageKeysForMetadata(deptMetaForRuntime);
    const workUnitStageKeys = lifecycleStageWorkUnits.flatMap((w) => {
        const fromMeta = stageKeyFromLifecycleWorkUnitMetadata(w.metadata);
        if (fromMeta) return [fromMeta];
        if (isLifecycleStageWorkUnitKey(w.key)) {
            return [w.key.slice(LIFECYCLE_STAGE_WORK_UNIT_KEY_PREFIX.length)];
        }
        return [];
    });
    const stageKeysForStatusPayload = [
        ...new Set([...configuredStageKeys, ...workUnitStageKeys]),
    ].filter(Boolean);
    const statusPayload = buildEnrollmentStatusStagesPayload(
        statusRows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        })),
        stageKeysForStatusPayload.length ? stageKeysForStatusPayload : undefined
    );

    let queueFiltersPass = false;
    let queueFiltersDetail = "Assign statuses and create the work unit queue first.";

    let recordsQueryPass = false;
    let recordsQueryDetail = "Assign statuses and create the queue first.";
    let recordsQueryHref: string | null = null;

    if (builderOwnedRuntime && lifecycleStageWorkUnits.length > 0) {
        const processId = processIdFromDepartmentMetadata(deptMetaForRuntime);
        const stagesToValidate =
            stageKeysForStatusPayload.length > 0
                ? stageKeysForStatusPayload
                : [
                      ...new Set(
                          lifecycleStageWorkUnits.flatMap((wu) => {
                              const sk =
                                  stageKeyFromLifecycleWorkUnitMetadata(wu.metadata) ??
                                  (isLifecycleStageWorkUnitKey(wu.key)
                                      ? wu.key.slice(LIFECYCLE_STAGE_WORK_UNIT_KEY_PREFIX.length)
                                      : null);
                              return sk ? [sk] : [];
                          })
                      ),
                  ];
        const filterRows: ReturnType<typeof validateLifecycleStageWorkUnitQueueFilter>[] = [];
        for (const stageKey of stagesToValidate) {
            const identity = await resolveLifecycleStageWorkUnitIdentityForDepartment(supabase, {
                orgId,
                departmentId,
                stageKey,
                processId,
            });
            if (identity.state === "conflict") {
                filterRows.push({
                    stage_key: stageKey,
                    work_unit_id: identity.conflictingActiveRows[0]?.id ?? "",
                    work_unit_key: identity.workUnitKey,
                    work_unit_name: identity.conflictingActiveRows[0]?.name ?? stageKey,
                    expected_status_keys: assignedStatusKeysFromPayloadForStage(statusPayload, stageKey),
                    queue_status_keys: [],
                    pass: false,
                    detail: `Stage “${stageKey}”: multiple active work units share key ${identity.workUnitKey}. Repair to dedupe.`,
                });
                continue;
            }
            if (!identity.workUnit) continue;
            filterRows.push(
                validateLifecycleStageWorkUnitQueueFilter({
                    stageKey,
                    workUnit: identity.workUnit,
                    statusPayload,
                    activation,
                })
            );
        }
        const activationStageKey = activation.stage_key.trim();
        const rowsForCompact =
            activation.activation_owned && activationStageKey
                ? filterRows.filter((r) => r.stage_key === activationStageKey)
                : filterRows;
        const filterSummary = summarizeBuilderOwnedQueueFilterValidation(
            rowsForCompact.length ? rowsForCompact : filterRows
        );
        queueFiltersPass = filterSummary.pass;
        queueFiltersDetail = filterSummary.detail;

        const queryTargets = filterRows.filter((r) => r.expected_status_keys.length > 0);
        if (!queryTargets.length) {
            recordsQueryPass = true;
            recordsQueryDetail =
                "No statuses assigned to stages yet — records query will be ready after status selection.";
        } else {
            const queryErrors: string[] = [];
            let totalVisible = 0;
            let totalAssignedHome = 0;
            let firstWuId: string | null = null;

            for (const row of queryTargets) {
                try {
                    const counts = await countLifecycleOpportunityRecordsForWorkUnit({
                        supabase,
                        orgId,
                        departmentId,
                        lifecycleWorkUnitId: row.work_unit_id,
                        statusKeys: row.expected_status_keys,
                    });
                    if (!firstWuId) firstWuId = row.work_unit_id;
                    totalVisible += counts.matching_by_status;
                    totalAssignedHome += counts.assigned_to_lifecycle_work_unit;
                } catch (e) {
                    queryErrors.push(
                        `${row.work_unit_name}: ${e instanceof Error ? e.message : "query failed"}`
                    );
                }
            }

            if (queryErrors.length) {
                recordsQueryPass = false;
                recordsQueryDetail = `Records query failed: ${queryErrors.join("; ")}`;
            } else if (totalVisible === 0) {
                recordsQueryPass = true;
                recordsQueryDetail = LIFECYCLE_NO_RECORDS_IN_LIFECYCLE_YET_COPY;
                recordsQueryHref = firstWuId ? OPERATOR_WORKSPACE_HREF : null;
            } else {
                recordsQueryPass = true;
                const notAssigned = Math.max(0, totalVisible - totalAssignedHome);
                recordsQueryDetail =
                    notAssigned > 0
                        ? `${totalVisible} record(s) visible by lifecycle filters. ${totalAssignedHome} assigned to lifecycle work units (${lifecycleRecordsVisibleNotAssignedCopy(notAssigned)}).`
                        : `${totalVisible} record(s) visible by lifecycle filters. ${totalAssignedHome} assigned to lifecycle work units.`;
                recordsQueryHref = firstWuId ? OPERATOR_WORKSPACE_HREF : null;
            }

            checks.push({
                id: "lifecycle_visibility_ui_parity",
                label: "Queue visibility matches Configuration counts",
                pass: recordsQueryPass,
                href: recordsQueryHref,
                detail: recordsQueryDetail,
            });
        }
    } else if (workUnit && activation.status_keys.length) {
        const operatorStage = isOperatorStage(activation.stage_key) ? activation.stage_key : null;
        const keysForFilter = operatorStage
            ? statusKeysForOperatorStageQueueSync(operatorStage, activation.status_keys)
            : activation.status_keys;
        const queueKeys = queueStatusKeysForLifecycleWorkUnitValidation(workUnit, activation.stage_key);
        const filterOk = queueFilterIncludesExpectedStatuses(queueKeys, keysForFilter);

        if (!operatorStage) {
            queueFiltersPass = false;
            queueFiltersDetail = `Stage key “${activation.stage_key}” is not a platform operator stage — queue mapping requires keys like lead, qualification, tour.`;
            recordsQueryPass = false;
            recordsQueryDetail = queueFiltersDetail;
        } else if (!filterOk) {
            queueFiltersPass = false;
            queueFiltersDetail =
                "Queue lane filters do not include all selected statuses. Use Repair queue filters on this check.";
            recordsQueryPass = false;
            recordsQueryDetail = queueFiltersDetail;
        } else {
            queueFiltersPass = true;
            queueFiltersDetail = "Queue filters match selected statuses for this stage.";
            const { count, error: countErr } = await supabase
                .from("opportunities")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("work_unit_id", workUnit.id)
                .in("status_key", keysForFilter);

            if (countErr) {
                recordsQueryPass = false;
                recordsQueryDetail = `Records query failed: ${countErr.message}`;
            } else if ((count ?? 0) === 0) {
                recordsQueryPass = true;
                recordsQueryDetail = LIFECYCLE_RECORDS_QUERY_ZERO_COPY;
                recordsQueryHref = lifecycleValidationWorkUnitHref(workUnit);
            } else {
                recordsQueryPass = true;
                recordsQueryDetail = `${count} record(s) match the selected status filter and should appear in the queue.`;
                recordsQueryHref = lifecycleValidationWorkUnitHref(workUnit);
            }
        }
    } else if (builderOwnedRuntime && lifecycleStageWorkUnits.length === 0) {
        queueFiltersPass = false;
        recordsQueryPass = false;
        queueFiltersDetail = "No lifecycle_wu_* work units — repair or create stage queues.";
        recordsQueryDetail = queueFiltersDetail;
    }

    checks.push({
        id: "work_unit_queue_filters",
        label: "Work unit — queue filters",
        pass: queueFiltersPass,
        href:
            departmentId && lifecycleStageWorkUnits[0]
                ? OPERATOR_WORKSPACE_HREF
                : departmentId && workUnit
                  ? OPERATOR_WORKSPACE_HREF
                  : null,
        detail: queueFiltersDetail,
    });

    checks.push({
        id: "work_unit_records_query",
        label: "Work unit — records query",
        pass: recordsQueryPass,
        href: recordsQueryHref,
        detail: recordsQueryDetail,
    });

    checks.push({
        id: "work_unit_records",
        label: "Work unit — matching records",
        pass: recordsQueryPass,
        href: recordsQueryHref,
        detail: recordsQueryDetail,
    });

    const configuredActions = await loadLifecycleBuilderConfiguredActions(supabase, orgId);
    const enabledActions = configuredActions.filter((a) => a.placements.some((p) => p.is_active && p.placement_id));
    const placementSummary = summarizeLifecycleActionPlacementSurfaces(enabledActions);
    const actionPass = true;
    const actionDetail = formatLifecycleActionPlacementDetail(placementSummary);

    checks.push({
        id: "drawer_actions",
        label: "Actions — configured placements",
        pass: actionPass,
        href: OPERATOR_WORKSPACE_HREF,
        detail: actionDetail,
    });

    const naConfigured = lifecycleNeedsAttentionWorkUnitConfigured(deptWorkUnits ?? []);
    checks.push({
        id: "needs_attention_optional",
        label: "Needs Attention (optional)",
        pass: true,
        href: departmentId ? OPERATOR_WORKSPACE_HREF : null,
        detail: naConfigured
            ? "Needs Attention work unit is present (legacy or hybrid)."
            : "Not configured yet — throughput lifecycle stages still operate; Needs Attention sprint is optional.",
    });

    return { checks, id_audit };
}

/** Resolve status keys currently assigned to a stage (for activation bundle). */
export async function statusKeysForActivationStage(
    supabase: SupabaseClient,
    orgId: string,
    stageKey: string
): Promise<string[]> {
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const payload = buildEnrollmentStatusStagesPayload(
        rows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        })),
        [stageKey]
    );
    return (payload.stages[stageKey]?.statuses ?? []).map((s) => s.status_key);
}
