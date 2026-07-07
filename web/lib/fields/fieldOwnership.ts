/**
 * Field ownership — the three canonical field classes in Alloy.
 *
 * platform: native DB-backed columns and platform-owned metadata
 * custom: tenant-configured field_definitions / field_values
 * computed: runtime projections derived at read time
 */

export type FieldOwnershipKind = "platform" | "custom" | "computed";

export const FIELD_OWNERSHIP_LABELS: Readonly<Record<FieldOwnershipKind, string>> = {
    platform: "Platform",
    custom: "Custom",
    computed: "Computed",
};

export function isFieldOwnershipKind(value: string): value is FieldOwnershipKind {
    return value === "platform" || value === "custom" || value === "computed";
}
