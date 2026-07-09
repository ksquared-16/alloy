/**
 * Field ownership — canonical storage classes in Alloy.
 *
 * platform: native DB-backed columns and platform-owned metadata
 * custom: tenant-configured field_definitions / field_values (Business Fields)
 * computed: runtime catalog entries (Runtime Signals + planned Calculated Fields)
 */

export type FieldOwnershipKind = "platform" | "custom" | "computed";

export const FIELD_OWNERSHIP_LABELS: Readonly<Record<FieldOwnershipKind, string>> = {
    platform: "Platform",
    custom: "Business",
    computed: "Signals",
};

export function isFieldOwnershipKind(value: string): value is FieldOwnershipKind {
    return value === "platform" || value === "custom" || value === "computed";
}
