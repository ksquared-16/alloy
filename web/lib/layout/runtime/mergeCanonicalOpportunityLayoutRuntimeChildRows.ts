/**
 * Canonical opportunity child/enrollment row merge for drawer + queue layout runtime.
 *
 * Doctrine:
 * - Household / customer_member children are the canonical population.
 * - Inquiry-linked children overlay enrollment context onto matching household rows.
 * - Inquiry-only rows (manual inquiry children without household match) append after household.
 * - Household-only rows render with empty inquiry_child.* enrollment context.
 */

import { pickEntityId, type ProofRuntimeRecord } from "./proofRecordContext";
import {
    mapPersonHouseholdChildToLayoutRuntimeRow,
    mapVmInquiryChildrenToLayoutRuntimeRows,
} from "./mapLayoutRuntimeChildrenRows";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

function normalizeNameKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Stable match key — person id, member id, then normalized display name. */
export function layoutRuntimeChildRowMatchKey(row: Record<string, unknown>): string | null {
    const personId = pickEntityId(row.person_id, row["child.id"]);
    if (personId) return `person:${personId}`;

    const memberId = pickEntityId(row.customer_member_id, row["child.customer_member_id"], row.ocm_id);
    if (memberId) return `member:${memberId}`;

    const name = pickDisplay(row["child.name"], row["child.display_name"], row.display_name);
    if (name && name !== "—") return `name:${normalizeNameKey(name)}`;

    return null;
}

function nameMatchKey(row: Record<string, unknown>): string | null {
    const name = pickDisplay(row["child.name"], row["child.display_name"], row.display_name);
    if (!name || name === "—") return null;
    return `name:${normalizeNameKey(name)}`;
}

function mapHouseholdCollection(raw: unknown): ProofRuntimeRecord[] {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw.map((row, index) =>
        mapPersonHouseholdChildToLayoutRuntimeRow(row as Record<string, unknown>, index),
    );
}

function indexInquiryRows(inquiryRows: ProofRuntimeRecord[]): Map<string, ProofRuntimeRecord> {
    const inquiryByKey = new Map<string, ProofRuntimeRecord>();
    for (const row of inquiryRows) {
        const key = layoutRuntimeChildRowMatchKey(row);
        if (key && !inquiryByKey.has(key)) inquiryByKey.set(key, row);
        const nameKey = nameMatchKey(row);
        if (nameKey && !inquiryByKey.has(nameKey)) inquiryByKey.set(nameKey, row);
    }
    return inquiryByKey;
}

function findMatchingInquiryRow(
    household: ProofRuntimeRecord,
    inquiryByKey: Map<string, ProofRuntimeRecord>,
): ProofRuntimeRecord | undefined {
    const key = layoutRuntimeChildRowMatchKey(household);
    if (key && inquiryByKey.has(key)) return inquiryByKey.get(key);
    const nameKey = nameMatchKey(household);
    if (nameKey && inquiryByKey.has(nameKey)) return inquiryByKey.get(nameKey);
    return undefined;
}

function inquiryRowWasConsumed(
    inquiry: ProofRuntimeRecord,
    inquiryByKey: Map<string, ProofRuntimeRecord>,
    consumedKeys: Set<string>,
): boolean {
    const key = layoutRuntimeChildRowMatchKey(inquiry);
    if (key && consumedKeys.has(key)) return true;
    const nameKey = nameMatchKey(inquiry);
    if (nameKey && consumedKeys.has(nameKey)) return true;
    for (const [mapKey, mappedRow] of inquiryByKey.entries()) {
        if (mappedRow === inquiry && consumedKeys.has(mapKey)) return true;
    }
    return false;
}

function mergeMatchedChildRows(
    household: ProofRuntimeRecord,
    inquiry: ProofRuntimeRecord,
): ProofRuntimeRecord {
    return {
        ...household,
        ...inquiry,
        person_id: pickEntityId(inquiry.person_id, household.person_id) ?? "",
        customer_member_id: pickEntityId(inquiry.customer_member_id, household.customer_member_id) ?? "",
        ocm_id: pickEntityId(inquiry.ocm_id, household.ocm_id) ?? "",
        "child.id": pickEntityId(inquiry["child.id"], household["child.id"]) ?? "",
        "child.customer_member_id":
            pickEntityId(inquiry["child.customer_member_id"], household["child.customer_member_id"]) ?? "",
        "child.name": pickDisplay(inquiry["child.name"], household["child.name"]) ?? household["child.name"],
        "child.display_name":
            pickDisplay(inquiry["child.display_name"], household["child.display_name"]) ?? household["child.display_name"],
        "child.first_name":
            pickDisplay(inquiry["child.first_name"], household["child.first_name"]) ?? household["child.first_name"],
        "child.last_name":
            pickDisplay(inquiry["child.last_name"], household["child.last_name"]) ?? household["child.last_name"],
        "child.date_of_birth":
            pickDisplay(inquiry["child.date_of_birth"], household["child.date_of_birth"]) ?? household["child.date_of_birth"],
        _layout_runtime_child_source: "household_with_enrollment",
    };
}

export type CanonicalOpportunityChildMergeInput = {
    inquiryChildren?: unknown;
    householdChildren?: unknown;
    metadata?: Record<string, unknown> | null;
};

/**
 * Merge household + inquiry child sources into one canonical repeater row list.
 * Shared by drawer VM mapping and queue preview record binding.
 */
export function mergeCanonicalOpportunityLayoutRuntimeChildRows(
    input: CanonicalOpportunityChildMergeInput,
): ProofRuntimeRecord[] {
    const inquiryRaw: unknown[] = [];
    if (Array.isArray(input.inquiryChildren)) inquiryRaw.push(...input.inquiryChildren);
    if (input.metadata && Array.isArray(input.metadata.inquiry_children)) {
        inquiryRaw.push(...input.metadata.inquiry_children);
    }

    const inquiryRows = mapVmInquiryChildrenToLayoutRuntimeRows(inquiryRaw);
    const householdRows = mapHouseholdCollection(input.householdChildren);

    if (householdRows.length === 0) {
        return inquiryRows.map((row) => ({
            ...row,
            _layout_runtime_child_source: row._layout_runtime_child_source ?? "inquiry_only",
        }));
    }
    if (inquiryRows.length === 0) {
        return householdRows.map((row) => ({
            ...row,
            _layout_runtime_child_source: "household_only",
        }));
    }

    const inquiryByKey = indexInquiryRows(inquiryRows);
    const merged: ProofRuntimeRecord[] = [];
    const consumedInquiryKeys = new Set<string>();

    for (const household of householdRows) {
        const inquiryMatch = findMatchingInquiryRow(household, inquiryByKey);
        if (inquiryMatch) {
            merged.push(mergeMatchedChildRows(household, inquiryMatch));
            const key = layoutRuntimeChildRowMatchKey(household);
            const nameKey = nameMatchKey(household);
            if (key) consumedInquiryKeys.add(key);
            if (nameKey) consumedInquiryKeys.add(nameKey);
            const inquiryKey = layoutRuntimeChildRowMatchKey(inquiryMatch);
            const inquiryNameKey = nameMatchKey(inquiryMatch);
            if (inquiryKey) consumedInquiryKeys.add(inquiryKey);
            if (inquiryNameKey) consumedInquiryKeys.add(inquiryNameKey);
        } else {
            merged.push({
                ...household,
                _layout_runtime_child_source: "household_only",
            });
        }
    }

    for (const inquiry of inquiryRows) {
        if (inquiryRowWasConsumed(inquiry, inquiryByKey, consumedInquiryKeys)) continue;
        merged.push({
            ...inquiry,
            _layout_runtime_child_source: "inquiry_only",
        });
    }

    return merged;
}
