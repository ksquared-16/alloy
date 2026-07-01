/**
 * Deterministic canonical field catalog rows for documentation generation.
 * Source-backed only — registries and layout catalog, not hand-authored drift.
 */

import { buildCanonicalParityExpectedRows } from "@/lib/fields/canonicalNativeColumnParity";
import { CUSTOMER_MEMBER_NATIVE_COLUMN_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import { CHILDCARE_STARTER_FIELD_CATALOG } from "@/lib/layout/childcareLayoutFieldCatalog";
import { layoutRefKeyToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";

export type CanonicalFieldCatalogRow = {
    field_key: string;
    label: string;
    entity_owner: string;
    source_table: string;
    source_column: string;
    data_type: string;
    field_type: string;
    editability: "editable" | "read-only" | "computed";
    config_exposed: boolean;
    runtime_exposed: boolean;
    workflow_action_usage: string;
    analytics_report_usage: string;
    status: "native" | "config" | "computed" | "deprecated";
    layout_ref_key: string;
};

function editabilityFor(entry: (typeof CHILDCARE_STARTER_FIELD_CATALOG)[number]): CanonicalFieldCatalogRow["editability"] {
    if (entry.computed) return "computed";
    if (entry.relationshipProjection) return "read-only";
    return "editable";
}

function catalogStatusFor(entry: (typeof CHILDCARE_STARTER_FIELD_CATALOG)[number]): CanonicalFieldCatalogRow["status"] {
    if (entry.computed) return "computed";
    if (entry.storageColumn === "field_values") return "config";
    return "native";
}

function entityOwnerFromRefKey(refKey: string, fallback?: string): string {
    const ref = layoutRefKeyToCanonicalRef(refKey);
    return ref?.entity_type ?? fallback ?? "unknown";
}

function fieldKeyFromEntry(entry: (typeof CHILDCARE_STARTER_FIELD_CATALOG)[number]): string {
    return entry.defFieldKey ?? entry.refKey.split(".").slice(1).join(".") ?? entry.refKey;
}

/** Rows from childcare layout starter catalog (primary operator-facing surface). */
export function buildLayoutCatalogRows(): CanonicalFieldCatalogRow[] {
    return CHILDCARE_STARTER_FIELD_CATALOG.map((entry) => {
        const entityOwner = entry.defEntityType ?? entityOwnerFromRefKey(entry.refKey, entry.operatorEntity);
        const fieldKey = fieldKeyFromEntry(entry);
        const parity = buildCanonicalParityExpectedRows().find(
            (r) => r.entity_type === entityOwner && r.field_key === fieldKey
        );
        return {
            field_key: fieldKey,
            label: entry.pickerLabel,
            entity_owner: entityOwner,
            source_table: entry.storageTable ?? "—",
            source_column: entry.storageColumn ?? entry.storagePath ?? fieldKey,
            data_type: entry.fieldType,
            field_type: entry.fieldType,
            editability: editabilityFor(entry),
            config_exposed: parity != null || entry.storageColumn === "field_values",
            runtime_exposed: true,
            workflow_action_usage: parity ? "lifecycle / field_rules" : "layout / drawer",
            analytics_report_usage: entry.computed ? "derived projection" : "canonical entity row",
            status: catalogStatusFor(entry),
            layout_ref_key: entry.refKey,
        };
    }).sort((a, b) => a.entity_owner.localeCompare(b.entity_owner) || a.field_key.localeCompare(b.field_key));
}

/** Native customer_member columns not always present in layout starter catalog. */
export function buildCustomerMemberNativeSupplementRows(): CanonicalFieldCatalogRow[] {
    const layoutKeys = new Set(buildLayoutCatalogRows().filter((r) => r.entity_owner === "customer_member").map((r) => r.field_key));
    return CUSTOMER_MEMBER_NATIVE_COLUMN_KEYS.filter((k) => !layoutKeys.has(k) && !["metadata", "person_id", "customer_id", "is_active"].includes(k))
        .map((key) => ({
            field_key: key,
            label: key.replace(/_/g, " "),
            entity_owner: "customer_member",
            source_table: "customer_members",
            source_column: key,
            data_type: key === "dob" ? "date" : "text",
            field_type: key === "dob" ? "date" : "text",
            editability: "editable" as const,
            config_exposed: false,
            runtime_exposed: true,
            workflow_action_usage: "PATCH customer-members",
            analytics_report_usage: "canonical entity row",
            status: "native" as const,
            layout_ref_key: `child.${key === "dob" ? "date_of_birth" : key}`,
        }));
}

export function buildCanonicalFieldCatalogRows(): CanonicalFieldCatalogRow[] {
    const byKey = new Map<string, CanonicalFieldCatalogRow>();
    for (const row of [...buildLayoutCatalogRows(), ...buildCustomerMemberNativeSupplementRows()]) {
        const key = `${row.entity_owner}:${row.field_key}`;
        if (!byKey.has(key)) byKey.set(key, row);
    }
    return [...byKey.values()].sort(
        (a, b) => a.entity_owner.localeCompare(b.entity_owner) || a.field_key.localeCompare(b.field_key)
    );
}

export function formatCanonicalFieldCatalogMarkdown(rows: CanonicalFieldCatalogRow[]): string {
    const lines: string[] = [
        "# Canonical Field Catalog",
        "",
        "**Status:** Generated — do not hand-edit rows",
        "**Generator:** `web/scripts/generateCanonicalFieldCatalogDoc.ts`",
        "**Sources:** `childcareLayoutFieldCatalog`, `customerMemberFieldRegistry`, `inquiryChildFieldRegistry`, `opportunityFieldRegistry`, `canonicalNativeColumnParity`",
        "",
        `**Row count:** ${rows.length}`,
        "",
        "| field_key | label | entity_owner | source_table | source_column | data_type | field_type | editability | config | runtime | workflow/action | analytics | status | layout_ref_key |",
        "|-----------|-------|--------------|--------------|---------------|-----------|------------|-------------|--------|---------|-----------------|-----------|--------|----------------|",
    ];
    for (const r of rows) {
        lines.push(
            `| ${r.field_key} | ${r.label} | ${r.entity_owner} | ${r.source_table} | ${r.source_column} | ${r.data_type} | ${r.field_type} | ${r.editability} | ${r.config_exposed ? "yes" : "no"} | ${r.runtime_exposed ? "yes" : "no"} | ${r.workflow_action_usage} | ${r.analytics_report_usage} | ${r.status} | ${r.layout_ref_key} |`
        );
    }
    lines.push("");
    lines.push("## Regenerate");
    lines.push("");
    lines.push("```bash");
    lines.push("cd web && npx tsx scripts/generateCanonicalFieldCatalogDoc.ts");
    lines.push("```");
    lines.push("");
    return lines.join("\n");
}
