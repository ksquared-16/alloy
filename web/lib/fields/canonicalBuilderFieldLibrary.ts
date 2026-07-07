/**
 * Canonical builder field library — single source for all surface builders.
 *
 * Queue Row, Focus Panel, Drawer, Forms, Table, and Business Process builders
 * consume field lists through this module. Surface differences come from
 * fieldCapabilityEngine / fieldResolverRegistry only.
 *
 * @see docs/sprints/07_2026/field-runtime-unification.md
 */

import { buildFormSystemFieldPicker, type FieldDefinitionPickerRow } from "@/lib/fields/formFieldRegistryPicker";
import { buildCanonicalQueueBuilderFields } from "@/lib/fields/fieldResolverRegistry";
import {
    buildTenantLayoutCatalogFields,
    type TenantFieldDefinitionRow,
    type TenantLayoutFieldSurface,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import type { FieldConsumerSurface } from "@/lib/fields/fieldSurfaceAvailability";
import { deriveFieldCapability } from "@/lib/fields/fieldCapabilityEngine";
import type { FieldResolverInput } from "@/lib/fields/fieldResolverRegistry";

export type CanonicalBuilderField = {
    key: string;
    label: string;
    entityNamespace: string;
    isSystemField: boolean;
    surfaces: FieldConsumerSurface[];
};

function resolverInputFromTenantDef(def: TenantFieldDefinitionRow): FieldResolverInput {
    return {
        entity_type: def.entity_type,
        field_key: def.field_key,
        field_type: def.field_type,
        label: def.label,
        is_system: def.is_system,
        is_active: def.is_active,
        is_visible_in_drawer: def.is_visible_in_drawer,
        is_visible_in_form: true,
        is_visible_in_table: false,
        config: def.config,
    };
}

function supportedBuilderSurfaces(input: FieldResolverInput): FieldConsumerSurface[] {
    const surfaces: FieldConsumerSurface[] = [
        "drawer",
        "forms",
        "table",
        "queue_row",
        "focus_panel",
        "business_process",
        "documents",
    ];
    return surfaces.filter((s) => deriveFieldCapability(s, input).status === "available");
}

/** Queue / Focus Panel builder fields — derived from validator allow-list. */
export function canonicalQueueBuilderFields(isWaitlist = false): CanonicalBuilderField[] {
    return buildCanonicalQueueBuilderFields(isWaitlist).map((entry) => ({
        key: entry.key,
        label: entry.label,
        entityNamespace: entry.namespace,
        isSystemField: entry.isSystemField,
        surfaces: (["queue_row", "focus_panel"] as const).filter((s) => {
            const cap = deriveFieldCapability(s, {
                entity_type: entry.namespace,
                field_key: entry.key.includes(".") ? entry.key.slice(entry.key.indexOf(".") + 1) : entry.key,
                refKey: entry.key,
                is_system: true,
                is_platform_native: false,
            });
            return cap.status === "available";
        }) as FieldConsumerSurface[],
    }));
}

/** Drawer builder fields for a layout surface. */
export function canonicalDrawerBuilderFields(
    defs: readonly TenantFieldDefinitionRow[],
    surface: TenantLayoutFieldSurface,
): CanonicalBuilderField[] {
    return buildTenantLayoutCatalogFields(defs, surface).map((field) => {
        const def = defs.find(
            (d) =>
                `${d.entity_type}.${d.field_key}` === field.refKey ||
                (d.entity_type === "customer_member" && `child.${d.field_key}` === field.refKey),
        );
        const input = def
            ? resolverInputFromTenantDef(def)
            : {
                  entity_type: field.entityKey,
                  field_key: field.fieldKey,
                  refKey: field.refKey,
                  label: field.fieldLabel,
                  is_system: true,
              };
        return {
            key: field.refKey,
            label: field.fieldLabel,
            entityNamespace: field.entityKey,
            isSystemField: def?.is_system ?? true,
            surfaces: supportedBuilderSurfaces(input),
        };
    });
}

/** Forms builder fields — registry-first. */
export function canonicalFormsBuilderFields(orgDefs: readonly FieldDefinitionPickerRow[]): CanonicalBuilderField[] {
    const entries = buildFormSystemFieldPicker(orgDefs);
    return entries.map((entry) => {
        const input: FieldResolverInput = {
            entity_type: entry.entity_type === "guardian" ? "person" : entry.entity_type === "child" ? "inquiry_child" : entry.entity_type,
            field_key: entry.field_key,
            label: entry.default_label,
            is_system: true,
            is_active: true,
            is_visible_in_form: true,
        };
        return {
            key: entry.id,
            label: entry.default_label,
            entityNamespace: entry.entity_type,
            isSystemField: true,
            surfaces: supportedBuilderSurfaces(input),
        };
    });
}
