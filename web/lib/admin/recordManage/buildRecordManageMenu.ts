import type {
    RecordManageEntityKind,
    RecordManageMenuActionKey,
    RecordManageMenuItem,
} from "@/lib/admin/recordManage/types";

function action(key: RecordManageMenuActionKey, label: string, enabled = false): RecordManageMenuItem {
    return { kind: "action", key, label, enabled };
}

function separator(): RecordManageMenuItem {
    return { kind: "separator" };
}

/**
 * Legacy entity admin Manage stubs — person/vendor/child drawers only.
 * Opportunity Focus Panel Manage uses registry `header_menu` (see buildSubjectManageMenuFromResolvedActions).
 */
export function buildRecordManageMenuForEntity(
    entityKind: RecordManageEntityKind,
    entitySingular: string
): RecordManageMenuItem[] {
    const noun = entitySingular.trim() || "Record";

    switch (entityKind) {
        case "lead":
            return [
                action("duplicate_lead", `Duplicate ${noun}`),
                action("merge_lead", `Merge ${noun}`),
                action("transfer_lead", `Transfer ${noun}`),
                action("export_lead", "Export"),
                separator(),
                action("archive_lead", `Archive ${noun}`),
                action("delete_lead", `Delete ${noun}`, true),
            ];
        case "person":
            return [
                action("merge_person", `Merge ${noun}`),
                action("export_person", "Export"),
                separator(),
                action("archive_person", `Archive ${noun}`),
                action("delete_person", `Delete ${noun}`),
            ];
        case "child":
            return [
                action("transfer_enrollment", "Transfer Enrollment"),
                action("export_child", "Export"),
                separator(),
                action("archive_child", `Archive ${noun}`),
                action("delete_child", `Delete ${noun}`),
            ];
        case "customer":
            return [
                action("merge_customer", `Merge ${noun}`),
                action("export_customer", "Export"),
                separator(),
                action("archive_customer", `Archive ${noun}`),
                action("delete_customer", `Delete ${noun}`),
            ];
        case "vendor":
            return [
                action("export_vendor", "Export"),
                separator(),
                action("archive_vendor", `Archive ${noun}`),
                action("delete_vendor", `Delete ${noun}`),
            ];
        case "associate":
            return [
                action("export_associate", "Export"),
                separator(),
                action("archive_associate", `Archive ${noun}`),
                action("delete_associate", `Delete ${noun}`),
            ];
        case "agent":
            return [
                action("export_agent", "Export"),
                separator(),
                action("archive_agent", `Archive ${noun}`),
                action("delete_agent", `Delete ${noun}`),
            ];
        default:
            return [];
    }
}

/** Flatten menu to selectable actions only (for keyboard nav / tests). */
export function flattenRecordManageMenuActions(items: RecordManageMenuItem[]): Array<
    Extract<RecordManageMenuItem, { kind: "action" }>
> {
    return items.filter((item): item is Extract<RecordManageMenuItem, { kind: "action" }> => item.kind === "action");
}
