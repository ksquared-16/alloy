/**
 * Map inquiry/enrollment child rows → layout doc repeater shape.
 *
 * Default lead layouts use `source: "children"` with child.* column refKeys;
 * VM paint records carry enrollment_children with inquiry_child.* keys.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { normalizeInquiryChildBlockToLayoutRuntimeRow, normalizeLayoutRuntimeChildRow } from "./normalizeLayoutRuntimeChildRow";
import { mergeCanonicalOpportunityLayoutRuntimeChildRows } from "./mergeCanonicalOpportunityLayoutRuntimeChildRows";
import type { ProofRuntimeRecord } from "./proofRecordContext";

/** Normalize one inquiry child row for layout runtime repeaters (drawer + queue). */
export function mapInquiryChildToLayoutRuntimeRow(
    row: ReturnType<typeof mapRawInquiryChildrenToDrawerRows>[number],
    index: number,
): ProofRuntimeRecord {
    return normalizeInquiryChildBlockToLayoutRuntimeRow(row, index);
}

/** Map raw `_inquiry_children` VM payload to layout-runtime repeater rows. */
export function mapVmInquiryChildrenToLayoutRuntimeRows(raw: unknown): ProofRuntimeRecord[] {
    if (!Array.isArray(raw)) return [];
    return mapRawInquiryChildrenToDrawerRows(raw).map((row, index) =>
        mapInquiryChildToLayoutRuntimeRow(row, index),
    );
}

export function mapPersonHouseholdChildToLayoutRuntimeRow(row: Record<string, unknown>, index: number): ProofRuntimeRecord {
    const normalized = normalizeLayoutRuntimeChildRow(row, index);
    if (normalized) return normalized;
    return {
        id: `household-child-${index}`,
        "child.id": "",
        "child.name": "—",
        "child.dob_age": "",
        "child.desired_start_date": "",
        "child.location": "",
        "child.program": "",
        "child.room": "",
        "child.schedule": "",
        "child.status": "",
        "child.age_band": "",
        "child.age": "",
        "inquiry_child.desired_start_date": "",
        "inquiry_child.location_id": "",
        "inquiry_child.program_room_cohort_key": "",
        "inquiry_child.outcome_status_key": "",
    };
}

/** Resolve opportunity drawer child repeater rows — canonical household + inquiry merge. */
export function resolveOpportunityLayoutRuntimeChildrenRows(vmRecord: Record<string, unknown>): ProofRuntimeRecord[] {
    const metadataRaw = vmRecord.metadata;
    const metadata =
        metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
            ? (metadataRaw as Record<string, unknown>)
            : null;

    const merged = mergeCanonicalOpportunityLayoutRuntimeChildRows({
        inquiryChildren: vmRecord._inquiry_children,
        householdChildren: vmRecord._household_children ?? vmRecord.household_children,
        metadata,
    });
    if (merged.length > 0) return merged;

    for (const source of [vmRecord._children, vmRecord.children]) {
        if (!Array.isArray(source) || source.length === 0) continue;
        return source.map((row, index) => ({
            ...mapPersonHouseholdChildToLayoutRuntimeRow(row as Record<string, unknown>, index),
            _layout_runtime_child_source: "household_only",
        }));
    }

    return [];
}
