/** Write one namespaced repeater refKey onto a row object (flat keys). */

export function writeLayoutRuntimeRepeaterFieldRaw(
    row: Record<string, unknown>,
    refKey: string,
    value: string,
): Record<string, unknown> {
    const next = { ...row, [refKey]: value };
    const parts = refKey.split(".");
    if (parts.length === 2) {
        const [ns, field] = parts;
        if (ns === "child" || ns === "inquiry_child") {
            const nested = { ...(typeof row[ns] === "object" && row[ns] ? (row[ns] as Record<string, unknown>) : {}) };
            nested[field] = value;
            next[ns] = nested;
        }
        if (field === "first_name" || field === "last_name") {
            next[field] = value;
        }
        if (field === "date_of_birth") {
            next.dob = value;
        }
        if (ns === "inquiry_child" && field === "location_id") {
            next.location_id = value;
        }
        if (ns === "inquiry_child" && field === "desired_program_type") {
            next.desired_program_type = value;
        }
        if (ns === "inquiry_child" && field === "program_room_cohort_key") {
            next.program_room_cohort_key = value;
        }
        if (ns === "inquiry_child" && field === "outcome_status_key") {
            next.outcome_status_key = value;
        }
    }
    return next;
}
