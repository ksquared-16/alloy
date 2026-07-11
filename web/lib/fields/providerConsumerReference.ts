/**
 * Shared provider consumer reference contract — index input for future governance.
 *
 * Consumers emit this shape; a shared reference index is deferred to a later pass.
 */

export type ProviderConsumerReferenceStatus = "active" | "deprecated" | "invalid";

export type ProviderConsumerReference = {
    provider_ref: string;
    consumer_kind: string;
    artifact_id: string;
    artifact_version_id?: string;
    reference_path: string;
    status: ProviderConsumerReferenceStatus;
};

export function providerConsumerReferenceKey(ref: ProviderConsumerReference): string {
    return `${ref.consumer_kind}::${ref.artifact_id}::${ref.reference_path}::${ref.provider_ref}`;
}
