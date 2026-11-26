/**
 * Drawer layout field adapter — canonical provider labels for drawer pickers.
 */

import { resolveCanonicalProviderForConsumer } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { resolveFieldPickerLabel, type FieldPickerSurface } from "@/lib/layout/fieldPickerContextCatalog";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

const DRAWER_SURFACES: Record<string, FieldPickerSurface> = {
    opportunities: "opportunity_drawer",
    opportunity: "opportunity_drawer",
    person: "person_drawer",
    child: "child_drawer",
};

export function resolveDrawerCanonicalFieldLabel(
    refKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
    surfaceHint?: FieldPickerSurface,
): string {
    const provider = resolveCanonicalProviderForConsumer(refKey, "drawer", { tenantFieldDefinitions });
    if (provider?.label) return provider.label;
    const entityKey = refKey.includes(".") ? refKey.slice(0, refKey.indexOf(".")) : "opportunity";
    const surface = surfaceHint ?? DRAWER_SURFACES[entityKey] ?? "opportunity_drawer";
    return resolveFieldPickerLabel(refKey, surface);
}
