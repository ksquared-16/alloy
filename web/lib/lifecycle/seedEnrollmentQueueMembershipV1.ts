/**
 * Phase B — seed queue_membership_v1 onto enrollment lifecycle builder stages
 * and denormalize to per-stage work unit metadata. Metadata only — no queue_definition changes.
 */

import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    lifecycleStageWorkUnitKey,
    type LifecycleStageWorkUnitRow,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    defaultQueueMembershipForEnrollmentStage,
    parseQueueMembershipV1,
    type QueueMembershipV1,
} from "@/lib/lifecycle/queueMembershipV1";

export const QUEUE_MEMBERSHIP_METADATA_KEY = "queue_membership_v1" as const;

export type QueueMembershipSeedStageActionKind =
    | "seeded"
    | "skipped_has_explicit"
    | "skipped_invalid_explicit"
    | "skipped_unknown_stage"
    | "skipped_no_default";

export type QueueMembershipSeedStageAction = {
    stage_key: string;
    action: QueueMembershipSeedStageActionKind;
    membership_before: QueueMembershipV1 | null;
    membership_after: QueueMembershipV1 | null;
};

export type QueueMembershipSeedWorkUnitActionKind =
    | "seeded"
    | "skipped_has_explicit"
    | "skipped_invalid_explicit"
    | "skipped_no_work_unit"
    | "skipped_no_membership";

export type QueueMembershipSeedWorkUnitAction = {
    stage_key: string;
    work_unit_id: string | null;
    work_unit_key: string;
    action: QueueMembershipSeedWorkUnitActionKind;
    membership_before: QueueMembershipV1 | null;
    membership_after: QueueMembershipV1 | null;
};

export type EnrollmentQueueMembershipSeedPlan = {
    department_id: string;
    org_id?: string;
    process_id: string | null;
    process_key: string | null;
    stage_actions: QueueMembershipSeedStageAction[];
    work_unit_actions: QueueMembershipSeedWorkUnitAction[];
    builder_metadata_changed: boolean;
    work_unit_ids_to_update: string[];
};

export type EnrollmentQueueMembershipSeedWorkUnitInput = Pick<
    LifecycleStageWorkUnitRow,
    "id" | "key" | "metadata" | "queue_definition" | "department_id"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function readMembershipFromContainer(container: unknown): {
    raw: unknown;
    parsed: QueueMembershipV1 | null;
} {
    if (!isRecord(container)) {
        return { raw: undefined, parsed: null };
    }
    const raw = container[QUEUE_MEMBERSHIP_METADATA_KEY];
    if (raw === undefined) {
        return { raw: undefined, parsed: null };
    }
    return { raw, parsed: parseQueueMembershipV1(raw) };
}

function membershipSeedDecision(
    stageKey: string,
    container: unknown,
): {
    action: QueueMembershipSeedStageActionKind;
    membership: QueueMembershipV1 | null;
    membership_before: QueueMembershipV1 | null;
} {
    const { raw, parsed } = readMembershipFromContainer(container);

    if (parsed) {
        return {
            action: "skipped_has_explicit",
            membership: null,
            membership_before: parsed,
        };
    }

    if (raw !== undefined) {
        return {
            action: "skipped_invalid_explicit",
            membership: null,
            membership_before: null,
        };
    }

    const defaultMembership = defaultQueueMembershipForEnrollmentStage(stageKey);
    if (!defaultMembership) {
        const action: QueueMembershipSeedStageActionKind =
            stageKey === "enrolling" ? "skipped_unknown_stage" : "skipped_no_default";
        return { action, membership: null, membership_before: null };
    }

    return {
        action: "seeded",
        membership: defaultMembership,
        membership_before: null,
    };
}

function cloneMembership(membership: QueueMembershipV1): QueueMembershipV1 {
    return structuredClone(membership);
}

function setMembershipOnRecord(
    record: Record<string, unknown>,
    membership: QueueMembershipV1,
): void {
    record[QUEUE_MEMBERSHIP_METADATA_KEY] = cloneMembership(membership);
}

/** Plan metadata-only seed for one department's enrollment lifecycle builder + work units. */
export function planEnrollmentQueueMembershipSeed(params: {
    departmentId: string;
    orgId?: string;
    departmentMetadata: unknown;
    workUnits: readonly EnrollmentQueueMembershipSeedWorkUnitInput[];
}): EnrollmentQueueMembershipSeedPlan | null {
    const departmentId = params.departmentId.trim();
    if (!departmentId) return null;

    if (!isRecord(params.departmentMetadata)) {
        return null;
    }

    const builderRaw = params.departmentMetadata[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || builderRaw.version !== 1 || !Array.isArray(builderRaw.processes)) {
        return null;
    }

    const enrollmentProcess = builderRaw.processes.find(
        (p) =>
            isRecord(p) &&
            typeof p.key === "string" &&
            p.key.trim() === ENROLLMENT_PROCESS_KEY &&
            p.is_active !== false,
    );
    if (!enrollmentProcess || !isRecord(enrollmentProcess)) {
        return null;
    }

    const processId = typeof enrollmentProcess.id === "string" ? enrollmentProcess.id.trim() : "";
    const stagesRaw = Array.isArray(enrollmentProcess.stages) ? enrollmentProcess.stages : [];

    const stageMembershipByKey = new Map<string, QueueMembershipV1>();
    const stage_actions: QueueMembershipSeedStageAction[] = [];

    for (const stageRaw of stagesRaw) {
        if (!isRecord(stageRaw)) continue;
        const stageKey = typeof stageRaw.key === "string" ? stageRaw.key.trim() : "";
        if (!stageKey) continue;

        const decision = membershipSeedDecision(stageKey, stageRaw);
        const membership_after =
            decision.action === "seeded" ? decision.membership : decision.membership_before;

        stage_actions.push({
            stage_key: stageKey,
            action: decision.action,
            membership_before: decision.membership_before,
            membership_after,
        });

        if (decision.action === "seeded" && decision.membership) {
            stageMembershipByKey.set(stageKey, decision.membership);
        } else if (decision.membership_before) {
            stageMembershipByKey.set(stageKey, decision.membership_before);
        }
    }

    const workUnitsForDept = params.workUnits.filter(
        (wu) => String(wu.department_id ?? "").trim() === departmentId,
    );

    const work_unit_actions: QueueMembershipSeedWorkUnitAction[] = [];
    const work_unit_ids_to_update: string[] = [];

    for (const stageAction of stage_actions) {
        const stageKey = stageAction.stage_key;
        const workUnitKey = lifecycleStageWorkUnitKey(stageKey);
        const workUnit = workUnitsForDept.find((wu) => String(wu.key ?? "").trim() === workUnitKey);

        if (!workUnit) {
            work_unit_actions.push({
                stage_key: stageKey,
                work_unit_id: null,
                work_unit_key: workUnitKey,
                action: "skipped_no_work_unit",
                membership_before: null,
                membership_after: null,
            });
            continue;
        }

        const wuDecision = membershipSeedDecision(stageKey, workUnit.metadata);

        if (
            wuDecision.action === "skipped_has_explicit" ||
            wuDecision.action === "skipped_invalid_explicit"
        ) {
            work_unit_actions.push({
                stage_key: stageKey,
                work_unit_id: workUnit.id,
                work_unit_key: workUnitKey,
                action: wuDecision.action,
                membership_before: wuDecision.membership_before,
                membership_after: wuDecision.membership_before,
            });
            continue;
        }

        const membershipToApply =
            stageMembershipByKey.get(stageKey) ??
            (wuDecision.action === "seeded" ? wuDecision.membership : null);

        if (!membershipToApply) {
            work_unit_actions.push({
                stage_key: stageKey,
                work_unit_id: workUnit.id,
                work_unit_key: workUnitKey,
                action: "skipped_no_membership",
                membership_before: wuDecision.membership_before,
                membership_after: null,
            });
            continue;
        }

        work_unit_actions.push({
            stage_key: stageKey,
            work_unit_id: workUnit.id,
            work_unit_key: workUnitKey,
            action: "seeded",
            membership_before: wuDecision.membership_before,
            membership_after: membershipToApply,
        });
        work_unit_ids_to_update.push(workUnit.id);
    }

    const builder_metadata_changed = stage_actions.some((a) => a.action === "seeded");

    return {
        department_id: departmentId,
        ...(params.orgId ? { org_id: params.orgId } : {}),
        process_id: processId || null,
        process_key: ENROLLMENT_PROCESS_KEY,
        stage_actions,
        work_unit_actions,
        builder_metadata_changed,
        work_unit_ids_to_update,
    };
}

/** Apply a seed plan to department metadata (builder stages) — does not touch queue_definition. */
export function applyEnrollmentQueueMembershipSeedToDepartmentMetadata(
    departmentMetadata: unknown,
    plan: EnrollmentQueueMembershipSeedPlan,
): Record<string, unknown> {
    if (!isRecord(departmentMetadata)) {
        throw new Error("department metadata must be an object");
    }

    const metadata = structuredClone(departmentMetadata) as Record<string, unknown>;
    const builderRaw = metadata[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) {
        return metadata;
    }

    const processIndex = builderRaw.processes.findIndex(
        (p) => isRecord(p) && String(p.id ?? "").trim() === plan.process_id,
    );
    if (processIndex < 0) return metadata;

    const process = builderRaw.processes[processIndex];
    if (!isRecord(process) || !Array.isArray(process.stages)) return metadata;

    for (const stageAction of plan.stage_actions) {
        if (stageAction.action !== "seeded" || !stageAction.membership_after) continue;

        const stageIndex = process.stages.findIndex(
            (s) => isRecord(s) && String(s.key ?? "").trim() === stageAction.stage_key,
        );
        if (stageIndex < 0) continue;

        const stage = process.stages[stageIndex];
        if (!isRecord(stage)) continue;
        setMembershipOnRecord(stage, stageAction.membership_after);
        process.stages[stageIndex] = stage;
    }

    builderRaw.processes[processIndex] = process;
    metadata[LIFECYCLE_BUILDER_METADATA_KEY] = builderRaw;
    return metadata;
}

/** Apply work unit metadata updates from plan — metadata only, queue_definition unchanged. */
export function applyEnrollmentQueueMembershipSeedToWorkUnitMetadata(
    workUnitMetadata: unknown,
    membership: QueueMembershipV1,
): Record<string, unknown> {
    const base = isRecord(workUnitMetadata) ? structuredClone(workUnitMetadata) : {};
    setMembershipOnRecord(base, membership);
    return base;
}

export function summarizeEnrollmentQueueMembershipSeedPlan(
    plan: EnrollmentQueueMembershipSeedPlan,
): string {
    const lines: string[] = [
        `department_id=${plan.department_id}`,
        `process_key=${plan.process_key ?? "—"} process_id=${plan.process_id ?? "—"}`,
        `builder_metadata_changed=${plan.builder_metadata_changed}`,
        `work_units_to_update=${plan.work_unit_ids_to_update.length}`,
        "",
        "stages:",
    ];

    for (const row of plan.stage_actions) {
        lines.push(
            `  stage=${row.stage_key} action=${row.action} before=${row.membership_before?.subject_type ?? "—"} after=${row.membership_after?.subject_type ?? "—"}`,
        );
    }

    lines.push("", "work_units:");
    for (const row of plan.work_unit_actions) {
        lines.push(
            `  stage=${row.stage_key} wu_id=${row.work_unit_id ?? "—"} key=${row.work_unit_key} action=${row.action}`,
        );
    }

    return lines.join("\n");
}

/** Test helper — detect whether builder config stages carry parsed membership after round-trip. */
export function enrollmentStagesWithMembershipFromBuilder(
    config: LifecycleBuilderV1,
): Map<string, QueueMembershipV1 | undefined> {
    const process = config.processes.find((p) => p.key === ENROLLMENT_PROCESS_KEY && p.is_active);
    const out = new Map<string, QueueMembershipV1 | undefined>();
    if (!process) return out;
    for (const stage of process.stages) {
        const membership = (stage as { queue_membership_v1?: QueueMembershipV1 }).queue_membership_v1;
        out.set(stage.key, membership);
    }
    return out;
}
