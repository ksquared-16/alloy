/**
 * Side-by-side proof: Work Unit Queue card vs Runtime Validation queue-filter evaluation.
 * Diagnostics only — no repair or mutation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import {
    activeLifecycleProcess,
    configuredStageKeysForMetadata,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    assignedStatusKeysFromPayloadForStage,
    lifecycleStageWorkUnitNeedsQueueFilterSync,
    normalizeLifecycleStageKeyForIdentity,
    processIdFromDepartmentMetadata,
    queueFilterKeysFromAssignedStatusKeys,
    resolveLifecycleStageAssignedStatusKeys,
    resolveLifecycleStageWorkUnitIdentityForDepartment,
} from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import {
    isLifecycleStageWorkUnitKey,
    listLifecycleStageWorkUnitsForDepartment,
    LIFECYCLE_STAGE_WORK_UNIT_KEY_PREFIX,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    queueStatusKeysForLifecycleWorkUnitValidation,
    summarizeBuilderOwnedQueueFilterValidation,
    validateLifecycleStageWorkUnitQueueFilter,
    type LifecycleStageQueueFilterValidation,
} from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import { buildLifecycleActivationCompactChecks } from "@/lib/lifecycle/lifecycleActivationValidationCompact";
import type { LifecycleActivationCheckResult } from "@/lib/lifecycle/validateLifecycleActivationRuntime";

export type QueueFilterEvaluationSideId =
    | "work_unit_queue_card"
    | "runtime_validation_stage"
    | "runtime_validation_compact";

export type QueueFilterEvaluationSide = {
    id: QueueFilterEvaluationSideId;
    label: string;
    stage_key: string;
    stage_label: string | null;
    work_unit_id: string | null;
    work_unit_key: string | null;
    work_unit_name: string | null;
    expected_status_keys: string[];
    actual_queue_filter_keys: string[];
    pass: boolean;
    /** Human-readable resolver / code path */
    source: string;
    notes: string[];
};

export type QueueFilterEvaluationCompare = {
    department_id: string;
    org_id: string;
    focus_stage_key: string;
    focus_stage_label: string | null;
    sides: QueueFilterEvaluationSide[];
    diverges: boolean;
    divergence_reasons: string[];
    /** Per-stage rows runtime uses before compact summarize */
    runtime_all_stage_rows: LifecycleStageQueueFilterValidation[];
    runtime_stages_validated: string[];
    activation_bundle: {
        stage_key: string;
        work_unit_id: string | null;
        status_keys: string[];
    };
    /** What the compact UI maps to "Queue filters connected" */
    compact_check: {
        pass: boolean;
        summary: string;
        technical_detail: string | null;
        source: string;
    };
    card_ui_state_hints: {
        work_unit_identity_state_derived: string;
        queue_complete_derived: boolean;
        status_display_labels: string[];
    };
};

function sortedKeys(keys: readonly string[]): string[] {
    return [...keys].map((k) => k.trim().toLowerCase()).filter(Boolean).sort();
}

function keysEqual(a: readonly string[], b: readonly string[]): boolean {
    const sa = sortedKeys(a);
    const sb = sortedKeys(b);
    if (sa.length !== sb.length) return false;
    return sa.every((k, i) => k === sb[i]);
}

function missingFrom(actual: readonly string[], expected: readonly string[]): string[] {
    const inActual = new Set(sortedKeys(actual));
    return sortedKeys(expected).filter((k) => !inActual.has(k));
}

async function buildStatusPayloadForRuntime(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    deptMetadata: unknown
): Promise<{
    payload: ReturnType<typeof buildEnrollmentStatusStagesPayload>;
    stageKeysForPayload: string[];
}> {
    const lifecycleStageWorkUnits = await listLifecycleStageWorkUnitsForDepartment(
        supabase,
        orgId,
        departmentId
    );
    const builder = lifecycleBuilderFromDepartmentMetadata(deptMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const configuredStageKeys =
        process?.stages.map((s) => s.key.trim()).filter(Boolean) ??
        configuredStageKeysForMetadata(deptMetadata);
    const workUnitStageKeys = lifecycleStageWorkUnits.flatMap((w) => {
        const fromMeta = stageKeyFromLifecycleWorkUnitMetadata(w.metadata);
        if (fromMeta) return [fromMeta];
        if (isLifecycleStageWorkUnitKey(w.key)) {
            return [w.key.slice(LIFECYCLE_STAGE_WORK_UNIT_KEY_PREFIX.length)];
        }
        return [];
    });
    const stageKeysForPayload = [...new Set([...configuredStageKeys, ...workUnitStageKeys])].filter(
        Boolean
    );
    const statusRows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", {
        activeOnly: true,
    });
    const payload = buildEnrollmentStatusStagesPayload(
        statusRows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        })),
        stageKeysForPayload.length ? stageKeysForPayload : undefined
    );
    return { payload, stageKeysForPayload };
}

/** Mirrors validateLifecycleActivationRuntime builder-owned filter loop. */
async function runtimeFilterRowsForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    activation: LifecycleActivationV1,
    statusPayload: ReturnType<typeof buildEnrollmentStatusStagesPayload>,
    stageKeysForPayload: string[]
): Promise<{
    rows: LifecycleStageQueueFilterValidation[];
    stagesValidated: string[];
}> {
    const lifecycleStageWorkUnits = await listLifecycleStageWorkUnitsForDepartment(
        supabase,
        orgId,
        departmentId
    );
    const processId = processIdFromDepartmentMetadata(
        (
            await supabase
                .from("departments")
                .select("metadata")
                .eq("id", departmentId)
                .eq("org_id", orgId)
                .maybeSingle()
        ).data?.metadata
    );
    const stagesToValidate =
        stageKeysForPayload.length > 0
            ? stageKeysForPayload
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

    const rows: LifecycleStageQueueFilterValidation[] = [];
    for (const stageKey of stagesToValidate) {
        const identity = await resolveLifecycleStageWorkUnitIdentityForDepartment(supabase, {
            orgId,
            departmentId,
            stageKey,
            processId,
        });
        if (identity.state === "conflict") {
            rows.push({
                stage_key: stageKey,
                work_unit_id: identity.conflictingActiveRows[0]?.id ?? "",
                work_unit_key: identity.workUnitKey,
                work_unit_name: identity.conflictingActiveRows[0]?.name ?? stageKey,
                expected_status_keys: assignedStatusKeysFromPayloadForStage(statusPayload, stageKey),
                queue_status_keys: [],
                pass: false,
                detail: `Stage “${stageKey}”: multiple active work units share key ${identity.workUnitKey}.`,
            });
            continue;
        }
        if (!identity.workUnit) continue;
        rows.push(
            validateLifecycleStageWorkUnitQueueFilter({
                stageKey,
                workUnit: identity.workUnit,
                statusPayload,
                activation,
            })
        );
    }
    return { rows, stagesValidated: stagesToValidate };
}

/**
 * Evaluate Work Unit Queue card path (same as GET stage-work-unit + guided board state).
 */
export async function evaluateWorkUnitQueueCardSide(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    stageKey: string;
    stageLabel?: string | null;
}): Promise<QueueFilterEvaluationSide> {
    const stageKey = normalizeLifecycleStageKeyForIdentity(params.stageKey);
    const identity = await resolveLifecycleStageWorkUnitIdentityForDepartment(params.supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        stageKey,
    });
    const assigned = await resolveLifecycleStageAssignedStatusKeys(
        params.supabase,
        params.orgId,
        params.departmentId,
        stageKey
    );
    const expected = queueFilterKeysFromAssignedStatusKeys(stageKey, assigned);
    const workUnit = identity.workUnit;
    const actual = workUnit
        ? queueStatusKeysForLifecycleWorkUnitValidation(workUnit, stageKey)
        : [];
    const needsSync =
        identity.state === "conflict" ||
        lifecycleStageWorkUnitNeedsQueueFilterSync({
            stageKey,
            assignedStatusKeys: assigned,
            workUnit: workUnit,
        });
    const pass = identity.state === "created" && Boolean(workUnit) && !needsSync;

    const notes: string[] = [
        `identity.state=${identity.state}`,
        `needs_sync (GET)=${needsSync}`,
        `assigned_status_keys (bucket)=${JSON.stringify(assigned)}`,
    ];
    if (identity.state === "conflict") {
        notes.push("Card would show conflict; Complete only when synced.");
    }

    return {
        id: "work_unit_queue_card",
        label: "Work Unit Queue card",
        stage_key: stageKey,
        stage_label: params.stageLabel?.trim() ?? null,
        work_unit_id: workUnit?.id ?? null,
        work_unit_key: identity.workUnitKey,
        work_unit_name: workUnit?.name ?? null,
        expected_status_keys: expected,
        actual_queue_filter_keys: actual,
        pass,
        source:
            "GET /api/admin/enrollment-process/stage-work-unit → resolveLifecycleStageAssignedStatusKeys + queueFilterKeysFromAssignedStatusKeys (expected) + lifecycleStageWorkUnitNeedsQueueFilterSync (pass); LifecycleActivationBoard.loadPipeline sets workUnitIdentityState=synced when needs_sync=false",
        notes,
    };
}

/** Single-stage runtime row (validateLifecycleStageWorkUnitQueueFilter). */
export async function evaluateRuntimeValidationStageSide(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    stageKey: string;
    stageLabel?: string | null;
    activation: LifecycleActivationV1;
    statusPayload: ReturnType<typeof buildEnrollmentStatusStagesPayload>;
}): Promise<QueueFilterEvaluationSide> {
    const stageKey = normalizeLifecycleStageKeyForIdentity(params.stageKey);
    const processId = processIdFromDepartmentMetadata(
        (
            await params.supabase
                .from("departments")
                .select("metadata")
                .eq("id", params.departmentId)
                .eq("org_id", params.orgId)
                .maybeSingle()
        ).data?.metadata
    );
    const identity = await resolveLifecycleStageWorkUnitIdentityForDepartment(params.supabase, {
        orgId: params.orgId,
        departmentId: params.departmentId,
        stageKey,
        processId,
    });
    if (!identity.workUnit) {
        return {
            id: "runtime_validation_stage",
            label: "Runtime validation (focus stage only)",
            stage_key: stageKey,
            stage_label: params.stageLabel?.trim() ?? null,
            work_unit_id: null,
            work_unit_key: identity.workUnitKey,
            work_unit_name: null,
            expected_status_keys: [],
            actual_queue_filter_keys: [],
            pass: true,
            source:
                "validateLifecycleStageWorkUnitQueueFilter → expectedStatusKeysForLifecycleStageValidation (no work unit → pass with informational detail)",
            notes: ["No canonical work unit for this stage — runtime skips row in filter loop."],
        };
    }
    const row = validateLifecycleStageWorkUnitQueueFilter({
        stageKey,
        workUnit: identity.workUnit,
        statusPayload: params.statusPayload,
        activation: params.activation,
    });
    return {
        id: "runtime_validation_stage",
        label: "Runtime validation (focus stage only)",
        stage_key: row.stage_key,
        stage_label: params.stageLabel?.trim() ?? null,
        work_unit_id: row.work_unit_id,
        work_unit_key: row.work_unit_key,
        work_unit_name: row.work_unit_name,
        expected_status_keys: row.expected_status_keys,
        actual_queue_filter_keys: row.queue_status_keys,
        pass: row.pass,
        source:
            "validateLifecycleStageWorkUnitQueueFilter → expectedStatusKeysForLifecycleStageValidation (expected) + queueStatusKeysForLifecycleWorkUnitValidation (actual)",
        notes: [row.detail],
    };
}

export async function buildLifecycleQueueFilterEvaluationCompare(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    stageKey: string;
    stageLabel?: string | null;
    activation?: LifecycleActivationV1 | null;
    /** Card UI: status display labels shown under the queue card */
    statusDisplayLabels?: readonly string[];
    /** Client-side hints from LifecycleActivationBoard (optional) */
    client_hints?: {
        work_unit_identity_state?: string;
        work_unit_needs_sync?: boolean;
        pipeline_work_unit_id?: string | null;
    };
}): Promise<QueueFilterEvaluationCompare> {
    const focusStageKey = normalizeLifecycleStageKeyForIdentity(params.stageKey);
    const { data: dept } = await params.supabase
        .from("departments")
        .select("metadata")
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    const activation =
        params.activation ?? lifecycleActivationFromMetadata(dept?.metadata) ?? null;
    if (!activation) {
        throw new Error("No activation bundle on department metadata.");
    }

    const { payload, stageKeysForPayload } = await buildStatusPayloadForRuntime(
        params.supabase,
        params.orgId,
        params.departmentId,
        dept?.metadata
    );

    const cardSide = await evaluateWorkUnitQueueCardSide({
        supabase: params.supabase,
        orgId: params.orgId,
        departmentId: params.departmentId,
        stageKey: focusStageKey,
        stageLabel: params.stageLabel,
    });

    const runtimeStageSide = await evaluateRuntimeValidationStageSide({
        supabase: params.supabase,
        orgId: params.orgId,
        departmentId: params.departmentId,
        stageKey: focusStageKey,
        stageLabel: params.stageLabel,
        activation,
        statusPayload: payload,
    });

    const { rows: runtimeAllRows, stagesValidated } = await runtimeFilterRowsForDepartment(
        params.supabase,
        params.orgId,
        params.departmentId,
        activation,
        payload,
        stageKeysForPayload
    );
    const filterSummary = summarizeBuilderOwnedQueueFilterValidation(runtimeAllRows);

    const focusRow = runtimeAllRows.find((r) => r.stage_key === focusStageKey);
    const runtimeCompactSide: QueueFilterEvaluationSide = {
        id: "runtime_validation_compact",
        label: "Runtime validation (compact UI check)",
        stage_key: focusStageKey,
        stage_label: params.stageLabel?.trim() ?? null,
        work_unit_id: focusRow?.work_unit_id ?? null,
        work_unit_key: focusRow?.work_unit_key ?? cardSide.work_unit_key,
        work_unit_name: focusRow?.work_unit_name ?? null,
        expected_status_keys: focusRow?.expected_status_keys ?? [],
        actual_queue_filter_keys: focusRow?.queue_status_keys ?? [],
        pass: filterSummary.pass,
        source:
            "validateLifecycleActivationRuntime → summarizeBuilderOwnedQueueFilterValidation over ALL stages → buildLifecycleActivationCompactChecks maps work_unit_queue_filters to “Queue filters connected” (generic Fail copy if any stage missing filters)",
        notes: [
            `stages_validated=${JSON.stringify(stagesValidated)}`,
            `filter_summary.pass=${filterSummary.pass}`,
            `filter_summary.detail=${filterSummary.detail}`,
            ...runtimeAllRows
                .filter((r) => !r.pass)
                .map((r) => `FAIL stage=${r.stage_key}: ${r.detail}`),
        ],
    };

    const sides = [cardSide, runtimeStageSide, runtimeCompactSide];
    const divergence_reasons: string[] = [];

    if (cardSide.pass !== runtimeStageSide.pass) {
        divergence_reasons.push(
            "RESOLVER/SCOPE: Card pass !== runtime focus-stage pass (same stage, different expected-key functions or work unit row)."
        );
        if (!keysEqual(cardSide.expected_status_keys, runtimeStageSide.expected_status_keys)) {
            divergence_reasons.push(
                `EXPECTED KEYS DIFFER: card=[${cardSide.expected_status_keys.join(", ")}] runtime=[${runtimeStageSide.expected_status_keys.join(", ")}]`
            );
        }
        if (!keysEqual(cardSide.actual_queue_filter_keys, runtimeStageSide.actual_queue_filter_keys)) {
            divergence_reasons.push(
                `ACTUAL FILTER KEYS DIFFER: card=[${cardSide.actual_queue_filter_keys.join(", ")}] runtime=[${runtimeStageSide.actual_queue_filter_keys.join(", ")}]`
            );
        } else {
            const missing = missingFrom(cardSide.actual_queue_filter_keys, cardSide.expected_status_keys);
            const missingRt = missingFrom(
                runtimeStageSide.actual_queue_filter_keys,
                runtimeStageSide.expected_status_keys
            );
            if (missing.length !== missingRt.length) {
                divergence_reasons.push(
                    `Missing-from-queue differs: card missing=[${missing.join(", ")}] runtime missing=[${missingRt.join(", ")}]`
                );
            }
        }
        if (cardSide.work_unit_id !== runtimeStageSide.work_unit_id) {
            divergence_reasons.push(
                `WORK UNIT ID DIFFER: card=${cardSide.work_unit_id ?? "(none)"} runtime=${runtimeStageSide.work_unit_id ?? "(none)"} (activation.work_unit_id=${activation.work_unit_id ?? "(none)"})`
            );
        }
    }

    if (runtimeStageSide.pass !== runtimeCompactSide.pass) {
        divergence_reasons.push(
            "AGGREGATE SCOPE: Runtime focus stage passes but compact “Queue filters connected” fails — another stage in stages_validated failed, or summarize returned pass:false with no focus-stage failure."
        );
        const otherFails = runtimeAllRows.filter((r) => !r.pass && r.stage_key !== focusStageKey);
        for (const r of otherFails) {
            divergence_reasons.push(`OTHER STAGE FAIL: ${r.stage_key} — ${r.detail}`);
        }
        if (runtimeAllRows.filter((r) => !r.pass).length === 0 && !filterSummary.pass) {
            divergence_reasons.push(
                `Compact fail with no per-stage FAIL rows: ${filterSummary.detail}`
            );
        }
    }

    if (cardSide.pass !== runtimeCompactSide.pass) {
        divergence_reasons.push(
            "UI CONTRADICTION: Work Unit Queue card shows connected/Complete but compact Runtime Validation shows Fail."
        );
    }

    if (params.client_hints?.pipeline_work_unit_id && cardSide.work_unit_id) {
        if (params.client_hints.pipeline_work_unit_id !== cardSide.work_unit_id) {
            divergence_reasons.push(
                `CLIENT CACHE: board pipeline id=${params.client_hints.pipeline_work_unit_id} !== server identity id=${cardSide.work_unit_id} (stale loadPipeline/bootstrap).`
            );
        }
    }
    if (params.client_hints?.work_unit_needs_sync === false && cardSide.notes.some((n) => n.includes("needs_sync (GET)=true"))) {
        divergence_reasons.push("CLIENT CACHE: board needs_sync=false but fresh GET needs_sync=true.");
    }

    const queueCompleteDerived =
        Boolean(params.client_hints?.pipeline_work_unit_id) &&
        params.client_hints?.work_unit_identity_state === "synced" &&
        params.client_hints?.work_unit_needs_sync === false;

    const checksForCompact: LifecycleActivationCheckResult[] = [
        {
            id: "work_unit_queue_filters",
            label: "Work unit — queue filters",
            pass: filterSummary.pass,
            href: null,
            detail: filterSummary.detail,
        },
    ];
    const compactUi = buildLifecycleActivationCompactChecks(checksForCompact).find(
        (c) => c.id === "queue_filters"
    );

    return {
        department_id: params.departmentId,
        org_id: params.orgId,
        focus_stage_key: focusStageKey,
        focus_stage_label: params.stageLabel?.trim() ?? null,
        sides,
        diverges: divergence_reasons.length > 0,
        divergence_reasons,
        runtime_all_stage_rows: runtimeAllRows,
        runtime_stages_validated: stagesValidated,
        activation_bundle: {
            stage_key: activation.stage_key,
            work_unit_id: activation.work_unit_id,
            status_keys: activation.status_keys,
        },
        compact_check: {
            pass: compactUi?.pass === true,
            summary: compactUi?.summary ?? "",
            technical_detail: filterSummary.detail,
            source: "buildLifecycleActivationCompactChecks ← work_unit_queue_filters.check.pass",
        },
        card_ui_state_hints: {
            work_unit_identity_state_derived: params.client_hints?.work_unit_identity_state ?? "(unknown)",
            queue_complete_derived: queueCompleteDerived,
            status_display_labels: [...(params.statusDisplayLabels ?? [])],
        },
    };
}

export function formatQueueFilterEvaluationCompareReport(compare: QueueFilterEvaluationCompare): string {
    const lines: string[] = [
        "═══════════════════════════════════════════════════════════════",
        "  Queue filter evaluation — side-by-side proof (no repair)",
        "═══════════════════════════════════════════════════════════════",
        `department_id: ${compare.department_id}`,
        `org_id: ${compare.org_id}`,
        `focus_stage_key: ${compare.focus_stage_key}`,
        `focus_stage_label: ${compare.focus_stage_label ?? "(none)"}`,
        `activation.bundle.stage_key: ${compare.activation_bundle.stage_key}`,
        `activation.bundle.work_unit_id: ${compare.activation_bundle.work_unit_id ?? "(none)"}`,
        `activation.bundle.status_keys: [${compare.activation_bundle.status_keys.join(", ")}]`,
        `runtime validates stages: [${compare.runtime_stages_validated.join(", ")}]`,
        "",
    ];

    for (const side of compare.sides) {
        lines.push(`── ${side.label} (${side.id}) ──`);
        lines.push(`stage_key: ${side.stage_key}`);
        lines.push(`stage_label: ${side.stage_label ?? "(none)"}`);
        lines.push(`work_unit_id: ${side.work_unit_id ?? "(none)"}`);
        lines.push(`work_unit_key: ${side.work_unit_key ?? "(none)"}`);
        lines.push(`work_unit_name: ${side.work_unit_name ?? "(none)"}`);
        lines.push(`Expected status keys:`);
        lines.push(side.expected_status_keys.length ? `  [${side.expected_status_keys.join(", ")}]` : "  (none)");
        lines.push(`Actual queue filter keys:`);
        lines.push(side.actual_queue_filter_keys.length ? `  [${side.actual_queue_filter_keys.join(", ")}]` : "  (none)");
        lines.push(`Result: ${side.pass ? "PASS" : "FAIL"}`);
        lines.push(`Source: ${side.source}`);
        if (side.notes.length) {
            lines.push("Notes:");
            for (const n of side.notes) lines.push(`  - ${n}`);
        }
        lines.push("");
    }

    lines.push("── Compact UI (“Queue filters connected”) ──");
    lines.push(`Result: ${compare.compact_check.pass ? "PASS" : "FAIL"}`);
    lines.push(`Summary shown in UI: ${compare.compact_check.summary}`);
    lines.push(`Technical detail: ${compare.compact_check.technical_detail ?? "(none)"}`);
    lines.push(`Source: ${compare.compact_check.source}`);
    lines.push("");

    lines.push("── Card UI hints (client) ──");
    lines.push(`work_unit_identity_state: ${compare.card_ui_state_hints.work_unit_identity_state_derived}`);
    lines.push(`queue_complete (guided): ${compare.card_ui_state_hints.queue_complete_derived}`);
    lines.push(
        `status display labels: [${compare.card_ui_state_hints.status_display_labels.join(", ")}]`
    );
    lines.push("");

    if (compare.diverges) {
        lines.push("── DIVERGENCE ──");
        for (const r of compare.divergence_reasons) lines.push(`• ${r}`);
    } else {
        lines.push("── All evaluators agree for focus stage and compact check ──");
    }

    lines.push("");
    lines.push("── All runtime per-stage rows ──");
    for (const r of compare.runtime_all_stage_rows) {
        lines.push(
            `  ${r.pass ? "PASS" : "FAIL"} ${r.stage_key} wu=${r.work_unit_key} expected=[${r.expected_status_keys.join(", ")}] actual=[${r.queue_status_keys.join(", ")}]`
        );
    }

    return lines.join("\n");
}
