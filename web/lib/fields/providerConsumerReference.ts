/**
 * Shared provider consumer reference contract and in-memory query helpers.
 *
 * This is an index foundation: consumers emit canonical references; delete safety
 * and lifecycle blocking can query this shape without knowing consumer schemas.
 */

export type ProviderConsumerLifecycleStatus = "draft" | "published" | "active" | "archived";

export type ProviderConsumerReference = {
    provider_ref: string;
    consumer_kind: string;
    artifact_id: string;
    artifact_version_id?: string;
    reference_path: string;
    lifecycle_status: ProviderConsumerLifecycleStatus;
};

export function providerConsumerReferenceKey(ref: ProviderConsumerReference): string {
    return [
        ref.consumer_kind,
        ref.artifact_id,
        ref.artifact_version_id ?? "",
        ref.reference_path,
        ref.provider_ref,
    ].join("::");
}

export function normalizeProviderConsumerReferences(
    refs: readonly ProviderConsumerReference[],
): ProviderConsumerReference[] {
    const byKey = new Map<string, ProviderConsumerReference>();
    for (const ref of refs) {
        const provider = ref.provider_ref.trim();
        if (!provider) continue;
        byKey.set(providerConsumerReferenceKey({ ...ref, provider_ref: provider }), { ...ref, provider_ref: provider });
    }
    return [...byKey.values()].sort((a, b) => providerConsumerReferenceKey(a).localeCompare(providerConsumerReferenceKey(b)));
}

export function queryProviderConsumerReferences(
    refs: readonly ProviderConsumerReference[],
    input: { provider_ref?: string; consumer_kind?: string; lifecycle_status?: ProviderConsumerLifecycleStatus },
): ProviderConsumerReference[] {
    return normalizeProviderConsumerReferences(refs).filter((ref) => {
        if (input.provider_ref && ref.provider_ref !== input.provider_ref.trim()) return false;
        if (input.consumer_kind && ref.consumer_kind !== input.consumer_kind) return false;
        if (input.lifecycle_status && ref.lifecycle_status !== input.lifecycle_status) return false;
        return true;
    });
}
