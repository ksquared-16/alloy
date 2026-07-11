export type RelatedRecordFieldDecisionKind = "approve" | "reject" | "defer";
export type RelatedRecordInstanceDecisionKind = "approve" | "reject" | "defer";

export type RelatedRecordFieldDecision = {
    provider_ref: string;
    decision: RelatedRecordFieldDecisionKind;
};

export type RelatedRecordProposalDecision = {
    proposal_id: string;
    instance_decision?: RelatedRecordInstanceDecisionKind;
    field_decisions: RelatedRecordFieldDecision[];
};

export function decisionForProvider(
    decision: RelatedRecordProposalDecision,
    providerRef: string,
): RelatedRecordFieldDecisionKind {
    const explicit = decision.field_decisions.find((d) => d.provider_ref === providerRef)?.decision;
    if (explicit) return explicit;
    if (decision.instance_decision === "approve") return "approve";
    if (decision.instance_decision === "reject") return "reject";
    if (decision.instance_decision === "defer") return "defer";
    return "defer";
}

export function normalizeProposalDecision(decision: RelatedRecordProposalDecision): RelatedRecordProposalDecision {
    const byProvider = new Map<string, RelatedRecordFieldDecision>();
    for (const field of decision.field_decisions) {
        const ref = field.provider_ref.trim();
        if (!ref) continue;
        byProvider.set(ref, { provider_ref: ref, decision: field.decision });
    }
    return {
        proposal_id: decision.proposal_id,
        ...(decision.instance_decision ? { instance_decision: decision.instance_decision } : {}),
        field_decisions: [...byProvider.values()].sort((a, b) => a.provider_ref.localeCompare(b.provider_ref)),
    };
}
