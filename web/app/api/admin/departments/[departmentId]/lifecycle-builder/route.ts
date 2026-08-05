import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    departmentIdAllowed,
    effectiveDepartmentScopeDimensions,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import {
} from "@/lib/lifecycle/lifecycleBuilderOwned";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    addStageToProcess,
    createLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
    clampLifecycleDescription,
    reorderStage,
    removeProcessFromConfig,
    removeStageFromProcess,
    renameStage,
    setActiveProcess,
    updateProcessName,
    updateProcessDescription,
    updateStageDescription,
    updateStageGrain,
    ensureStageTransitionInConfig,
    updateProcessCommandSet,
    parseLifecycleBuilderV1,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { loadBusinessProcessEditorState } from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import {
    draftBuilder,
    openDraft,
    saveDraft,
} from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import { applyEnrollmentTemplateInConfig } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { syncWorkUnitSortOrderFromBuilderStages } from "@/lib/lifecycle/syncWorkUnitSortOrderFromBuilder";
import { logLifecycleBuilderSaveTiming } from "@/lib/lifecycle/lifecycleBuilderSaveTiming";
import {
    departmentMetadataHasLifecycleBuilderV1,
    lifecycleBuilderDepartmentNotFoundError,
    lifecycleBuilderDepartmentScopeError,
    lifecycleBuilderProcessNotFoundError,
    lifecycleBuilderV1MissingError,
} from "@/lib/lifecycle/lifecycleBuilderRouteErrors";
import { validateConfiguredStageReferences } from "@/lib/lifecycle/validateConfiguredStageReferences";
import { evaluateStageGrainChange } from "@/lib/lifecycle/stageGrainChangePreflight";
import { resolveStageGrain } from "@/lib/lifecycle/stageGrainResolution";
import { ensureBuilderCommandSetsOnSave } from "@/lib/lifecycle/ensureProcessCommandSetV1OnSave";
import { validateProcessCommandSetsForPublish } from "@/lib/lifecycle/validateProcessCommandSetsForPublish";

function processIdInConfig(config: LifecycleBuilderV1, processId: string): boolean {
    const pid = processId.trim();
    return Boolean(pid && config.processes.some((p) => p.id === pid));
}

function requireProcessInConfig(
    config: LifecycleBuilderV1,
    processId: string,
    departmentId: string,
    metadata: unknown
): NextResponse | null {
    const pid = processId.trim();
    if (!pid) return null;
    if (processIdInConfig(config, pid)) return null;
    if (!departmentMetadataHasLifecycleBuilderV1(metadata)) {
        return NextResponse.json(
            { error: lifecycleBuilderV1MissingError(departmentId) },
            { status: 404 }
        );
    }
    return NextResponse.json(
        { error: lifecycleBuilderProcessNotFoundError(pid, departmentId) },
        { status: 404 }
    );
}

async function loadDepartment(orgId: string, departmentId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("departments")
        .select("id, org_id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; metadata?: unknown } | null;
}

/**
 * `saveConfig` lived here and wrote `departments.metadata.lifecycle_builder_v1` directly. It is
 * deleted rather than left unused: that field is a published projection guarded at the database,
 * so the helper could not succeed, and an unused writer pointing at a forbidden target is exactly
 * the thing a future caller reaches for. Authoring goes through `saveDraft`.
 */

function payloadFromConfig(config: LifecycleBuilderV1) {
    const process = activeLifecycleProcess(config);
    return {
        config,
        active_process: process,
        stages: process ? activeStagesForProcess(process) : [],
    };
}

/** GET — lifecycle builder config for department (empty when never configured). */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = effectiveDepartmentScopeDimensions(scopeDimensionsFromAccess(access), access.roleKeys);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json(
            { error: lifecycleBuilderDepartmentScopeError(departmentId) },
            { status: 404 }
        );
    }

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) {
            return NextResponse.json(
                { error: lifecycleBuilderDepartmentNotFoundError(departmentId) },
                { status: 404 }
            );
        }

        /**
         * READ PRECEDENCE (Law 4, editor slices 2/3).
         *
         * This GET feeds the Stage editor's V2 fields — purpose, grain, description, operator
         * guidance, action catalog — through the `stageRecord` prop. Reading the PUBLISHED
         * projection here is what made a saved stage edit vanish on reload even though the stage
         * save had correctly written the draft: the save wrote one place and this read looked at
         * another.
         *
         * Found by browser certification, not by any unit test — the two halves only disagree once
         * a real reload happens.
         *
         * The PATCH below still writes the projection directly; migrating it is the next editor
         * family. That asymmetry is deliberate and temporary: reading the draft is strictly more
         * correct today, because the draft is seeded from the projection and only ever diverges by
         * an operator's own unpublished edits.
         */
        const editorState = await loadBusinessProcessEditorState(createAdminClient(), {
            orgId: ctx.orgId,
            departmentId,
            actorUserId: ctx.userId,
        });
        const config =
            (editorState ? parseLifecycleBuilderV1(editorState.draft_payload) : null) ??
            lifecycleBuilderFromDepartmentMetadata(row.metadata);

        return NextResponse.json(payloadFromConfig(config));
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
    }
}

/** PATCH — create/update lifecycle processes and stages. Admin only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = effectiveDepartmentScopeDimensions(scopeDimensionsFromAccess(access), access.roleKeys);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json(
            { error: lifecycleBuilderDepartmentScopeError(departmentId) },
            { status: 404 }
        );
    }

        let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const saveStartedAt = Date.now();
    const actionName = typeof body.action === "string" ? body.action.trim() : "";

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) {
            return NextResponse.json(
                { error: lifecycleBuilderDepartmentNotFoundError(departmentId) },
                { status: 404 }
            );
        }

        /**
         * AUTHORING WRITES THE DRAFT, NEVER THE PROJECTION.
         *
         * `departments.metadata.lifecycle_builder_v1` is a published projection, and
         * `trg_departments_lifecycle_projection_guard` refuses any write to it that publication
         * did not authorize. This route used to load from that projection and save straight back
         * to it, so once a department had configuration at all, EVERY action here failed at the
         * database — rename_stage as surely as update_stage_grain.
         *
         * The draft is the editable surface (`business_process_drafts`), and it already carries
         * both conflict tokens: `draft_revision` for concurrent edits, `base_revision_id` for
         * staleness against the publication. `openDraft` is idempotent and seeds the first draft
         * from the current publication, so a department that has never been edited enters here
         * with a faithful copy rather than an empty one.
         */
        const draftClient = createAdminClient();
        const draft = await openDraft(draftClient, {
            orgId: ctx.orgId,
            departmentId,
            actorUserId: ctx.userId,
            // Never-published departments seed from the projection they already have.
            templateSeed: lifecycleBuilderFromDepartmentMetadata(row.metadata),
        });
        const loadedDraftRevision = draft.draftRevision;
        let config = draftBuilder(draft) ?? lifecycleBuilderFromDepartmentMetadata(row.metadata);
        let ensuredTransition: { transition_ref: string; target_stage_key: string; created: boolean } | null = null;
        let commandSetChange: { added: string[]; removed: string[]; commands: string[] } | null = null;
        const action = typeof body.action === "string" ? body.action.trim() : "";

        switch (action) {
            case "create_process": {
                const name = typeof body.name === "string" ? body.name : "";
                const primary_entity = body.primary_entity === "opportunity" ? "opportunity" : "opportunity";
                const descriptionRaw = typeof body.description === "string" ? body.description : "";
                const description = descriptionRaw.trim()
                    ? clampLifecycleDescription(descriptionRaw)
                    : undefined;
                config = createLifecycleProcess(name, config, { primary_entity, description });
                break;
            }
            case "clear_active_process": {
                config = setActiveProcess(config, null);
                break;
            }
            case "update_process_name": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const name = typeof body.name === "string" ? body.name : "";
                if (!processId) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                config = updateProcessName(config, processId, name);
                break;
            }
            case "update_process_description": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const description = clampLifecycleDescription(
                    typeof body.description === "string" ? body.description : ""
                );
                if (!processId) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                config = updateProcessDescription(config, processId, description);
                break;
            }
            case "set_active_process": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                if (!processId) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                config = setActiveProcess(config, processId);
                break;
            }
            case "add_stage": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const label = typeof body.label === "string" ? body.label : "New stage";
                const description = typeof body.description === "string" ? body.description : undefined;
                const pid = processId || config.active_process_id || "";
                if (!pid) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                const missingProcess = requireProcessInConfig(config, pid, departmentId, row.metadata);
                if (missingProcess) return missingProcess;
                config = addStageToProcess(config, pid, label, { description });
                break;
            }
            case "update_stage_description": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const description = typeof body.description === "string" ? body.description : "";
                const pid = processId || config.active_process_id;
                if (!pid || !stageId) {
                    return NextResponse.json({ error: "process_id and stage_id are required" }, { status: 400 });
                }
                config = updateStageDescription(config, pid, stageId, description);
                break;
            }
            case "rename_stage": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const label = typeof body.label === "string" ? body.label : "";
                const pid = processId || config.active_process_id;
                if (!pid || !stageId) {
                    return NextResponse.json({ error: "process_id and stage_id are required" }, { status: 400 });
                }
                config = renameStage(config, pid, stageId, label);
                break;
            }
            /**
             * `grain` was persisted authored configuration with no authoring path: the enrollment
             * template seeded it, `add_stage` wrote it once, and nothing could correct it. That is
             * how a stage came to declare one journey while its own operating plan declared the
             * other, with no way for an operator to reconcile them.
             *
             * Accepts stage_key OR stage_id, because the operator-facing concept is the stage, not
             * its generated identifier. Refuses anything the preflight cannot vouch for.
             */
            /**
             * Transitions were authorable in the stage editor's draft but had no lifecycle-builder
             * ACTION, so a plan whose rules referenced a transition that was never persisted could
             * not be repaired through the canonical save path at all.
             *
             * Grain-checked with the same resolver the runtime and the editor use: a path may only
             * join two stages on the same journey.
             */
            case "ensure_stage_transition": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const sourceKey = typeof body.source_stage_key === "string" ? body.source_stage_key.trim() : "";
                const targetKey = typeof body.target_stage_key === "string" ? body.target_stage_key.trim() : "";
                const requestedRef = typeof body.transition_ref === "string" ? body.transition_ref.trim() : "";
                const pid = processId || config.active_process_id;

                if (!pid || !sourceKey || !targetKey) {
                    return NextResponse.json(
                        { error: "process_id, source_stage_key and target_stage_key are required" },
                        { status: 400 },
                    );
                }
                const proc = config.processes.find((p) => p.id === pid);
                if (!proc) return NextResponse.json({ error: "Process not found" }, { status: 404 });

                const src = proc.stages.find((s) => s.key === sourceKey);
                const dst = proc.stages.find((s) => s.key === targetKey);
                if (!src) return NextResponse.json({ error: "Source stage not found" }, { status: 404 });
                if (!dst) return NextResponse.json({ error: "Target stage not found" }, { status: 404 });
                if (src.key === dst.key) {
                    return NextResponse.json(
                        { error: "A stage cannot transition to itself" },
                        { status: 400 },
                    );
                }

                const srcGrain = resolveStageGrain({
                    stageKey: src.key,
                    operatingPlanJourneySegment: src.stage_operating_plan_v1?.journey_segment,
                    configuredMetadataGrain: src.grain,
                });
                const dstGrain = resolveStageGrain({
                    stageKey: dst.key,
                    operatingPlanJourneySegment: dst.stage_operating_plan_v1?.journey_segment,
                    configuredMetadataGrain: dst.grain,
                });
                if (!srcGrain.ok || !dstGrain.ok) {
                    return NextResponse.json(
                        { error: (srcGrain.ok ? dstGrain : srcGrain).message, code: "stage_grain_unresolved" },
                        { status: 409 },
                    );
                }
                if (srcGrain.grain !== dstGrain.grain) {
                    return NextResponse.json(
                        {
                            error:
                                `"${src.label || src.key}" belongs to `
                                + `${srcGrain.grain === "family" ? "the family case" : "individual children"}, `
                                + `and "${dst.label || dst.key}" belongs to `
                                + `${dstGrain.grain === "family" ? "the family case" : "individual children"}. `
                                + `A stage can only move records onto its own journey.`,
                            code: "stage_grain_mismatch",
                        },
                        { status: 409 },
                    );
                }

                try {
                    const result = ensureStageTransitionInConfig(
                        config,
                        pid,
                        sourceKey,
                        targetKey,
                        requestedRef || undefined,
                    );
                    config = result.config;
                    ensuredTransition = {
                        transition_ref: result.transition_ref,
                        target_stage_key: result.target_stage_key,
                        created: result.created,
                    };
                } catch (cause) {
                    return NextResponse.json(
                        {
                            error: cause instanceof Error ? cause.message : "Could not ensure transition",
                            code: "transition_ref_collision",
                        },
                        { status: 409 },
                    );
                }
                break;
            }
            /**
             * `command_set_v1` was authored configuration with no authoring path: only the
             * automatic stamp ever wrote it. A Work Template could reference a capability the
             * process had not selected, publication would refuse it, and no operator surface could
             * resolve the disagreement.
             *
             * Additions must resolve through the canonical registry, and the CANONICAL key is what
             * is stored. An unregistered key is rejected with a structured blocker rather than
             * written through raw-key fallback — which is how an unimplemented command would
             * otherwise be authorized by accident.
             */
            case "update_process_command_set": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const pid = processId || config.active_process_id;
                const addKeys = Array.isArray(body.add_capability_keys)
                    ? body.add_capability_keys.filter((k): k is string => typeof k === "string")
                    : [];
                const removeKeys = Array.isArray(body.remove_capability_keys)
                    ? body.remove_capability_keys.filter((k): k is string => typeof k === "string")
                    : [];

                if (!pid) {
                    return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                }
                if (!addKeys.length && !removeKeys.length) {
                    return NextResponse.json(
                        { error: "add_capability_keys or remove_capability_keys is required" },
                        { status: 400 },
                    );
                }
                if (!config.processes.some((p) => p.id === pid)) {
                    return NextResponse.json({ error: "Process not found" }, { status: 404 });
                }

                const result = updateProcessCommandSet(config, pid, {
                    addCapabilityKeys: addKeys,
                    removeCapabilityKeys: removeKeys,
                });
                if (result.rejected.length) {
                    // Nothing is written when any requested capability cannot be vouched for.
                    return NextResponse.json(
                        {
                            error:
                                `These commands are not registered in the platform capability `
                                + `registry and cannot be enabled: `
                                + result.rejected.map((r) => r.requested).join(", ")
                                + `.`,
                            code: "capability_unregistered",
                            rejected: result.rejected,
                        },
                        { status: 409 },
                    );
                }
                config = result.config;
                commandSetChange = {
                    added: result.added,
                    removed: result.removed,
                    commands: result.commandSet.commands.map((c) => c.capability_key),
                };
                break;
            }
            case "update_stage_grain": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageKey = typeof body.stage_key === "string" ? body.stage_key.trim() : "";
                const stageIdInput = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const grainInput = typeof body.grain === "string" ? body.grain.trim() : "";
                const pid = processId || config.active_process_id;

                if (grainInput !== "family" && grainInput !== "child") {
                    return NextResponse.json(
                        { error: 'grain must be "family" or "child"' },
                        { status: 400 },
                    );
                }
                if (!pid || (!stageKey && !stageIdInput)) {
                    return NextResponse.json(
                        { error: "process_id and stage_key (or stage_id) are required" },
                        { status: 400 },
                    );
                }
                const proc = config.processes.find((p) => p.id === pid);
                if (!proc) {
                    return NextResponse.json({ error: "Process not found" }, { status: 404 });
                }
                const stage = proc.stages.find(
                    (s) => (stageIdInput && s.id === stageIdInput) || (stageKey && s.key === stageKey),
                );
                if (!stage) {
                    return NextResponse.json({ error: "Stage not found" }, { status: 404 });
                }

                const decision = evaluateStageGrainChange({
                    stageKey: stage.key,
                    requestedGrain: grainInput,
                    currentConfiguredGrain: stage.grain,
                    operatingPlan: stage.stage_operating_plan_v1 ?? null,
                    processStages: proc.stages.map((s) => ({
                        key: s.key,
                        label: s.label,
                        grain: s.grain,
                    })),
                    otherStagePlans: proc.stages
                        .filter((s) => s.id !== stage.id)
                        .map((s) => s.stage_operating_plan_v1)
                        .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan)),
                });
                if (!decision.allowed) {
                    // Nothing is written when the change cannot be vouched for.
                    return NextResponse.json(
                        {
                            error: decision.blockers.map((b) => b.message).join(" "),
                            blockers: decision.blockers,
                        },
                        { status: 409 },
                    );
                }

                config = updateStageGrain(config, pid, stage.id, grainInput);
                break;
            }
            case "reorder_stage": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const direction = body.direction === "down" ? "down" : "up";
                const pid = processId || config.active_process_id;
                if (!pid || !stageId) {
                    return NextResponse.json({ error: "process_id and stage_id are required" }, { status: 400 });
                }
                config = reorderStage(config, pid, stageId, direction);
                break;
            }
            case "remove_process": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                if (!processId) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                config = removeProcessFromConfig(config, processId);
                break;
            }
            case "remove_stage": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const stageId = typeof body.stage_id === "string" ? body.stage_id.trim() : "";
                const pid = processId || config.active_process_id;
                if (!pid || !stageId) {
                    return NextResponse.json({ error: "process_id and stage_id are required" }, { status: 400 });
                }
                config = removeStageFromProcess(config, pid, stageId);
                break;
            }
            case "apply_enrollment_v2_template": {
                const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
                const pid = processId || config.active_process_id || "";
                if (!pid) return NextResponse.json({ error: "process_id is required" }, { status: 400 });
                const missingProcess = requireProcessInConfig(config, pid, departmentId, row.metadata);
                if (missingProcess) return missingProcess;
                try {
                    config = applyEnrollmentTemplateInConfig(config, pid);
                } catch (e) {
                    return NextResponse.json(
                        { error: e instanceof Error ? e.message : "Template apply failed" },
                        { status: 400 },
                    );
                }
                break;
            }
            default:
                return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }

        // PUBLISH-TIME REFERENTIAL INTEGRITY (Configured Stage Referential Integrity).
        // Reject any config that references a stage outside its own inventory — no silent drops.
        const referenceCheck = validateConfiguredStageReferences(config);
        if (!referenceCheck.ok) {
            return NextResponse.json(
                {
                    error:
                        "Business Process contains stage references that are not in its own stage inventory. " +
                        "Fix or remove them before saving.",
                    code: "dangling_stage_reference",
                    violations: referenceCheck.violations,
                },
                { status: 422 },
            );
        }

        // Stamp command_set_v1 before the readiness read so orphan checks see selection.
        config = ensureBuilderCommandSetsOnSave(config);

        /**
         * PUBLICATION READINESS — reported, never blocking.
         *
         * This check used to refuse the save with a 422, which made an incomplete draft impossible
         * to repair: every save was rejected, including the save that would have fixed the thing
         * being complained about. A draft is allowed to be mid-build; completeness is a question
         * asked at Validate and Publish, where `validateBusinessProcessForPublish` now asks it and
         * blocks on the answer.
         *
         * Structural and referential gates above stay blocking. Nothing is hidden: the issues ride
         * out on the save response so the editor can say "saved, not ready to publish" and name the
         * stages and Work Templates involved.
         */
        const commandSetCheck = validateProcessCommandSetsForPublish(config);

        // Compare-and-set on the revision the editor loaded: a colleague who saved in between
        // makes this fail rather than silently lose their work.
        const savedDraft = await saveDraft(draftClient, {
            orgId: ctx.orgId,
            departmentId,
            builder: ensureBuilderCommandSetsOnSave(config),
            actorUserId: ctx.userId,
            expectedDraftRevision: loadedDraftRevision,
        });
        if (actionName === "reorder_stage") {
            const deptRow = await loadDepartment(ctx.orgId, departmentId);
            if (!deptRow) {
                return NextResponse.json(
                    { error: lifecycleBuilderDepartmentNotFoundError(departmentId) },
                    { status: 404 }
                );
            }
            const metadata =
                deptRow.metadata !== null && typeof deptRow.metadata === "object" && !Array.isArray(deptRow.metadata)
                    ? (deptRow.metadata as Record<string, unknown>)
                    : {};
            const supabase = createAdminClient();
            await syncWorkUnitSortOrderFromBuilderStages(supabase, ctx.orgId, departmentId, metadata);
        }
        logLifecycleBuilderSaveTiming("lifecycle-builder-patch", saveStartedAt, { action: actionName });
        return NextResponse.json({
            ...payloadFromConfig(config),
            publication_readiness: {
                ready: commandSetCheck.ok,
                issues: commandSetCheck.issues,
            },
            draft_revision: savedDraft.draftRevision,
            ...(ensuredTransition ? { ensured_transition: ensuredTransition } : {}),
            ...(commandSetChange ? { command_set_change: commandSetChange } : {}),
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 400 });
    }
}
