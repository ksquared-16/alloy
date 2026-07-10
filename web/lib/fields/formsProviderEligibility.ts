/**
 * Forms / Documents provider eligibility — distinguishable capability gates for picker,
 * publish, and hydration. Scalar providers with compatible controls only.
 */

import type {
    CanonicalDataProvider,
    QueueRowProviderEligibility,
    QueueRowProviderExclusionReason,
} from "@/lib/fields/canonicalDataProviderModel";
import {
    consumerSupportsProviderAtPublish,
    consumerSupportsProviderInPicker,
    FORMS_DOCUMENTS_CONSUMER,
} from "@/lib/fields/consumerProviderCapabilities";
import { findFormsDocumentsDataProvider } from "@/lib/fields/canonicalDataProviderRegistry";
import {
    formsLegacyCompatibilityEntry,
    type FormsLegacyCompatibilityEntry,
} from "@/lib/fields/formsLegacyCompatibility";
import type { FieldDefinitionPickerRow } from "@/lib/fields/formFieldRegistryPicker";
import type { SystemFieldValueKind } from "@/lib/forms/systemFieldRegistry";

const COMPATIBLE_CONTROL_KINDS = new Set<SystemFieldValueKind>([
    "text",
    "textarea",
    "email",
    "phone",
    "number",
    "date",
    "checkbox",
    "select",
]);

function pushReason(reasons: QueueRowProviderExclusionReason[], reason: QueueRowProviderExclusionReason) {
    if (!reasons.includes(reason)) reasons.push(reason);
}

function hasCompatibleControl(provider: CanonicalDataProvider): boolean {
    const fieldType = (provider.fieldType ?? provider.valueType ?? "text").toLowerCase();
    if (fieldType === "signature") return false;
    if (fieldType === "multiselect") return false;
    if ((COMPATIBLE_CONTROL_KINDS as ReadonlySet<string>).has(fieldType)) return true;
    switch (provider.valueType) {
        case "number":
        case "date":
        case "boolean":
        case "choice":
        case "text":
        case "link":
            return true;
        default:
            return fieldType === "text" || fieldType === "textarea";
    }
}

function evaluateCanonicalProvider(provider: CanonicalDataProvider): QueueRowProviderEligibility {
    const reasons: QueueRowProviderExclusionReason[] = [];

    if (provider.legacyOnly) pushReason(reasons, "legacy_only");
    if (provider.outputShape !== "scalar") pushReason(reasons, "unsupported_shape");
    if (provider.kind === "relationship" || provider.kind === "collection") {
        pushReason(reasons, "unsupported_kind");
    }
    if (provider.kind === "calculated_field" || provider.kind === "runtime_signal") {
        pushReason(reasons, "unsupported_kind");
    }

    const pickerCap = consumerSupportsProviderInPicker(FORMS_DOCUMENTS_CONSUMER, provider);
    if (!pickerCap) pushReason(reasons, "consumer_capability_blocked");

    const publishCap = consumerSupportsProviderAtPublish(FORMS_DOCUMENTS_CONSUMER, provider, false);
    if (!publishCap) pushReason(reasons, "unsupported_kind");

    if (!hasCompatibleControl(provider)) {
        pushReason(reasons, "consumer_capability_blocked");
    }

    return {
        refKey: provider.refKey,
        picker: pickerCap && !provider.legacyOnly && hasCompatibleControl(provider),
        publish: publishCap && hasCompatibleControl(provider),
        resolvable: publishCap,
        reasons,
    };
}

export function evaluateFormsProviderEligibility(
    refKey: string,
    tenantFieldDefinitions?: readonly FieldDefinitionPickerRow[],
): QueueRowProviderEligibility {
    const trimmed = refKey.trim();
    if (!trimmed) {
        return { refKey: trimmed, picker: false, publish: false, resolvable: false, reasons: ["unknown_provider"] };
    }

    const provider = findFormsDocumentsDataProvider(trimmed, { tenantFieldDefinitions });
    if (provider) return evaluateCanonicalProvider(provider);

    const legacy = formsLegacyCompatibilityEntry(trimmed);
    if (legacy) return evaluateLegacyCompatibilityEntry(legacy);

    return { refKey: trimmed, picker: false, publish: false, resolvable: false, reasons: ["unknown_provider"] };
}

function evaluateLegacyCompatibilityEntry(entry: FormsLegacyCompatibilityEntry): QueueRowProviderEligibility {
    const reasons: QueueRowProviderExclusionReason[] = [];
    if (!entry.appearsInNewPickers) pushReason(reasons, "legacy_only");
    if (!entry.publishes) pushReason(reasons, "unsupported_kind");
    return {
        refKey: entry.systemFieldId,
        picker: entry.appearsInNewPickers,
        publish: entry.publishes,
        resolvable: entry.hydrates,
        reasons,
    };
}

export function filterFormsDocumentsPickerProviders(
    providers: readonly CanonicalDataProvider[],
): CanonicalDataProvider[] {
    return providers.filter((provider) => evaluateCanonicalProvider(provider).picker);
}

export { hasCompatibleControl as formsProviderHasCompatibleControl };
