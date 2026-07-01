import { personDisplayName } from "@/lib/adminFormatters";

export const PERSON_DRAWER_PARENT_SUMMARY_NATIVE_KEYS = new Set([
    "first_name",
    "last_name",
    "email",
    "phone",
]);

export const PERSON_DRAWER_PARENT_SUMMARY_CONFIG_KEYS = new Set([
    "preferred_contact_method",
    "communication_opt_out",
]);

export type PersonDrawerParentSummaryModel = {
    display_name: string;
    initials: string;
    photo_url: string | null;
    primary_household_label: string | null;
    primary_child_label: string | null;
    communication_opt_out: boolean;
    preferred_contact_method: string | null;
    has_preferred_contact_field: boolean;
    has_communication_opt_out_field: boolean;
};

function initialsFromDisplayName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function personDrawerPhotoUrl(record: Record<string, unknown>): string | null {
    for (const key of ["photo_url", "avatar_url", "profile_photo_url", "profile_image_url"]) {
        const value = record[key];
        if (value != null && String(value).trim() !== "") {
            return String(value).trim();
        }
    }
    return null;
}

function fieldDefKeys(record: Record<string, unknown>): Set<string> {
    const defs = (record._field_definitions as { field_key?: string }[] | undefined) ?? [];
    return new Set(defs.map((d) => String(d.field_key ?? "").trim()).filter(Boolean));
}

function readBooleanField(record: Record<string, unknown>, key: string): boolean {
    const raw = record[key];
    if (raw === true || raw === "true" || raw === 1 || raw === "1") return true;
    return false;
}

function readTextField(record: Record<string, unknown>, key: string): string | null {
    const raw = record[key];
    if (raw == null || String(raw).trim() === "") return null;
    return String(raw).trim();
}

/** Parent operating summary — contact identity + configurable preference fields. */
export function resolvePersonDrawerParentSummaryModel(record: Record<string, unknown>): PersonDrawerParentSummaryModel {
    const display_name =
        personDisplayName({
            first_name: record.first_name as string | null | undefined,
            last_name: record.last_name as string | null | undefined,
            full_name: record.full_name as string | null | undefined,
        }) ||
        String(record._person_name ?? "").trim() ||
        "Person";

    const configured = fieldDefKeys(record);

    return {
        display_name,
        initials: initialsFromDisplayName(display_name),
        photo_url: personDrawerPhotoUrl(record),
        primary_household_label: readTextField(record, "_parent_primary_household_label"),
        primary_child_label: readTextField(record, "_parent_primary_child_label"),
        communication_opt_out: readBooleanField(record, "communication_opt_out"),
        preferred_contact_method: readTextField(record, "preferred_contact_method"),
        has_preferred_contact_field:
            configured.has("preferred_contact_method") || record.preferred_contact_method != null,
        has_communication_opt_out_field:
            configured.has("communication_opt_out") || record.communication_opt_out != null,
    };
}
