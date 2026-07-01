/** Platform drawer header menu label — not layout-configurable. */
export const RECORD_DRAWER_MANAGE_MENU_LABEL = "Manage";

export type RecordManageEntityKind =
    | "lead"
    | "person"
    | "child"
    | "customer"
    | "vendor"
    | "associate"
    | "agent";

export type RecordManageMenuActionKey =
    | "duplicate_lead"
    | "merge_lead"
    | "transfer_lead"
    | "export_lead"
    | "archive_lead"
    | "delete_lead"
    | "merge_person"
    | "export_person"
    | "archive_person"
    | "delete_person"
    | "transfer_enrollment"
    | "export_child"
    | "archive_child"
    | "delete_child"
    | "merge_customer"
    | "export_customer"
    | "archive_customer"
    | "delete_customer"
    | "export_vendor"
    | "archive_vendor"
    | "delete_vendor"
    | "export_associate"
    | "archive_associate"
    | "delete_associate"
    | "export_agent"
    | "archive_agent"
    | "delete_agent";

export type RecordManageMenuItem =
    | { kind: "separator" }
    | {
          kind: "action";
          key: RecordManageMenuActionKey;
          label: string;
          /** When false, item is visible but not selectable (V1 stubs). */
          enabled: boolean;
      };
