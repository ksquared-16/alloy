/**
 * Optional in-request memoization for readiness evaluation (Phase 1).
 * Callers create a scope per request; no durable cache.
 */

import { evaluateOperationalReadiness } from "@/lib/completion/evaluateOperationalReadiness";
import type { ReadinessEvalInput, ReadinessResult } from "@/lib/completion/readinessTypes";

export type ReadinessMemoScope = Map<string, ReadinessResult>;

export function createReadinessMemoScope(): ReadinessMemoScope {
    return new Map();
}

export function readinessEvaluationMemoKey(input: ReadinessEvalInput, fingerprint?: string): string {
    return JSON.stringify({
        subject: input.subject,
        trigger: input.trigger,
        action_key: input.action_key ?? null,
        status: input.status ?? null,
        status_from: input.status_from ?? null,
        status_to: input.status_to ?? null,
        department_id: input.department_id ?? null,
        work_unit_id: input.work_unit_id ?? null,
        operator_stage: input.context?.operator_stage ?? null,
        form_id: input.context?.form_id ?? null,
        fingerprint: fingerprint ?? null,
    });
}

export function evaluateOperationalReadinessMemoized(
    input: ReadinessEvalInput,
    scope?: ReadinessMemoScope,
    fingerprint?: string
): ReadinessResult {
    if (!scope) {
        return evaluateOperationalReadiness(input);
    }
    const key = readinessEvaluationMemoKey(input, fingerprint);
    const cached = scope.get(key);
    if (cached) return cached;
    const result = evaluateOperationalReadiness(input);
    scope.set(key, result);
    return result;
}
