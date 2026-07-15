/**
 * Capability ↔ provider contract — Settings availability must match consumer providers.
 */

import type { CanonicalDataConsumerSurface, CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import { assembleFocusPanelNestedProviders, assembleQueueRowProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import {
    canSurfaceResolveField,
    type FieldResolverInput,
} from "@/lib/fields/fieldResolverRegistry";
import type { FieldConsumerSurface } from "@/lib/fields/fieldSurfaceAvailability";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export function resolverInputFromTenantChildProfileField(
    def: Pick<TenantFieldDefinitionRow, "entity_type" | "field_key" | "field_type" | "is_system" | "is_active" | "config">,
): FieldResolverInput | null {
    if (def.entity_type.trim().toLowerCase() !== "customer_member") return null;
    const field_key = def.field_key.trim();
    if (!field_key) return null;
    return {
        entity_type: "customer_member",
        field_key,
        field_type: def.field_type,
        is_system: def.is_system,
        is_active: def.is_active !== false,
        config: def.config ?? null,
    };
}

export function consumerSurfaceSupportsTenantField(
    def: TenantFieldDefinitionRow,
    consumer: FieldConsumerSurface,
): boolean {
    const input = resolverInputFromTenantChildProfileField(def);
    if (!input) {
        // Non-profile tenant fields: provider assembly + existing visibility rules decide.
        return true;
    }
    return canSurfaceResolveField(consumer, input).supported;
}

export function providerRefKeysForConsumer(
    consumer: CanonicalDataConsumerSurface,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): Set<string> {
    const assembly =
        consumer === "focus_panel"
            ? assembleFocusPanelNestedProviders({ tenantFieldDefinitions })
            : consumer === "queue_row"
                ? assembleQueueRowProviders({ tenantFieldDefinitions })
                : assembleFocusPanelNestedProviders({ tenantFieldDefinitions });
    return new Set(assembly.map((provider) => provider.refKey));
}

/** FC-CM-1 profile seeds that Settings may mark Focus Panel–available. */
export const FC_CM1_CHILD_PROFILE_FIELD_KEYS = CUSTOMER_MEMBER_CONFIG_FIELD_KEYS;

export function assertCapabilityProviderParityForChildProfileSeeds(
    tenantFieldDefinitions: readonly TenantFieldDefinitionRow[],
    consumer: FieldConsumerSurface = "focus_panel",
): { ok: true } | { ok: false; missing: string[]; unexpected: string[] } {
    const seeds = tenantFieldDefinitions.filter(
        (def) =>
            def.entity_type.trim().toLowerCase() === "customer_member"
            && (FC_CM1_CHILD_PROFILE_FIELD_KEYS as readonly string[]).includes(def.field_key.trim()),
    );
    const providers = providerRefKeysForConsumer(
        consumer === "queue_row" ? "queue_row" : "focus_panel",
        tenantFieldDefinitions,
    );
    const missing: string[] = [];
    const unexpected: string[] = [];

    for (const seed of seeds) {
        const refKey = `child.${seed.field_key.trim()}`;
        const capable = consumerSurfaceSupportsTenantField(seed, consumer);
        const hasProvider = providers.has(refKey);
        if (capable && !hasProvider) missing.push(refKey);
        if (!capable && hasProvider && consumer === "queue_row") {
            // Queue must not offer non-resolvable profile seeds.
            unexpected.push(refKey);
        }
    }

    if (missing.length || unexpected.length) return { ok: false, missing, unexpected };
    return { ok: true };
}

export function filterProvidersByConsumerCapability(
    providers: readonly CanonicalDataProvider[],
    consumer: CanonicalDataConsumerSurface,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): CanonicalDataProvider[] {
    if (!tenantFieldDefinitions?.length) return [...providers];
    const byRef = new Map(
        tenantFieldDefinitions.map((def) => {
            const entity = def.entity_type.trim().toLowerCase();
            const key = def.field_key.trim();
            const refKey = entity === "customer_member" ? `child.${key}` : `${entity}.${key}`;
            return [refKey, def] as const;
        }),
    );

    return providers.filter((provider) => {
        const def = byRef.get(provider.refKey);
        if (!def) return true;
        if (def.entity_type.trim().toLowerCase() !== "customer_member") return true;
        if (!(FC_CM1_CHILD_PROFILE_FIELD_KEYS as readonly string[]).includes(def.field_key.trim())) {
            return true;
        }
        return consumerSurfaceSupportsTenantField(def, consumer);
    });
}
