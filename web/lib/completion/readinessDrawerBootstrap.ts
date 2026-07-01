/**
 * Optional drawer bootstrap readiness (display-only, non-blocking).
 * @see docs/system/adminv2-runtime-performance-doctrine.md
 */

import { evaluateOperationalReadinessMemoized, type ReadinessMemoScope } from "@/lib/completion/readinessEvaluationMemo";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import { canonicalOperatorStageForStatusKey } from "@/lib/lifecycle/enrollmentOperatorStage";

export function tryEvaluateDrawerRecordReadiness(input: {
    orgId: string;
    opportunityId: string;
    entity: Record<string, unknown>;
    departmentId?: string | null;
    workUnitId?: string | null;
    departmentMetadata?: Record<string, unknown> | null;
    memoScope?: ReadinessMemoScope;
}): ReadinessResult | undefined {
    try {
        const opportunityId = input.opportunityId.trim();
        const orgId = input.orgId.trim();
        if (!opportunityId || !orgId) return undefined;

        const statusKey =
            input.entity.status_key != null ? String(input.entity.status_key) : null;
        const operatorStage = statusKey ? canonicalOperatorStageForStatusKey(statusKey) : null;

        const record: Record<string, unknown> = { ...input.entity };
        if (input.departmentMetadata) {
            record._department_metadata = input.departmentMetadata;
        }

        return evaluateOperationalReadinessMemoized(
            {
                org_id: orgId,
                trigger: "record_view",
                subject: { entity_type: "opportunity", entity_id: opportunityId },
                context: {
                    department_id: input.departmentId ?? undefined,
                    operator_stage: operatorStage ?? undefined,
                },
                department_id: input.departmentId ?? null,
                work_unit_id: input.workUnitId ?? null,
                status: statusKey,
                record,
                include_legacy: true,
            },
            input.memoScope
        );
    } catch {
        return undefined;
    }
}
