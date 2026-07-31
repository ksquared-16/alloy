/**
 * Canonical Lifecycle Builder stage save — Law 4, editor slice 1.
 *
 * WHAT CHANGED AND WHY
 *
 * This orchestrator used to issue four to six independent whole-column `UPDATE departments`
 * statements, each threading a snapshot read from before the previous write, with no CAS anywhere.
 * With the projection write guard enforcing, the first write succeeds and the rest fail — a TORN
 * STAGE. That is why the whole flow had to move at once rather than one call site at a time; the
 * full map is in docs/platform/governance/business-process-stage-save-decomposition.md.
 *
 * The shape now:
 *
 *   read (no writes) → transform in memory → validate touched references → ONE draft write
 *   → idempotent companion writes → one coherent result
 *
 * `departments.metadata.lifecycle_builder_v1` is never written here. It is the published runtime
 * projection and only `publish_business_process_revision_v1` may write it, so an ordinary stage
 * save now returns `publication_required: true` and leaves runtime untouched.
 *
 * The three non-builder destinations stay separate and are NOT folded into the publication payload:
 *   - `lifecycle_builder_stage_field_rules_v1` / `lifecycle_progression_requirements_v1` are
 *     top-level metadata siblings (category F) despite the "builder" in the name;
 *   - `status_definitions.metadata.process_stage_key` is per-org status vocabulary;
 *   - `work_units` is executable queue state derived from the stage.
 * No cross-resource transaction is claimed — see `companion_writes` in the result and §5 of the
 * decomposition doc for the contract that replaces one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
    BusinessProcessDraftEditConflictError,
    BusinessProcessStaleDraftError,
    draftBuilder,
    openDraft,
    readDraft,
    saveDraft,
} from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import type {
    ConfigurationError,
    ConfigurationWarning,
} from "@/lib/businessProcesses/configuration/configurationDiagnostics";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";
import {
    activeLifecycleProcess,
    configuredStageKeysForMetadata,
    serializeLifecycleBuilderV1,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { requireLifecycleStageQueueStatusKeys } from "@/lib/lifecycle/lifecycleStageQueueFilters";
import { effectiveLifecycleStageStatusKeys } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import type {
    LifecycleStageRuntimeConfigSnapshot,
    LifecycleStageSetupDebugTrace,
} from "@/lib/lifecycle/lifecycleStageRuntimeConfigTypes";
import { persistStageStatusAssignments } from "@/lib/lifecycle/persistEnrollmentStageStatusAssignments";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import {
    queueMembershipSubjectForStatusOptions,
    statusEntityTypeForSubject,
} from "@/lib/lifecycle/stageStatusRollup";
import { groupSelectedKeysByEntityType } from "@/lib/lifecycle/statusCategoryCatalog";
import { loadBusinessProcessStatusCategoryCatalog } from "@/lib/lifecycle/loadStatusCategoryCatalog";
import type { StageStatusEntityType } from "@/lib/lifecycle/stageStatusRollup";
import {
    fetchWorkUnitRowsForLifecycleStageIdentity,
    lifecycleStageWorkUnitNeedsQueueFilterSync,
    queueFilterKeysFromAssignedStatusKeys,
    resolveLifecycleStageWorkUnitIdentity,
    LifecycleStageWorkUnitIdentityConflictError,
    upsertLifecycleStageWorkUnitForDepartment,
    processIdFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import {
    lifecycleStageWorkUnitKey,
    type LifecycleStageWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { defaultWorkUnitQueueNameForStageKey } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import {
    queueStatusKeysForLifecycleWorkUnitValidation,
    validateLifecycleStageWorkUnitQueueFilter,
    type LifecycleStageQueueFilterValidation,
} from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { persistLifecycleStageFieldRules } from "@/lib/lifecycle/persistLifecycleStageFieldRules";
import { projectLifecycleStageQueueLaneKeys } from "@/lib/lifecycle/projectLifecycleStageQueueLanes";
import type { StageV2DraftInput } from "@/lib/lifecycle/persistStageV2DraftFields";
import {
    applyQueueMembershipDraft,
    applyStageOperatingPlanDraft,
    applyStagePerspectivesDraft,
    applyStageV2DraftFields,
    applyStatusRollupDraft,
    findActiveStageInBuilder,
    type StageDraftMutation,
} from "@/lib/lifecycle/stageDraftTransforms";
import { validateTouchedStageReferences } from "@/lib/lifecycle/validateTouchedStageReferences";
import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import { parseQueueMembershipV1, type QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import {
    parsePerspectivesV1,
    type PerspectiveConfigV1Stored,
} from "@/lib/lifecycle/perspectiveConfigV1";
import { parseStageOperatingPlanV1, type StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { parseStatusRollupV1, type StatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";

export type SaveLifecycleStageRuntimeConfigInput = {
    orgId: string;
    departmentId: string;
    processId?: string | null;
    stageKey: string;
    /** Source of truth for this transaction — never re-resolved from an empty DB bucket. */
    selectedStatusKeys: readonly string[];
    workUnitName?: string | null;
    /** Top-level metadata siblings, not part of the published lifecycle payload. */
    fieldRules?: LifecycleStageFieldRules | LifecycleStageFieldRulesStored | null;
    queueMembership?: QueueMembershipV1 | unknown | null;
    stageOperatingPlan?: StageOperatingPlanV1 | unknown | null;
    statusRollup?: StatusRollupV1 | unknown | null;
    perspectivesV1?: readonly PerspectiveConfigV1Stored[] | unknown | null;
    stageV2Draft?: StageV2DraftInput | null;
    /**
     * The publication the editor loaded against. When supplied and the draft has since been
     * rebased by a publish, the save is refused rather than silently written on top.
     * Omitted by callers that predate the publication model.
     */
    expectedBaseRevisionId?: string | null;
    /**
     * The `draft_revision` the editor loaded. This is the DRAFT-EDIT token — it catches a
     * colleague editing the same draft between publishes, which `expectedBaseRevisionId` cannot
     * see because that only moves at publish.
     */
    expectedDraftRevision?: number;
    actorUserId?: string | null;
};

export type CompanionWriteKey = "field_rules" | "status_assignments" | "work_unit";

export type CompanionWriteResult = {
    key: CompanionWriteKey;
    status: "skipped" | "succeeded" | "failed";
    error?: string;
};

/**
 * Two genuinely different conflicts, kept apart because the recovery differs:
 * `publication` means a newer configuration is already live; `draft_edit` means a colleague is
 * editing the same draft right now.
 */
export type StageDraftConflict =
    | {
          kind: "publication";
          code: "business_process_draft_stale";
          current_base_revision_id: string | null;
          attempted_base_revision_id: string | null;
      }
    | {
          kind: "draft_edit";
          code: "business_process_draft_edit_conflict";
          current_draft_revision: number | null;
          attempted_draft_revision: number;
      };

export type StageConfigurationSaveResult = {
    status: "saved" | "blocked" | "stale_conflict";
    snapshot: LifecycleStageRuntimeConfigSnapshot | null;
    draft: {
        id: string;
        base_revision_id: string | null;
        draft_revision: number;
        status: "draft" | "validated";
    } | null;
    /** Pre-existing graph defects — reported, never blocking (decision D3). */
    warnings: ConfigurationWarning[];
    /** References this save introduced on this stage. Non-empty means nothing was written. */
    errors: ConfigurationError[];
    conflict: StageDraftConflict | null;
    companion_writes: CompanionWriteResult[];
    /** Always true: the draft changed, runtime did not. Publishing is a separate, explicit act. */
    publication_required: true;
};

function mapStatusRows(rows: Awaited<ReturnType<typeof fetchEffectiveStatusDefinitions>>) {
    return rows.map((r) => ({
        status_key: r.status_key,
        status_label: r.status_label,
        sort_order: Number(r.sort_order) ?? 100,
        metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    }));
}

function readMetadataStatusKeys(metadata: unknown): string[] {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const keys = (metadata as LifecycleStageWorkUnitMetadata).status_keys;
    if (!Array.isArray(keys)) return [];
    return keys.map((k) => String(k ?? "").trim()).filter(Boolean);
}

export function buildLifecycleStageSetupDebugTrace(opts: {
    stageKey: string;
    selectedStatusKeysFromUi: readonly string[];
    snapshot: LifecycleStageRuntimeConfigSnapshot;
    validation: LifecycleStageQueueFilterValidation;
}): LifecycleStageSetupDebugTrace {
    return {
        stageKey: opts.stageKey,
        selectedStatusKeysFromUi: [...opts.selectedStatusKeysFromUi],
        savedStatusKeysFromApi: [...opts.snapshot.selectedStatusKeys],
        statusKeysPassedToWorkUnitSave: [...opts.snapshot.selectedStatusKeys],
        queueDefinitionFilterKeys: [...opts.snapshot.queueFilterKeys],
        metadataStatusKeys: [...opts.snapshot.metadataStatusKeys],
        validationExpectedKeys: [...opts.validation.expected_status_keys],
        validationActualKeys: [...opts.validation.queue_status_keys],
    };
}

/** Validate queue filters using the contract snapshot (not independent resolvers). */
export function validateLifecycleStageRuntimeConfigSnapshot(
    snapshot: LifecycleStageRuntimeConfigSnapshot,
    activation: LifecycleActivationV1
): LifecycleStageQueueFilterValidation {
    const stageKey = snapshot.stageKey;
    if (!snapshot.workUnitId) {
        return {
            stage_key: stageKey,
            work_unit_id: "",
            work_unit_key: snapshot.workUnitKey,
            work_unit_name: snapshot.workUnitName ?? stageKey,
            expected_status_keys: snapshot.selectedStatusKeys,
            queue_status_keys: [],
            pass: false,
            detail: `Stage “${stageKey}”: work unit queue not created yet.`,
        };
    }
    return validateLifecycleStageWorkUnitQueueFilter({
        stageKey,
        workUnit: {
            id: snapshot.workUnitId,
            key: snapshot.workUnitKey,
            name: snapshot.workUnitName ?? stageKey,
            queue_definition: snapshot.queueDefinitionRaw,
            metadata: {
                lifecycle_stage_key: stageKey,
                status_keys: snapshot.metadataStatusKeys,
                lifecycle_builder_owned_v1: { builder_owned: true },
            },
        },
        statusPayload: snapshot.statusStagesPayload,
        activation,
        contractSelectedStatusKeys: snapshot.selectedStatusKeys,
    });
}

/**
 * Status-stage payload for the response.
 *
 * `stageKeys` is supplied by the stage save from the draft it is holding. Without it this falls
 * back to re-reading `departments.metadata`, which is what other callers still need.
 */
export async function loadLifecycleStageStatusStagesPayload(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    stageKeys?: readonly string[]
) {
    let keys = stageKeys ? [...stageKeys] : null;
    if (!keys) {
        const { data: dept, error: deptErr } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", departmentId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (deptErr) throw new Error(deptErr.message);
        if (!dept) return buildEnrollmentStatusStagesPayload([], []);
        const metadata =
            dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
                ? (dept.metadata as Record<string, unknown>)
                : {};
        keys = configuredStageKeysForMetadata(metadata);
    }
    const rows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    return buildEnrollmentStatusStagesPayload(mapStatusRows(rows), keys);
}

/**
 * Membership for the WORK UNIT projection only.
 *
 * Deliberately separate from `applyQueueMembershipDraft`. Falling back to the template default
 * keeps queue runtime behaving exactly as before; what it must never do again is write that
 * default back into configuration as though an operator had chosen it. This is a class-4
 * compatibility read, and removing it belongs to the Law 2 (canonical ownership) slice.
 */
export function resolveEffectiveStageMembership(params: {
    stageKey: string;
    explicit: QueueMembershipV1 | null;
    stageMembership: QueueMembershipV1 | undefined;
}): QueueMembershipV1 | null {
    return (
        params.explicit ??
        params.stageMembership ??
        defaultEnrollmentQueueMembershipForStage(params.stageKey.trim()) ??
        null
    );
}

function accumulate(
    state: { builder: LifecycleBuilderV1; warnings: ConfigurationWarning[]; errors: ConfigurationError[] },
    mutation: StageDraftMutation,
): void {
    state.builder = mutation.nextBuilder;
    state.warnings.push(...mutation.warnings);
    state.errors.push(...mutation.errors);
}

/**
 * Full stage setup. One draft write, then idempotent companion writes.
 */
export async function saveLifecycleStageRuntimeConfig(
    supabase: SupabaseClient,
    input: SaveLifecycleStageRuntimeConfigInput
): Promise<StageConfigurationSaveResult> {
    const stageKey = input.stageKey.trim();
    if (!stageKey) throw new Error("stageKey is required");

    const selectedStatusKeys = requireLifecycleStageQueueStatusKeys(
        stageKey,
        effectiveLifecycleStageStatusKeys(stageKey, input.selectedStatusKeys),
    );

    // ---- phase 1: read. Nothing below this block writes until phase 4. -------------------------

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", input.departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (deptErr) throw new Error(deptErr.message);
    if (!dept) throw new Error("Department not found");
    const departmentMetadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const existingDraft = await readDraft(supabase, {
        orgId: input.orgId,
        departmentId: input.departmentId,
    });

    // A stale-draft check must not be defeated by materializing a fresh draft first, so it runs
    // against the draft as found — before `openDraft` would rebase it onto the current publication.
    if (
        input.expectedBaseRevisionId !== undefined &&
        existingDraft &&
        existingDraft.baseRevisionId !== input.expectedBaseRevisionId
    ) {
        return {
            status: "stale_conflict",
            snapshot: null,
            draft: null,
            warnings: [],
            errors: [],
            conflict: {
                kind: "publication",
                code: "business_process_draft_stale",
                current_base_revision_id: existingDraft.baseRevisionId,
                attempted_base_revision_id: input.expectedBaseRevisionId,
            },
            companion_writes: [],
            publication_required: true,
        };
    }

    // The draft-edit token. Checked before any transform so a losing writer does no work and,
    // more importantly, performs no companion writes.
    if (
        input.expectedDraftRevision !== undefined &&
        existingDraft &&
        existingDraft.draftRevision !== input.expectedDraftRevision
    ) {
        return {
            status: "stale_conflict",
            snapshot: null,
            draft: null,
            warnings: [],
            errors: [],
            conflict: {
                kind: "draft_edit",
                code: "business_process_draft_edit_conflict",
                current_draft_revision: existingDraft.draftRevision,
                attempted_draft_revision: input.expectedDraftRevision,
            },
            companion_writes: [],
            publication_required: true,
        };
    }

    const draft =
        existingDraft ??
        (await openDraft(supabase, {
            orgId: input.orgId,
            departmentId: input.departmentId,
            actorUserId: input.actorUserId ?? null,
        }));

    const baseBuilder = draftBuilder(draft);
    if (!baseBuilder) {
        // Law 1: never degrade an unparseable blob to a default and then persist that default.
        throw new Error("The saved Business Process configuration could not be read.");
    }

    const stageRecord = findActiveStageInBuilder(baseBuilder, stageKey);
    if (!stageRecord) {
        return {
            status: "blocked",
            snapshot: null,
            draft: {
                id: draft.id,
                base_revision_id: draft.baseRevisionId,
                draft_revision: draft.draftRevision,
                status: draft.status,
            },
            warnings: [],
            errors: [
                {
                    code: "stage_not_configured",
                    stage_key: stageKey,
                    message: `Stage “${stageKey}” is not configured on this department.`,
                },
            ],
            conflict: null,
            companion_writes: [],
            publication_required: true,
        };
    }

    const explicitMembership =
        input.queueMembership !== undefined && input.queueMembership !== null
            ? parseQueueMembershipV1(input.queueMembership)
            : null;
    const explicitOperatingPlan =
        input.stageOperatingPlan !== undefined && input.stageOperatingPlan !== null
            ? parseStageOperatingPlanV1(input.stageOperatingPlan)
            : null;
    const parsedRollup = parseStatusRollupV1(input.statusRollup);

    let explicitPerspectives: PerspectiveConfigV1Stored[] | undefined;
    if (input.perspectivesV1 !== undefined && input.perspectivesV1 !== null) {
        const parsed = parsePerspectivesV1(input.perspectivesV1);
        if (parsed === null) throw new Error("Invalid perspectives_v1");
        explicitPerspectives = parsed;
    }

    const effectiveMembership = resolveEffectiveStageMembership({
        stageKey,
        explicit: explicitMembership,
        stageMembership: stageRecord.queue_membership_v1,
    });
    const subjectType = queueMembershipSubjectForStatusOptions({
        stageKey,
        trackKey: stageRecord.track_key ?? null,
        queueMembership: effectiveMembership,
    });
    const statusEntityType = statusEntityTypeForSubject(subjectType);

    const processId =
        input.processId !== undefined && input.processId !== null
            ? String(input.processId).trim() || null
            : processIdFromDepartmentMetadata(departmentMetadata) ??
              activeLifecycleProcess(baseBuilder)?.id ??
              null;

    // Work-unit identity is resolved (not written) here so a duplicate-queue conflict aborts
    // before anything is persisted, and so perspectives can project their lanes without a write.
    const workUnitKey = lifecycleStageWorkUnitKey(stageKey);
    const workUnitRows = await fetchWorkUnitRowsForLifecycleStageIdentity(
        supabase,
        input.orgId,
        input.departmentId,
        stageKey,
    );
    let identity = resolveLifecycleStageWorkUnitIdentity(
        { orgId: input.orgId, departmentId: input.departmentId, stageKey, processId },
        workUnitRows,
    );
    if (identity.state === "conflict") {
        throw new LifecycleStageWorkUnitIdentityConflictError(identity);
    }

    const filterKeys = queueFilterKeysFromAssignedStatusKeys(stageKey, selectedStatusKeys);
    const workUnitNameTrimmed = input.workUnitName?.trim() ?? null;

    // ---- phase 2: transform. One builder, in memory. -------------------------------------------

    const state = {
        builder: baseBuilder,
        warnings: [] as ConfigurationWarning[],
        errors: [] as ConfigurationError[],
    };

    accumulate(state, applyStatusRollupDraft(state.builder, { stageKey, rollup: parsedRollup }));
    accumulate(
        state,
        applyQueueMembershipDraft(state.builder, { stageKey, membership: explicitMembership }),
    );
    accumulate(
        state,
        applyStageOperatingPlanDraft(state.builder, { stageKey, plan: explicitOperatingPlan }),
    );
    accumulate(
        state,
        applyStageV2DraftFields(state.builder, { stageKey, draft: input.stageV2Draft ?? null }),
    );

    if (explicitPerspectives !== undefined) {
        const laneKeys = projectLifecycleStageQueueLaneKeys({
            stageKey,
            displayName:
                workUnitNameTrimmed ||
                identity.workUnit?.name?.trim() ||
                stageRecord.label.trim() ||
                defaultWorkUnitQueueNameForStageKey(stageKey),
            statusFilterKeys: filterKeys,
            existingQueueDefinition: identity.workUnit?.queue_definition ?? null,
            membership: effectiveMembership,
        });
        accumulate(
            state,
            applyStagePerspectivesDraft(state.builder, {
                stageKey,
                perspectives: explicitPerspectives,
                laneKeys,
            }),
        );
    }

    // ---- phase 3: validate touched references (decision D3) ------------------------------------

    const touched = validateTouchedStageReferences({
        before: baseBuilder,
        after: state.builder,
        stageKey,
    });
    state.warnings.push(...touched.warnings);
    state.errors.push(...touched.errors);

    if (state.errors.length) {
        return {
            status: "blocked",
            snapshot: null,
            draft: {
                id: draft.id,
                base_revision_id: draft.baseRevisionId,
                draft_revision: draft.draftRevision,
                status: draft.status,
            },
            warnings: state.warnings,
            errors: state.errors,
            conflict: null,
            companion_writes: [],
            publication_required: true,
        };
    }

    // ---- phase 4: the single draft write -------------------------------------------------------

    const nextPayload = serializeLifecycleBuilderV1(state.builder);
    const builderChanged =
        businessProcessPayloadChecksum(nextPayload) !==
        businessProcessPayloadChecksum(serializeLifecycleBuilderV1(baseBuilder));

    let savedDraft = draft;
    if (builderChanged) {
        try {
            savedDraft = await saveDraft(supabase, {
                orgId: input.orgId,
                departmentId: input.departmentId,
                builder: state.builder,
                actorUserId: input.actorUserId ?? null,
                expectedDraftRevision: draft.draftRevision,
            });
        } catch (e) {
            if (e instanceof BusinessProcessDraftEditConflictError) {
                // Lost the compare-and-set between our read and our write. Nothing was written.
                return {
                    status: "stale_conflict",
                    snapshot: null,
                    draft: null,
                    warnings: state.warnings,
                    errors: [],
                    conflict: {
                        kind: "draft_edit",
                        code: "business_process_draft_edit_conflict",
                        current_draft_revision: e.currentDraftRevision,
                        attempted_draft_revision: e.attemptedDraftRevision,
                    },
                    companion_writes: [],
                    publication_required: true,
                };
            }
            if (e instanceof BusinessProcessStaleDraftError) {
                return {
                    status: "stale_conflict",
                    snapshot: null,
                    draft: null,
                    warnings: state.warnings,
                    errors: [],
                    conflict: {
                        kind: "publication",
                        code: "business_process_draft_stale",
                        current_base_revision_id: e.currentRevisionId,
                        attempted_base_revision_id: e.attemptedBaseRevisionId,
                    },
                    companion_writes: [],
                    publication_required: true,
                };
            }
            throw e;
        }
    }

    // ---- phase 5: companion writes. Idempotent, ordered, reported honestly. ---------------------

    const companion_writes: CompanionWriteResult[] = [];

    const runCompanion = async (key: CompanionWriteKey, run: () => Promise<void>) => {
        try {
            await run();
            companion_writes.push({ key, status: "succeeded" });
            return true;
        } catch (e) {
            companion_writes.push({
                key,
                status: "failed",
                error: e instanceof Error ? e.message : String(e),
            });
            return false;
        }
    };

    if (input.fieldRules) {
        await runCompanion("field_rules", async () => {
            // Re-read immediately before the write: this is a whole-column update, and reusing the
            // phase-1 snapshot would let it roll back an interleaved publish of the builder blob
            // it does not own (writer inventory, finding 6). We never change the builder key, so
            // the guard sees `IS NOT DISTINCT FROM` and passes.
            const { data: fresh, error: freshErr } = await supabase
                .from("departments")
                .select("metadata")
                .eq("id", input.departmentId)
                .eq("org_id", input.orgId)
                .maybeSingle();
            if (freshErr) throw new Error(freshErr.message);
            const current =
                fresh?.metadata != null &&
                typeof fresh.metadata === "object" &&
                !Array.isArray(fresh.metadata)
                    ? (fresh.metadata as Record<string, unknown>)
                    : {};
            await persistLifecycleStageFieldRules(supabase, {
                orgId: input.orgId,
                departmentId: input.departmentId,
                stageKey,
                fieldRules: input.fieldRules!,
                existingMetadata: current,
            });
        });
    } else {
        companion_writes.push({ key: "field_rules", status: "skipped" });
    }

    await runCompanion("status_assignments", async () => {
        if (parsedRollup) {
            // Rollup categories can span entity types; assign each group under its own type.
            const catalog = await loadBusinessProcessStatusCategoryCatalog(supabase, input.orgId);
            const allSelected = parsedRollup.categories.flatMap((c) => c.selected_status_keys);
            for (const [rawEntityType, keys] of groupSelectedKeysByEntityType(catalog, allSelected)) {
                if (!keys.length) continue;
                const entityType = normalizeStatusEntityType(rawEntityType);
                if (!entityType) continue;
                await persistStageStatusAssignments(supabase, input.orgId, stageKey, keys, entityType);
            }
            return;
        }
        await persistStageStatusAssignments(
            supabase,
            input.orgId,
            stageKey,
            selectedStatusKeys,
            statusEntityType,
        );
    });

    let workUnitId: string | null = identity.workUnit?.id ?? null;
    let workUnitName: string | null = identity.workUnit?.name ?? null;
    let queueDefinitionRaw: unknown = identity.workUnit?.queue_definition ?? null;
    let metadataStatusKeys: string[] = readMetadataStatusKeys(identity.workUnit?.metadata);
    let queueFilterKeys: string[] = identity.workUnit
        ? queueStatusKeysForLifecycleWorkUnitValidation(
              {
                  id: identity.workUnit.id,
                  key: identity.workUnit.key,
                  name: identity.workUnit.name,
                  queue_definition: identity.workUnit.queue_definition,
              },
              stageKey,
          )
        : [];

    // Same trigger as before the migration: an explicit queue name always upserts; otherwise only
    // an existing row with a resolvable membership is re-synced. A missing row with no name stays
    // missing — creating one here would be authoring the operator did not ask for.
    const shouldUpsertWorkUnit =
        Boolean(workUnitNameTrimmed) || (Boolean(identity.workUnit) && Boolean(effectiveMembership));

    if (shouldUpsertWorkUnit) {
        await runCompanion("work_unit", async () => {
            const { identity: nextIdentity } = await upsertLifecycleStageWorkUnitForDepartment(
                supabase,
                input.orgId,
                input.departmentId,
                stageKey,
                {
                    name: workUnitNameTrimmed || identity.workUnit?.name || stageRecord.label,
                    processId,
                    sortOrder: stageRecord.sort_order,
                    stageLabel: stageRecord.label,
                    statusKeys: selectedStatusKeys,
                    stageMembership: effectiveMembership,
                },
            );
            if (nextIdentity.state === "conflict" || !nextIdentity.workUnit) {
                throw new Error(`Work unit queue conflict for stage “${stageKey}”.`);
            }
            identity = nextIdentity;
            workUnitId = nextIdentity.workUnit.id;
            workUnitName = nextIdentity.workUnit.name;
            queueDefinitionRaw = nextIdentity.workUnit.queue_definition;
            metadataStatusKeys = readMetadataStatusKeys(nextIdentity.workUnit.metadata);
            queueFilterKeys = queueStatusKeysForLifecycleWorkUnitValidation(
                {
                    id: workUnitId,
                    key: nextIdentity.workUnit.key ?? workUnitKey,
                    name: workUnitName,
                    queue_definition: queueDefinitionRaw,
                },
                stageKey,
            );
        });
    } else {
        companion_writes.push({ key: "work_unit", status: "skipped" });
    }

    // Reads the status rows the assignment companion just reconciled — a different resource than
    // it wrote, after every write, feeding the response only.
    const activeProcess = activeLifecycleProcess(state.builder);
    const statusStagesPayload = await loadLifecycleStageStatusStagesPayload(
        supabase,
        input.orgId,
        input.departmentId,
        activeProcess?.stages.filter((s) => s.is_active).map((s) => s.key),
    );

    const synced =
        Boolean(workUnitId) &&
        !lifecycleStageWorkUnitNeedsQueueFilterSync({
            stageKey,
            assignedStatusKeys: selectedStatusKeys,
            workUnit: workUnitId ? { key: workUnitKey, queue_definition: queueDefinitionRaw } : null,
        });

    const snapshot: LifecycleStageRuntimeConfigSnapshot = {
        stageKey,
        selectedStatusKeys,
        workUnitId,
        workUnitKey,
        workUnitName,
        queueFilterKeys,
        metadataStatusKeys: metadataStatusKeys.length ? metadataStatusKeys : [...filterKeys],
        synced,
        statusStagesPayload,
        queueDefinitionRaw,
    };

    if (isLifecycleDebugUiEnabled()) {
        const activationStub: LifecycleActivationV1 = {
            version: 1,
            lifecycle_name: "",
            primary_entity: "opportunity",
            primary_record_label: "Lead",
            process_id: processId ?? "",
            stage_key: stageKey,
            stage_label: stageKey,
            work_unit_id: workUnitId,
            work_unit_name: workUnitName,
            status_keys: selectedStatusKeys,
            status_labels: selectedStatusKeys,
            action_definition_id: null,
            action_placement_ids: [],
            activation_owned: true,
            completed_steps: 4,
            updated_at: new Date().toISOString(),
        };
        const validation = validateLifecycleStageRuntimeConfigSnapshot(snapshot, activationStub);
        console.info(
            "[lifecycle-stage-runtime-config]",
            buildLifecycleStageSetupDebugTrace({
                stageKey,
                selectedStatusKeysFromUi: selectedStatusKeys,
                snapshot,
                validation,
            })
        );
    }

    return {
        status: "saved",
        snapshot,
        draft: {
            id: savedDraft.id,
            base_revision_id: savedDraft.baseRevisionId,
            draft_revision: savedDraft.draftRevision,
            status: savedDraft.status,
        },
        warnings: state.warnings,
        errors: [],
        conflict: null,
        companion_writes,
        publication_required: true,
    };
}

function normalizeStatusEntityType(entityType: string): StageStatusEntityType | null {
    const t = entityType.trim();
    if (t === "opportunities" || t === "opportunity") return "opportunities";
    if (t === "opportunity_customer_members" || t === "opportunity_customer_member") {
        return "opportunity_customer_members";
    }
    return null;
}
