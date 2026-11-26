import type {
    ProposalDiagnostic,
    RelatedRecordInstanceProposal,
    RelatedRecordProposalStatus,
} from "@/lib/intake/proposals/types";

export function worstRelatedRecordProposalStatus(
    statuses: RelatedRecordProposalStatus[],
): RelatedRecordProposalStatus {
    if (statuses.some((s) => s === "invalid")) return "invalid";
    if (statuses.some((s) => s === "unsupported")) return "unsupported";
    if (statuses.some((s) => s === "incomplete")) return "incomplete";
    return "valid";
}

export function stableRelatedRecordProposalId(args: {
    source_kind: string;
    source_record_id: string;
    collection_provider_ref: string;
    instance_key: string;
}): string {
    const parts = [args.source_kind, args.source_record_id, args.collection_provider_ref, args.instance_key];
    return `rrp:${parts.map((p) => encodeURIComponent(p)).join(":")}`;
}

export function stringifyProposalValue(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v.length > 0 ? v : null;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) {
        const joined = v.map((x) => String(x)).join(", ");
        return joined.length > 0 ? joined : null;
    }
    return null;
}

export function mergeProposalDiagnostics(...groups: ProposalDiagnostic[][]): ProposalDiagnostic[] {
    return groups.flat();
}

export function distinctEntityTypesFromInstances(instances: RelatedRecordInstanceProposal[]): string[] {
    const out = new Set<string>();
    for (const inst of instances) {
        if (inst.item_entity_type) out.add(inst.item_entity_type);
        for (const fp of inst.field_proposals) {
            const [entityType] = fp.provider_ref.split(".", 2);
            if (entityType?.trim()) out.add(entityType.trim());
        }
    }
    return [...out];
}
