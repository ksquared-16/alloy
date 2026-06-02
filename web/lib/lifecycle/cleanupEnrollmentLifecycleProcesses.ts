/**
 * One-time cleanup: remove stray processes from shared Enrollment department metadata.
 * Does not delete the department row, work units, or CRM records.
 */

import {
    activeStagesForProcess,
    emptyLifecycleBuilderV1,
    type LifecycleBuilderProcessRecord,
    type LifecycleBuilderV1,
    mergeLifecycleBuilderIntoMetadata,
    removeProcessFromConfig,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

export const ENROLLMENT_DEPARTMENT_KEY = "enrollment" as const;

export type EnrollmentProcessSummary = {
    id: string;
    key: string;
    name: string;
    stage_count: number;
    is_active: boolean;
};

export type EnrollmentLifecycleBuilderMetadataSummary = {
    active_process_id: string | null;
    process_count: number;
    active_process_count: number;
    processes: EnrollmentProcessSummary[];
};

export type EnrollmentLifecycleProcessCleanupPlan = {
    mode: "dedupe";
    department_id: string;
    active_process_id_before: string | null;
    active_process_id_after: string | null;
    before: EnrollmentProcessSummary[];
    remove: EnrollmentProcessSummary[];
    keep: EnrollmentProcessSummary;
    after: EnrollmentProcessSummary[];
    next_config: LifecycleBuilderV1;
};

export type EnrollmentLifecycleClearAllPlan = {
    mode: "clear_all";
    department_id: string;
    before: EnrollmentLifecycleBuilderMetadataSummary;
    after: EnrollmentLifecycleBuilderMetadataSummary;
    next_config: LifecycleBuilderV1;
};

export type EnrollmentLifecycleCleanupPlan = EnrollmentLifecycleProcessCleanupPlan | EnrollmentLifecycleClearAllPlan;

function normalizeProcessName(name: string): string {
    return name.trim().toLowerCase();
}

/** Stray display names created during builder experiments. */
export function isStrayEnrollmentProcessName(name: string): boolean {
    const n = normalizeProcessName(name);
    if (/^enrollment\(s\)$/.test(n)) return true;
    if (n === "lead management") return true;
    return false;
}

export function summarizeEnrollmentLifecycleBuilder(
    config: LifecycleBuilderV1
): EnrollmentLifecycleBuilderMetadataSummary {
    const processes = config.processes.map(summarizeProcess);
    return {
        active_process_id: config.active_process_id,
        process_count: processes.length,
        active_process_count: processes.filter((p) => p.is_active).length,
        processes,
    };
}

function summarizeProcess(p: LifecycleBuilderProcessRecord): EnrollmentProcessSummary {
    return {
        id: p.id,
        key: p.key,
        name: p.name,
        stage_count: activeStagesForProcess(p).length,
        is_active: p.is_active,
    };
}

function isEnrollmentNamedProcess(p: LifecycleBuilderProcessRecord): boolean {
    return p.key === ENROLLMENT_PROCESS_KEY || normalizeProcessName(p.name) === "enrollment";
}

/** Pick the canonical Enrollment process to keep. */
export function pickCanonicalEnrollmentProcess(
    processes: LifecycleBuilderProcessRecord[],
    activeProcessId: string | null
): LifecycleBuilderProcessRecord | null {
    const candidates = processes.filter((p) => p.is_active && !isStrayEnrollmentProcessName(p.name));
    if (!candidates.length) {
        const fallback = processes.filter((p) => p.is_active && isEnrollmentNamedProcess(p));
        if (!fallback.length) return processes.find((p) => p.is_active) ?? processes[0] ?? null;
        return scoreEnrollmentCandidate(fallback, activeProcessId);
    }

    const enrollmentNamed = candidates.filter(isEnrollmentNamedProcess);
    const pool = enrollmentNamed.length ? enrollmentNamed : candidates;
    return scoreEnrollmentCandidate(pool, activeProcessId);
}

function scoreEnrollmentCandidate(
    pool: LifecycleBuilderProcessRecord[],
    activeProcessId: string | null
): LifecycleBuilderProcessRecord {
    if (activeProcessId) {
        const active = pool.find((p) => p.id === activeProcessId);
        if (active) return active;
    }
    const byKey = pool.find((p) => p.key === ENROLLMENT_PROCESS_KEY);
    if (byKey) return byKey;
    return [...pool].sort(
        (a, b) => activeStagesForProcess(b).length - activeStagesForProcess(a).length || a.name.localeCompare(b.name)
    )[0]!;
}

export function planEnrollmentLifecycleProcessCleanup(
    departmentId: string,
    config: LifecycleBuilderV1
): EnrollmentLifecycleProcessCleanupPlan | null {
    const active = config.processes.filter((p) => p.is_active);
    if (!active.length) return null;

    const keep = pickCanonicalEnrollmentProcess(active, config.active_process_id);
    if (!keep) return null;

    const remove = active.filter((p) => {
        if (p.id === keep.id) return false;
        if (isStrayEnrollmentProcessName(p.name)) return true;
        if (isEnrollmentNamedProcess(p)) return true;
        return true;
    });

    if (!remove.length) return null;

    let next = config;
    for (const p of remove) {
        next = removeProcessFromConfig(next, p.id);
    }
    next = {
        ...next,
        active_process_id: keep.id,
    };

    const afterActive = next.processes.filter((p) => p.is_active);

    return {
        mode: "dedupe",
        department_id: departmentId,
        active_process_id_before: config.active_process_id,
        active_process_id_after: next.active_process_id,
        before: active.map(summarizeProcess),
        remove: remove.map(summarizeProcess),
        keep: summarizeProcess(keep),
        after: afterActive.map(summarizeProcess),
        next_config: next,
    };
}

/** Remove all lifecycle_builder_v1 processes from Enrollment department metadata. */
export function planClearAllEnrollmentLifecycleProcesses(
    departmentId: string,
    config: LifecycleBuilderV1
): EnrollmentLifecycleClearAllPlan | null {
    const before = summarizeEnrollmentLifecycleBuilder(config);
    if (before.process_count === 0 && before.active_process_id == null) {
        return null;
    }

    const next_config = emptyLifecycleBuilderV1();
    return {
        mode: "clear_all",
        department_id: departmentId,
        before,
        after: summarizeEnrollmentLifecycleBuilder(next_config),
        next_config,
    };
}

export function mergeEnrollmentCleanupIntoDepartmentMetadata(
    metadata: Record<string, unknown>,
    plan: EnrollmentLifecycleCleanupPlan
): Record<string, unknown> {
    return mergeLifecycleBuilderIntoMetadata(metadata, plan.next_config);
}

/** Catalog / UI: shared platform enrollment department cannot be deleted from builder. */
export function isProtectedSharedLifecycleDepartment(
    departmentKey: string,
    activationOwnedDepartment: boolean
): boolean {
    return departmentKey.trim().toLowerCase() === ENROLLMENT_DEPARTMENT_KEY && !activationOwnedDepartment;
}
