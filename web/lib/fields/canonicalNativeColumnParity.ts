/**
 * Native-column → field_definitions parity (Phase 3).
 *
 * Uses existing registries only — not a parallel catalog.
 */

import { validateFieldDefinitionOwnership } from "@/lib/fields/canonicalFieldOwnership";
import { CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST } from "@/lib/fields/customerMemberFieldRegistry";
import { INQUIRY_CHILD_NATIVE_FIELD_MANIFEST } from "@/lib/fields/inquiryChildFieldRegistry";
import { OPPORTUNITY_NATIVE_REFERENCE_FIELD_MANIFEST } from "@/lib/fields/opportunityFieldRegistry";

export type CanonicalParityExpectedRow = {
    entity_type: string;
    field_key: string;
    field_type: string;
    label: string;
    section_key: string;
    sort_order: number;
    source: string;
    is_visible_in_drawer: boolean;
    is_visible_in_form: boolean;
    is_visible_in_table: boolean;
    config?: Record<string, unknown>;
};

export type ExistingFieldDefinitionRow = {
    entity_type: string;
    field_key: string;
    is_active?: boolean | null;
};

export function parityRowKey(entityType: string, fieldKey: string): string {
    return `${entityType.trim().toLowerCase()}:${fieldKey.trim().toLowerCase()}`;
}

/** Deterministic manifest rows expected in field_definitions for canonical persisted fields. */
export function buildCanonicalParityExpectedRows(): CanonicalParityExpectedRow[] {
    const rows: CanonicalParityExpectedRow[] = [
        ...INQUIRY_CHILD_NATIVE_FIELD_MANIFEST.map((r) => ({
            entity_type: "inquiry_child",
            field_key: r.field_key,
            field_type: r.field_type,
            label: r.label,
            section_key: r.section_key,
            sort_order: r.sort_order,
            source: "inquiryChildFieldRegistry",
            is_visible_in_drawer: r.is_visible_in_drawer,
            is_visible_in_form: r.is_visible_in_form,
            is_visible_in_table: r.is_visible_in_table,
            ...(r.config ? { config: r.config as Record<string, unknown> } : {}),
        })),
        ...CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((r) => ({
            entity_type: "customer_member",
            field_key: r.field_key,
            field_type: r.field_type,
            label: r.label,
            section_key: r.section_key,
            sort_order: r.sort_order,
            source: "customerMemberFieldRegistry",
            is_visible_in_drawer: true,
            is_visible_in_form: true,
            is_visible_in_table: false,
            ...(r.config ? { config: r.config as Record<string, unknown> } : {}),
        })),
        ...OPPORTUNITY_NATIVE_REFERENCE_FIELD_MANIFEST.map((r) => ({
            entity_type: "opportunity",
            field_key: r.field_key,
            field_type: r.field_type,
            label: r.label,
            section_key: r.section_key,
            sort_order: r.sort_order,
            source: "opportunityFieldRegistry",
            is_visible_in_drawer: r.is_visible_in_drawer,
            is_visible_in_form: r.is_visible_in_form,
            is_visible_in_table: r.is_visible_in_table,
            config: r.config as Record<string, unknown>,
        })),
    ];

    return rows.sort(
        (a, b) =>
            a.entity_type.localeCompare(b.entity_type) ||
            a.field_key.localeCompare(b.field_key) ||
            a.source.localeCompare(b.source)
    );
}

export function validateParityRowOwnership(row: CanonicalParityExpectedRow): string | null {
    return validateFieldDefinitionOwnership(row.entity_type, row.field_key);
}

export function findMissingParityRows(
    expected: CanonicalParityExpectedRow[],
    existing: ExistingFieldDefinitionRow[]
): CanonicalParityExpectedRow[] {
    const existingKeys = new Set(existing.map((r) => parityRowKey(r.entity_type, r.field_key)));
    return expected.filter((row) => !existingKeys.has(parityRowKey(row.entity_type, row.field_key)));
}

/** Duplicate entity_type + field_key rows in field_definitions (should never happen). */
export function findDuplicateFieldDefinitionKeys(existing: ExistingFieldDefinitionRow[]): string[] {
    const seen = new Map<string, number>();
    for (const row of existing) {
        const key = parityRowKey(row.entity_type, row.field_key);
        seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen.entries()]
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
        .sort();
}

export function buildParityInsertPayload(
    orgId: string,
    row: CanonicalParityExpectedRow
): Record<string, unknown> {
    return {
        org_id: orgId,
        entity_type: row.entity_type,
        field_key: row.field_key,
        label: row.label,
        description: null,
        field_type: row.field_type,
        is_system: true,
        is_required: false,
        is_active: true,
        is_visible_in_form: row.is_visible_in_form,
        is_visible_in_drawer: row.is_visible_in_drawer,
        is_visible_in_table: row.is_visible_in_table,
        is_filterable: false,
        is_sortable: false,
        section_key: row.section_key,
        sort_order: row.sort_order,
        placeholder: null,
        help_text: null,
        config: row.config ?? {},
        is_visible_in_public_booking: false,
    };
}

export type ParityDryRunReport = {
    orgId: string;
    expectedCount: number;
    presentCount: number;
    missing: CanonicalParityExpectedRow[];
    duplicates: string[];
    ownershipErrors: string[];
};

export function buildParityDryRunReport(
    orgId: string,
    existing: ExistingFieldDefinitionRow[]
): ParityDryRunReport {
    const expected = buildCanonicalParityExpectedRows();
    const missing = findMissingParityRows(expected, existing);
    const duplicates = findDuplicateFieldDefinitionKeys(existing);
    const ownershipErrors: string[] = [];
    for (const row of expected) {
        const err = validateParityRowOwnership(row);
        if (err) ownershipErrors.push(`${row.entity_type}.${row.field_key}: ${err}`);
    }
    return {
        orgId,
        expectedCount: expected.length,
        presentCount: expected.length - missing.length,
        missing,
        duplicates,
        ownershipErrors,
    };
}

export type ParityApplyResult = {
    orgId: string;
    added: string[];
    skipped: string[];
    failed: Array<{ key: string; error: string }>;
};

/** Idempotent apply — inserts missing rows only; skips existing keys. */
export function planParityApply(
    orgId: string,
    existing: ExistingFieldDefinitionRow[]
): { toInsert: CanonicalParityExpectedRow[]; skipped: string[] } {
    const expected = buildCanonicalParityExpectedRows();
    const missing = findMissingParityRows(expected, existing);
    const existingKeys = new Set(existing.map((r) => parityRowKey(r.entity_type, r.field_key)));
    const skipped = expected
        .filter((row) => existingKeys.has(parityRowKey(row.entity_type, row.field_key)))
        .map((row) => parityRowKey(row.entity_type, row.field_key));
    return { toInsert: missing, skipped };
}

export function formatParityApplyReport(result: ParityApplyResult): string {
    const lines = [
        `\nParity apply result (org=${result.orgId})`,
        `Added: ${result.added.length}`,
        `Skipped (already present): ${result.skipped.length}`,
        `Failed: ${result.failed.length}`,
        "",
    ];
    if (result.added.length) {
        lines.push("Added:");
        for (const k of result.added) lines.push(`  + ${k}`);
        lines.push("");
    }
    if (result.failed.length) {
        lines.push("Failed:");
        for (const f of result.failed) lines.push(`  ! ${f.key}: ${f.error}`);
    }
    return lines.join("\n");
}

export function formatParityDryRunReport(report: ParityDryRunReport): string {
    const lines: string[] = [
        `\nCanonical native-column parity (org=${report.orgId})`,
        `Expected manifest rows: ${report.expectedCount}`,
        `Present in field_definitions: ${report.presentCount}`,
        `Missing: ${report.missing.length}`,
        `Duplicate keys: ${report.duplicates.length}`,
        `Ownership errors: ${report.ownershipErrors.length}`,
        "",
    ];
    if (report.missing.length) {
        lines.push("Missing rows:");
        for (const m of report.missing) {
            lines.push(`  - ${m.entity_type}.${m.field_key} (${m.source})`);
        }
        lines.push("");
    }
    if (report.duplicates.length) {
        lines.push("Duplicate field_definitions keys:");
        for (const d of report.duplicates) lines.push(`  - ${d}`);
        lines.push("");
    }
    if (report.ownershipErrors.length) {
        lines.push("Ownership validation errors:");
        for (const e of report.ownershipErrors) lines.push(`  - ${e}`);
        lines.push("");
    }
    return lines.join("\n");
}
