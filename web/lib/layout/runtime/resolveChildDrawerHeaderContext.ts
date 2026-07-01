/**
 * Child drawer command header context — enrollment/care meta lines.
 */

import { formatLayoutRuntimeOperatorDate } from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";

function pickLine(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

export type ChildDrawerCommandHeaderMeta = {
    ageDobRow: string | null;
    householdName: string | null;
    programRow: string | null;
};

export function resolveChildDrawerCommandHeaderMeta(
    record: Record<string, unknown>,
): ChildDrawerCommandHeaderMeta {
    const dobRaw = pickLine(record["child.date_of_birth"], record.date_of_birth);
    const dobFormatted = dobRaw ? formatLayoutRuntimeOperatorDate(dobRaw) || dobRaw : null;
    const age = pickLine(record["child.age_band"], record.age_band, record.age);
    const ageDobParts = [age, dobFormatted ? `DOB ${dobFormatted}` : null].filter(Boolean);

    const household = pickLine(
        record["customer.household_name"],
        record._household_name,
        record.household_name,
        (record._household_context as { customer_name?: string | null }[] | undefined)?.map(
            (row) => row.customer_name,
        ),
        (record._relations as Record<string, unknown> | undefined)?.household_customer &&
            typeof (record._relations as Record<string, unknown>).household_customer === "object"
            ? ((record._relations as Record<string, unknown>).household_customer as { fields?: { household_name?: string } })
                  .fields?.household_name
            : null,
    );

    const program = pickLine(
        record["inquiry_child.program"],
        record["child.program"],
        record["inquiry_child.desired_program_type"],
        record.program_label,
    );
    const classroom = pickLine(
        record["inquiry_child.program_room_cohort_key"],
        record.program_room_cohort_label,
        record.room_label,
    );
    const programParts = [program, classroom].filter(Boolean);

    return {
        ageDobRow: ageDobParts.length > 0 ? ageDobParts.join(" · ") : null,
        householdName: household,
        programRow: programParts.length > 0 ? programParts.join(" · ") : null,
    };
}
