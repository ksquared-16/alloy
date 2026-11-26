/**
 * Queue row provider eligibility — distinguishable capability gates for picker,
 * publish, and runtime resolution. Not a single boolean allow-list.
 */

import type {
    CanonicalDataProvider,
    QueueRowProviderEligibility,
    QueueRowProviderExclusionReason,
} from "@/lib/fields/canonicalDataProviderModel";
import {
    consumerSupportsProviderAtPublish,
    consumerSupportsProviderInPicker,
} from "@/lib/fields/consumerProviderCapabilities";
import { computedFieldByRefKey } from "@/lib/fields/computedFieldCatalog";
import { findCanonicalDataProvider } from "@/lib/fields/canonicalDataProviderRegistry";
import {
    isLegacyQueueRowCompatibilityRefKey,
    legacyQueueRowCompatibilityEntry,
} from "@/lib/fields/queueRowLegacyCompatibility";
import { manifestEntryForRefKey } from "@/lib/layout/platformFieldResolutionManifest";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

function pushReason(reasons: QueueRowProviderExclusionReason[], reason: QueueRowProviderExclusionReason) {
    if (!reasons.includes(reason)) reasons.push(reason);
}

function providerAvailableForContext(provider: CanonicalDataProvider, isWaitlist: boolean): boolean {
    return isWaitlist ? provider.availability.waitlist : provider.availability.pipeline;
}

function providerHasResolverMetadata(provider: CanonicalDataProvider): boolean {
    if (provider.resolverOwner?.trim()) return true;
    const computed = computedFieldByRefKey(provider.refKey);
    if (computed?.resolver_status === "now") return true;
    const manifest = manifestEntryForRefKey(provider.refKey);
    if (manifest?.runtimePhase === "now") return true;
    if (provider.kind === "relationship" || provider.kind === "collection") return true;
    if (provider.source?.source === "field_definitions") return true;
    return false;
}

function evaluateCanonicalProvider(
    provider: CanonicalDataProvider,
    isWaitlist: boolean,
): QueueRowProviderEligibility {
    const reasons: QueueRowProviderExclusionReason[] = [];

    if (!providerAvailableForContext(provider, isWaitlist)) {
        pushReason(reasons, "wrong_context");
    }
    if (provider.legacyOnly) {
        pushReason(reasons, "legacy_only");
    }

    const pickerCap = consumerSupportsProviderInPicker("queue_row", provider);
    if (!pickerCap) {
        if (provider.kind === "collection" && !provider.collectionProjection) {
            pushReason(reasons, "whole_collection_without_renderer");
        } else {
            pushReason(reasons, "consumer_capability_blocked");
        }
    }

    const publishCap = consumerSupportsProviderAtPublish("queue_row", provider, isWaitlist);
    if (!publishCap) {
        if (provider.kind === "collection" && !provider.collectionProjection) {
            pushReason(reasons, "whole_collection_without_renderer");
        } else if (!providerAvailableForContext(provider, isWaitlist)) {
            pushReason(reasons, "wrong_context");
        } else {
            pushReason(reasons, "unsupported_kind");
        }
    }

    if (!providerHasResolverMetadata(provider)) {
        pushReason(reasons, "missing_resolver");
    }

    const contextOk = providerAvailableForContext(provider, isWaitlist);
    const resolverOk = providerHasResolverMetadata(provider);

    return {
        refKey: provider.refKey,
        picker: pickerCap && contextOk && !provider.legacyOnly,
        publish: publishCap && resolverOk,
        resolvable: publishCap && resolverOk && contextOk,
        reasons,
    };
}

export function evaluateQueueRowProviderEligibility(
    refKey: string,
    isWaitlist: boolean,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): QueueRowProviderEligibility {
    const trimmed = refKey.trim();

    if (!trimmed) {
        return { refKey: trimmed, picker: false, publish: false, resolvable: false, reasons: ["unknown_provider"] };
    }

    const provider = findCanonicalDataProvider(trimmed, { isWaitlist, tenantFieldDefinitions });
    if (provider) {
        return evaluateCanonicalProvider(provider, isWaitlist);
    }

    if (isLegacyQueueRowCompatibilityRefKey(trimmed)) {
        const legacy = legacyQueueRowCompatibilityEntry(trimmed);
        const reasons: QueueRowProviderExclusionReason[] = ["legacy_only"];
        if (legacy?.waitlistOnly && !isWaitlist) {
            pushReason(reasons, "wrong_context");
        }
        const allowed = legacy?.publishes !== false && !reasons.includes("wrong_context");
        return {
            refKey: trimmed,
            picker: false,
            publish: allowed,
            resolvable: allowed,
            reasons,
        };
    }

    return { refKey: trimmed, picker: false, publish: false, resolvable: false, reasons: ["unknown_provider"] };
}
