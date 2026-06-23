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
            return isAllowedOpportunityDrawerFieldRefKey(trimmed) && trimmed.startsWith("child.");
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

export function isAllowedDrawerRelatedListColumnRefKey(
    surfaceKey: SurfaceLayoutKey,
    refKey: string,
    relatedListItem: LayoutItem,
    tenantFieldRefKeys?: ReadonlySet<string>,
): boolean {
    if (surfaceKey === "person_drawer" && isLinkedChildRelatedListItem(relatedListItem)) {
        if (tenantFieldRefKeys?.has(refKey)) return true;
        if (isAllowedPersonDrawerLinkedChildFieldRefKey(refKey)) return true;
        return isAllowedOpportunityDrawerFieldRefKey(refKey) && refKey.startsWith("child.");
    }
    if (surfaceKey === "child_drawer") {
        return isAllowedChildDrawerFieldRefKey(refKey, tenantFieldRefKeys);
    }
    if (surfaceKey === "opportunity_drawer") {
        return isAllowedOpportunityDrawerFieldRefKey(refKey, tenantFieldRefKeys);
    }
    return false;
}
