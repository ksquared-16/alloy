/**
 * Map inquiry/enrollment child rows → layout doc repeater shape.
 *
 * Default lead layouts use `source: "children"` with child.* column refKeys;
 * VM paint records carry enrollment_children with inquiry_child.* keys.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { isOpaqueIdValue, type ProofRuntimeRecord } from "./proofRecordContext";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function formatDobAge(dob: string | null, age: string | null): string {
    const parts = [dob, age ? (age.includes("y") ? age : `${age}y`) : null].filter(Boolean);
    return parts.join(" · ");
}

/** Normalize one inquiry child row for layout runtime repeaters (drawer + queue). */
export function mapInquiryChildToLayoutRuntimeRow(row: ReturnType<typeof mapRawInquiryChildrenToDrawerRows>[number]): ProofRuntimeRecord {
    const name =
        pickDisplay(row.display_name, [row.first_name, row.last_name].filter(Boolean).join(" ")) ?? "—";
    const program = pickDisplay(row.program_room_cohort_label, row.desired_program_label, row.desired_program_type);
    const schedule = pickDisplay(row.desired_schedule_label, row.desired_schedule_type);
    const location = pickDisplay(row.location_label);
    const status = pickDisplay(row.outcome_status_label, row.outcome_status_key);
    const dobAge = formatDobAge(row.dob, row.age);

    return {
        id: pickDisplay(row.id) ?? "row",
        "child.name": name,
        "child.dob_age": dobAge,
        "child.desired_start_date": row.desired_start_date ?? "",
        "child.location": location ?? "",
        "child.program": program ?? "",
        "child.room": pickDisplay(row.program_room_cohort_label) ?? "",
        "child.schedule": schedule ?? "",
        "child.status": status ?? "",
        "child.age_band": pickDisplay(row.age) ?? "",
        "inquiry_child.desired_start_date": row.desired_start_date ?? "",
        "inquiry_child.location_id": location ?? "",
        "inquiry_child.program_room_cohort_key": program ?? "",
        "inquiry_child.outcome_status_key": status ?? "",
    };
}

/** Map raw `_inquiry_children` VM payload to layout-runtime repeater rows. */
export function mapVmInquiryChildrenToLayoutRuntimeRows(raw: unknown): ProofRuntimeRecord[] {
    if (!Array.isArray(raw)) return [];
    return mapRawInquiryChildrenToDrawerRows(raw).map(mapInquiryChildToLayoutRuntimeRow);
}
