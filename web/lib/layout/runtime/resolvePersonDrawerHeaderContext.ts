/**
 * Person drawer command header context — relationship-focused meta lines.
 */

import { formatLayoutRuntimeDrawerHeaderPhone } from "@/lib/layout/runtime/formatLayoutRuntimeDrawerHeaderPhone";

function pickLine(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

export type PersonDrawerCommandHeaderMeta = {
    metaRow: string | null;
    contactRow: string | null;
    householdName: string | null;
    relationshipLabel: string | null;
};

export function resolvePersonDrawerCommandHeaderMeta(
    record: Record<string, unknown>,
): PersonDrawerCommandHeaderMeta {
    const relationship = pickLine(record["person.relationship"], record.relationship_type, record.role_type);
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

    const metaParts = [relationship].filter(Boolean);
    const phone = formatLayoutRuntimeDrawerHeaderPhone(
        pickLine(record["person.primary_phone"], record.phone, record._primary_phone),
    );
    const email = pickLine(record["person.primary_email"], record.email, record._primary_email);
    const contactParts = [phone, email].filter(Boolean);

    return {
        metaRow: metaParts.length > 0 ? metaParts.join(" · ") : null,
        contactRow: contactParts.length > 0 ? contactParts.join(" · ") : null,
        householdName: household,
        relationshipLabel: relationship,
    };
}
