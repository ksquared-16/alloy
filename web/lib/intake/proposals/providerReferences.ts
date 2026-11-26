import type { ProviderConsumerLifecycleStatus, ProviderConsumerReference } from "@/lib/fields/providerConsumerReference";
import type { RelatedRecordProposalBundle } from "@/lib/intake/proposals/types";

export function providerReferencesFromRelatedRecordProposalBundle(args: {
    bundle: RelatedRecordProposalBundle;
    artifactId: string;
    artifactVersionId?: string;
    consumerKind?: string;
    lifecycleStatus: ProviderConsumerLifecycleStatus;
}): ProviderConsumerReference[] {
    const refs: ProviderConsumerReference[] = [];
    for (const collection of args.bundle.collections) {
        refs.push({
            provider_ref: collection.collection_provider_ref,
            consumer_kind: args.consumerKind ?? "related_record_proposal",
            artifact_id: args.artifactId,
            ...(args.artifactVersionId ? { artifact_version_id: args.artifactVersionId } : {}),
            reference_path: `collections.${collection.collection_key}`,
            lifecycle_status: args.lifecycleStatus,
        });
        for (const inst of collection.instances) {
            for (const field of inst.field_proposals) {
                refs.push({
                    provider_ref: field.provider_ref,
                    consumer_kind: args.consumerKind ?? "related_record_proposal",
                    artifact_id: args.artifactId,
                    ...(args.artifactVersionId ? { artifact_version_id: args.artifactVersionId } : {}),
                    reference_path: `proposals.${inst.proposal_id}.fields.${field.source_fact_ref ?? field.provider_ref}`,
                    lifecycle_status: args.lifecycleStatus,
                });
            }
        }
    }
    return refs;
}
