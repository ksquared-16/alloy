/**
 * Evaluate readiness for attention attach / queue bridge (Phase 1).
 * Single evaluation entry — delegates to Readiness Engine only.
 */

import { evaluateOperationalReadinessMemoized, type ReadinessMemoScope } from "@/lib/completion/readinessEvaluationMemo";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import { canonicalOperatorStageForStatusKey } from "@/lib/lifecycle/enrollmentOperatorStage";
import type { OpportunityAttentionEntityInput } from "@/lib/opportunities/opportunityAttentionResolver";

export function tryEvaluateOpportunityReadinessForAttention(input: {
    orgId: string;
    opportunity: OpportunityAttentionEntityInput;
    departmentId?: string | null;
    workUnitId?: string | null;
    departmentMetadata?: Record<string, unknown> | null;
    memoScope?: ReadinessMemoScope;
}): ReadinessResult | undefined {
    try {
        const orgId = input.orgId.trim();
        const opportunityId = input.opportunity.id.trim();
        if (!orgId || !opportunityId) return undefined;

        const statusKey = input.opportunity.status_key?.trim() || null;
        const operatorStage = statusKey ? canonicalOperatorStageForStatusKey(statusKey) : null;

        const record: Record<string, unknown> = {
            id: opportunityId,
            status_key: input.opportunity.status_key,
            created_at: input.opportunity.created_at,
            updated_at: input.opportunity.updated_at,
            metadata: input.opportunity.metadata ?? {},
            customer_id: input.opportunity.customer_id ?? null,
            primary_person_id: input.opportunity.primary_person_id ?? null,
            primary_contact_id: input.opportunity.primary_contact_id ?? null,
            quote_total: input.opportunity.quote_total ?? null,
            estimated_price_cents: input.opportunity.estimated_price_cents ?? null,
            monetary_value_cents: input.opportunity.monetary_value_cents ?? null,
        };
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
