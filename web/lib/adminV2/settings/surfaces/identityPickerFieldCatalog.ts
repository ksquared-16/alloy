/**
 * Canonical identity field picker — Settings Fields catalog semantics for Focus Panel composers.
 *
 * Delegates to {@link assembleSurfaceComposerFieldCatalog} so Focus Panel, Queue Row, and
 * future composers share one category assembly (configured sections + provider capability).
 */

import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import type { AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import {
    assembleSurfaceComposerFieldCatalog,
    SURFACE_COMPOSER_SHOW_ALL_KEY,
    type SurfaceComposerCategory,
    type SurfaceComposerFieldOption,
} from "@/lib/adminV2/settings/surfaces/surfaceComposerFieldCatalog";

export type IdentityPickerFieldOption = SurfaceComposerFieldOption;
export type IdentityPickerCategory = SurfaceComposerCategory;
export { SURFACE_COMPOSER_SHOW_ALL_KEY as IDENTITY_PICKER_SHOW_ALL_KEY };

/** Build category-grouped picker options for identity surfaces. */
export function identityPickerCategoriesForNamespaces(args: {
    namespaces: readonly AvailableFieldEntityNamespace[];
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    sectionRegistry?: readonly FieldSectionRegistryRow[];
    excludeKeys?: ReadonlySet<string>;
    isWaitlist?: boolean;
    /** Default true — include a Show all tab that preserves category grouping order. */
    includeShowAll?: boolean;
}): IdentityPickerCategory[] {
    return assembleSurfaceComposerFieldCatalog(args);
}

/** Flat selectable field list (canonical catalog). */
export function identityPickerFieldsForNamespaces(
    args: Parameters<typeof identityPickerCategoriesForNamespaces>[0],
): IdentityPickerFieldOption[] {
    return identityPickerCategoriesForNamespaces({ ...args, includeShowAll: false }).flatMap(
        (category) => category.fields,
    );
}
