/**
 * Field eligibility for Layouts composition pickers (assign/move fields between sections).
 * Broader than Fields-settings operator list: includes drawer-visible system fields.
 */

import { isAlwaysHiddenFieldKey } from "@/lib/fields/fieldSettingsOperatorUi";

export type LayoutFieldPickerRow = {
    field_key: string;
    is_active?: boolean;
    is_visible_in_drawer?: boolean;
};

/** Fields that may be moved into a drawer section from Layouts. */
export function isEligibleForLayoutFieldPicker(_entityType: string, row: LayoutFieldPickerRow): boolean {
    const key = row.field_key.trim();
    if (!key || isAlwaysHiddenFieldKey(key)) return false;
    if (row.is_active === false) return false;
    if (row.is_visible_in_drawer === false) return false;
    return true;
}
