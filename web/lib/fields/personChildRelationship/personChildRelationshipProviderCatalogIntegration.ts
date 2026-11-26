/**
 * Canonical provider catalog integration for person_child_relationship fields.
 */

import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import {
    PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_MANIFEST,
    PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
    PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST,
    personChildRelationshipProviderRef,
} from "./personChildRelationshipFieldRegistry";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

const RESOLVER_OWNER = "web/lib/fields/personChildRelationship/personChildRelationshipResolverRegistry.ts";

function baseProvider(row: {
    field_key: string;
    label: string;
    field_type: string;
    isSystem: boolean;
    option_set_key?: string;
}): CanonicalDataProvider {
    return {
        refKey: personChildRelationshipProviderRef(row.field_key),
        label: row.label,
        kind: "business_field",
        outputShape: "scalar",
        entityNamespace: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
        settingsEntity: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
        categoryKey: "family_relationships",
        fieldType: row.field_type,
        valueType: row.field_type === "select" ? "choice" : row.field_type === "number" ? "number" : "text",
        isSystem: row.isSystem,
        availability: { pipeline: true, waitlist: false },
        source: {
            source: row.isSystem ? "platform_field_manifest" : "field_definitions",
            sourceModule: "web/lib/fields/personChildRelationship/personChildRelationshipFieldRegistry.ts",
        },
        resolverOwner: RESOLVER_OWNER,
    };
}

export function buildPersonChildRelationshipPlatformProviders(): CanonicalDataProvider[] {
    const native = PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST.map((row) =>
        baseProvider({
            field_key: row.field_key,
            label: row.label,
            field_type: row.field_type,
            isSystem: true,
            option_set_key:
                typeof row.config?.option_set_key === "string" ? row.config.option_set_key : undefined,
        }),
    );
    const config = PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_MANIFEST.map((row) =>
        baseProvider({
            field_key: row.field_key,
            label: row.label,
            field_type: row.field_type,
            isSystem: false,
        }),
    );
    return [...native, ...config];
}

export function tenantPersonChildRelationshipProviders(
    defs: readonly TenantFieldDefinitionRow[],
): CanonicalDataProvider[] {
    return defs
        .filter((d) => d.entity_type === PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE)
        .map((d) =>
            baseProvider({
                field_key: d.field_key,
                label: d.label ?? d.field_key,
                field_type: d.field_type,
                isSystem: d.is_system,
                option_set_key:
                    typeof d.config?.option_set_key === "string" ? (d.config.option_set_key as string) : undefined,
            }),
        );
}

export function mergePersonChildRelationshipProviders(
    catalog: CanonicalDataProvider[],
    tenantDefs?: readonly TenantFieldDefinitionRow[],
): CanonicalDataProvider[] {
    const seen = new Map(catalog.map((p) => [p.refKey, p]));
    for (const p of buildPersonChildRelationshipPlatformProviders()) {
        if (!seen.has(p.refKey)) seen.set(p.refKey, p);
    }
    if (tenantDefs?.length) {
        for (const p of tenantPersonChildRelationshipProviders(tenantDefs)) {
            seen.set(p.refKey, p);
        }
    }
    return [...seen.values()];
}
