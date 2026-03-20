/**
 * Human-readable labels for vendor dropdowns and job/schedule display.
 * Value saved to DB remains vendors.id; labels are presentation-only.
 */

export type VendorLabelInput = {
    id: string;
    name?: string | null;
    company_name?: string | null;
    email?: string | null;
    phone?: string | null;
    primary_person?: { first_name?: string | null; last_name?: string | null } | null;
};

export type VendorRowForLabel = {
    id: string;
    name?: string | null;
    company_name?: string | null;
    email?: string | null;
    phone?: string | null;
    primary_person_id?: string | null;
};

/** Admin API + client: each option is id + stable fields + computed label. */
export type AdminVendorSelectOption = {
    id: string;
    name: string | null;
    label: string;
};

export function formatVendorOptionLabel(v: VendorLabelInput): string {
    const company = v.company_name?.trim();
    if (company) return company;
    const person = [v.primary_person?.first_name, v.primary_person?.last_name].filter(Boolean).join(" ").trim();
    if (person) return person;
    const name = v.name?.trim();
    if (name) return name;
    const email = v.email?.trim();
    if (email) return email;
    const phone = v.phone?.trim();
    if (phone) return phone;
    return `${v.id.slice(0, 8)}…`;
}

/** Map person id → person row for primary_person_id on vendors. */
export function buildVendorIdToLabelMap(
    vendorRows: VendorRowForLabel[],
    persons: { id: string; first_name?: string | null; last_name?: string | null }[]
): Map<string, string> {
    const pmap = new Map(persons.map((p) => [p.id, p]));
    const m = new Map<string, string>();
    for (const r of vendorRows) {
        const person = r.primary_person_id ? pmap.get(r.primary_person_id) ?? null : null;
        m.set(
            r.id,
            formatVendorOptionLabel({
                id: r.id,
                name: r.name,
                company_name: r.company_name,
                email: r.email,
                phone: r.phone,
                primary_person: person ?? null,
            })
        );
    }
    return m;
}

export function vendorsToSelectOptions(
    vendorRows: VendorRowForLabel[],
    personById: Map<string, { first_name?: string | null; last_name?: string | null }>
): AdminVendorSelectOption[] {
    return vendorRows.map((r) => {
        const person = r.primary_person_id ? personById.get(r.primary_person_id) ?? null : null;
        const label = formatVendorOptionLabel({
            id: r.id,
            name: r.name,
            company_name: r.company_name,
            email: r.email,
            phone: r.phone,
            primary_person: person,
        });
        return { id: r.id, name: r.name ?? null, label };
    });
}

/** `{ id, name }` stubs used by entity payloads (`_assigned_vendor`, `_job_assigned_vendor`, etc.). */
export function vendorRowToDisplayStub(
    row: VendorRowForLabel,
    person: { first_name?: string | null; last_name?: string | null } | null
): { id: string; name: string } {
    return {
        id: row.id,
        name: formatVendorOptionLabel({
            id: row.id,
            name: row.name,
            company_name: row.company_name,
            email: row.email,
            phone: row.phone,
            primary_person: person,
        }),
    };
}
