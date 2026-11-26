import { redactObjectForAi } from "@/lib/privacy/redactObject";

function redactAuditScalar(providerRef: string, value: unknown): unknown {
    if (value === null || value === undefined) return value;
    const key = providerRef.toLowerCase();
    if (/(dob|date_of_birth|birth)/.test(key)) return "[dob:redacted]";
    if (/(first_name|last_name|child_name|name)/.test(key)) return "[name:redacted]";
    return value;
}
import type { RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import type { ExistingChildCommitResult } from "@/lib/pos/processingCase/commit/children/types";

export type ExistingChildCommitAuditInput = {
    org_id: string;
    processing_case_id: string;
    proposal_id: string;
    decision: RelatedRecordProposalDecision;
    decision_version: string;
    idempotency_key: string;
    operator_id: string;
    occurred_at: string;
    source: { source_kind: string; source_id: string };
    result: ExistingChildCommitResult;
};

export function buildExistingChildCommitAuditPayload(input: ExistingChildCommitAuditInput): Record<string, unknown> {
    const field_results = input.result.field_results.map((field) => ({
        provider_ref: field.provider_ref,
        canonical_field_key: field.canonical_ref.field_key,
        old_value: redactAuditScalar(field.provider_ref, field.old_value),
        proposed_value: redactAuditScalar(field.provider_ref, field.proposed_value),
        decision: input.decision.field_decisions.find((d) => d.provider_ref === field.provider_ref)?.decision ?? null,
        outcome: field.outcome,
        message: field.message ?? null,
        conflict_reason: field.outcome === "stale_conflict" ? field.message ?? "stale_conflict" : null,
    }));
    const skipped = input.result.skipped_changes.map((s) => ({
        provider_ref: s.provider_ref,
        outcome: s.outcome,
        reason: s.reason,
    }));
    const payload = {
        organization_id: input.org_id,
        processing_case_id: input.processing_case_id,
        proposal_id: input.proposal_id,
        source_kind: input.source.source_kind,
        source_record_id: input.source.source_id,
        collection_provider_ref: "children",
        target_entity_type: "customer_member",
        target_child_id: input.result.record_id,
        operator_id: input.operator_id,
        decision_version: input.decision_version,
        idempotency_key: input.idempotency_key,
        occurred_at: input.occurred_at,
        commit_status: input.result.status,
        field_results,
        skipped_changes: skipped,
    };
    return redactObjectForAi(payload, { pii_mode: "strict" }).redacted;
}
