import type { LayoutSurfaceFieldMeta } from "@/components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

/** Map identity record VM rows to canvas layout-surface field metadata for one config purpose. */
export function layoutFieldsFromIdentityRecord(
    record: IdentityRecordVM,
    purpose: Exclude<IdentityConfigurationPurpose, "evidence">,
): LayoutSurfaceFieldMeta[] {
    const rows =
        purpose === "summary" ? record.summaryRows
        : purpose === "context_facts" ? record.contextRows
        : record.detailRows.length > 0 ? record.detailRows
        : record.expandedRows;

    const fields: LayoutSurfaceFieldMeta[] = [];
    for (const row of rows) {
        for (const cell of row.cells) {
            if (!cell.fieldRef) continue;
            fields.push({
                fieldKey: cell.fieldRef,
                label: cell.label,
                value: cell.value,
            });
        }
    }
    return fields;
}
