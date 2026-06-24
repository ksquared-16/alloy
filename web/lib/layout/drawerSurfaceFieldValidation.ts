/**
 * Drawer layout editor — surface-aware field ref validation and error copy.
 */

import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import { readLayoutEditorBlockConfig } from "@/lib/layout/layoutEditorBlockConfig";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { buildTenantLayoutFieldRefKeySet } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import {
    isAllowedChildDrawerFieldRefKey,
    isAllowedDrawerSurfaceFieldRefKey,
    isAllowedOpportunityDrawerFieldRefKey,
    isAllowedPersonDrawerFieldRefKey,
    isAllowedPersonDrawerLinkedChildFieldRefKey,
    type SurfaceLayoutKey,
} from "@/lib/layout/surfaceLayoutRegistry";

export type DrawerEditorFieldValidationOptions = {
    surfaceKey: DrawerLayoutEditorSurfaceKey;
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    /** When adding inside a related_list or child-row block. */
    linkedChildContext?: boolean;
    /** Parent related_list item when validating a column refKey. */
    relatedListItem?: LayoutItem;
};

export function drawerSurfaceDisplayLabel(surfaceKey: DrawerLayoutEditorSurfaceKey): string {
    if (surfaceKey === "person_drawer") return "person drawer";
    if (surfaceKey === "child_drawer") return "child drawer";
    return "opportunity drawer";
}

export function tenantFieldRefKeysForDrawerSurface(
    surfaceKey: DrawerLayoutEditorSurfaceKey,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): ReadonlySet<string> | undefined {
    if (!tenantFieldDefinitions?.length) return undefined;
    return buildTenantLayoutFieldRefKeySet(tenantFieldDefinitions, surfaceKey);
}

export function isLinkedChildRelatedListItem(item: LayoutItem): boolean {
    if (item.kind !== "related_list") return false;
    const refKey = item.refKey?.trim() ?? "";
    if (refKey === "children" || refKey === "household_children") return true;
    const entityType = item.related?.entityType?.trim().toLowerCase() ?? "";
    return entityType === "child" || entityType === "customer_members";
}

export function isLinkedChildBlockContext(item: LayoutItem | undefined): boolean {
    if (!item) return false;
    if (item.kind === "related_list" && isLinkedChildRelatedListItem(item)) return true;
    const blockConfig = readLayoutEditorBlockConfig(item.metadata);
    return blockConfig.blockType === "child_row_template" || blockConfig.dataContext === "child";
}

export function isAllowedDrawerEditorFieldRefKey(
    refKey: string,
    options: DrawerEditorFieldValidationOptions,
): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return false;

    const tenantRefKeys = tenantFieldRefKeysForDrawerSurface(options.surfaceKey, options.tenantFieldDefinitions);

    if (options.surfaceKey === "person_drawer") {
        if (options.linkedChildContext || isLinkedChildBlockContext(options.relatedListItem)) {
            if (tenantRefKeys?.has(trimmed)) return true;
            if (isAllowedPersonDrawerLinkedChildFieldRefKey(trimmed)) return true;
            return (
                isAllowedOpportunityDrawerFieldRefKey(trimmed)
                && (trimmed.startsWith("child.") || trimmed.startsWith("inquiry_child."))
            );
        }
        return isAllowedPersonDrawerFieldRefKey(trimmed, tenantRefKeys);
    }

    return isAllowedDrawerSurfaceFieldRefKey(options.surfaceKey, trimmed, tenantRefKeys);
}

export function drawerFieldRefNotAllowedError(
    refKey: string,
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): string {
    return `"${refKey}" is not allowed on the ${drawerSurfaceDisplayLabel(surfaceKey)}.`;
}

/** Operator-facing validation messages — surface-aware (never "opportunity drawer" on person/child). */
export function formatDrawerLayoutValidationErrors(
    errors: string[],
    surfaceKey: DrawerLayoutEditorSurfaceKey,
): string[] {
    const drawerLabel = drawerSurfaceDisplayLabel(surfaceKey);
    return errors.map((err) => {
        let msg = err
            .replace(/^sections\[(\d+)\]\.key:/, "Section $1:")
            .replace(/^sections\[(\d+)\]\./, "Section $1 · ")
            .replace(/^doc\.metadata:/, "Layout settings:")
            .replace(/^doc\.sections\[(\d+)\]\./, "Section $1 · ");

        msg = msg.replace(
            /legacy_invalid_section_key "([^"]+)"/,
            'This custom section was created with an invalid key ("$1"). Please recreate it or use "Repair generated layout keys".',
        );
        msg = msg.replace(
            /custom_section_missing_metadata for key "([^"]+)"/,
            'Custom section "$1" is missing required layout metadata. Use "Repair generated layout keys" or recreate the section.',
        );
        msg = msg.replace(
            /legacy_invalid_block_refKey "([^"]+)"/,
            'This custom block is missing a valid layout block ID. Use "Repair generated layout keys" or add the block again.',
        );
        msg = msg.replace(
            /custom_block_missing_metadata for refKey "([^"]+)"/,
            'Custom block "$1" is missing required layout metadata. Use "Repair generated layout keys" or recreate the block.',
        );
        msg = msg.replace(
            /unknown field refKey "([^"]+)"/,
            `Field "$1" is not allowed on the ${drawerLabel}`,
        );
        msg = msg.replace(/unknown field_group refKey "([^"]+)"/, 'Block "$1" is not allowed on this surface');
        msg = msg.replace(/unknown related_list refKey "([^"]+)"/, 'List "$1" is not allowed on this surface');
        msg = msg.replace(/unknown section key "([^"]+)"/, `Section "$1" is not registered for the ${drawerLabel}`);
        msg = msg.replace(/unknown metadata key "([^"]+)"/, 'Setting "$1" is not supported');
        msg = msg.replace(/unknown widget refKey "([^"]+)"/, 'Widget "$1" is not allowed on this surface');
        msg = msg.replace(
            /related list entity "([^"]+)" is preview-only and cannot be published/,
            'Related list "$1" is preview-only — choose Children, Contacts, or Household members before publishing',
        );
        msg = msg.replace(
            /action buttons are preview-only and cannot be published/,
            "Action buttons are preview-only — remove them or wait for live drawer action wiring before publishing",
        );
        return msg;
    });
}

export function isAllowedDrawerRelatedListColumnRefKey(
    surfaceKey: SurfaceLayoutKey,
    refKey: string,
    relatedListItem: LayoutItem,
    tenantFieldRefKeys?: ReadonlySet<string>,
): boolean {
    if (surfaceKey === "person_drawer" && isLinkedChildRelatedListItem(relatedListItem)) {
        if (tenantFieldRefKeys?.has(refKey)) return true;
        if (isAllowedPersonDrawerLinkedChildFieldRefKey(refKey)) return true;
        return (
            isAllowedOpportunityDrawerFieldRefKey(refKey)
            && (refKey.startsWith("child.") || refKey.startsWith("inquiry_child."))
        );
    }
    if (surfaceKey === "child_drawer") {
        return isAllowedChildDrawerFieldRefKey(refKey, tenantFieldRefKeys);
    }
    if (surfaceKey === "opportunity_drawer") {
        return isAllowedOpportunityDrawerFieldRefKey(refKey, tenantFieldRefKeys);
    }
    return false;
}
