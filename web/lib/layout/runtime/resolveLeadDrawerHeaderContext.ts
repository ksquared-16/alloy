/**
 * Lead drawer command header metadata — primary contact, contact details, child count, location.
 */

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function countLinkedChildren(record: Record<string, unknown>): number {
    for (const key of ["children", "enrollment_children"] as const) {
        const raw = record[key];
        if (Array.isArray(raw) && raw.length > 0) return raw.length;
    }
    return 0;
}

export type LeadDrawerHeaderContext = {
    primaryContactLabel: string | null;
    contactLine: string | null;
    householdLabel: string | null;
};

export function resolveLeadDrawerHeaderContext(record: Record<string, unknown>): LeadDrawerHeaderContext {
    const ident = (record._identity as Record<string, unknown> | null | undefined) ?? null;
    const primaryPerson =
        ident?.primary_person && typeof ident.primary_person === "object"
            ? (ident.primary_person as { label?: unknown })
            : null;

    const primaryContactLabel =
        trimOrNull(record["person.primary_contact_name"]) ?? trimOrNull(primaryPerson?.label);

    const email = trimOrNull(record["person.primary_email"]);
    const phone = trimOrNull(record["person.primary_phone"]);
    const contactLine =
        email && phone ? `${email} · ${phone}`
        : email ?? phone;

    const household =
        ident?.household && typeof ident.household === "object"
            ? (ident.household as { label?: unknown })
            : null;
    const householdLabel = trimOrNull(household?.label) ?? trimOrNull(record._customer_name) ?? trimOrNull(record["customer.name"]);

    return { primaryContactLabel, contactLine, householdLabel };
}

export type LeadDrawerCommandHeaderMeta = {
    /** Primary contact · campus — identity/context only (no stage/status). */
    metaRow: string | null;
    /** Email · phone — optional second row under meta. */
    contactRow: string | null;
};

function normalizeHeaderLabel(value: string | null | undefined): string {
    return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Command-center meta row: primary contact, email, phone, child count, location. */
export function resolveLeadDrawerCommandHeaderMeta(
    record: Record<string, unknown>,
    options?: {
        locationLabel?: string | null;
        /** Drawer title — suppress duplicate household label in meta row. */
        title?: string | null;
        /** Ignored — lifecycle rail + status dropdown own stage/status. */
        statusLabel?: string | null;
        stageLabel?: string | null;
    },
): LeadDrawerCommandHeaderMeta {
    const ctx = resolveLeadDrawerHeaderContext(record);
    const titleNorm = normalizeHeaderLabel(options?.title);
    const householdNorm = normalizeHeaderLabel(ctx.householdLabel);
    const includeHousehold = Boolean(ctx.householdLabel) && householdNorm !== titleNorm;

    const email = trimOrNull(record["person.primary_email"]);
    const phone = trimOrNull(record["person.primary_phone"]);
    const childCount = countLinkedChildren(record);

    const metaParts: string[] = [];
    if (ctx.primaryContactLabel) metaParts.push(ctx.primaryContactLabel);
    if (email) metaParts.push(email);
    if (phone) metaParts.push(phone);
    if (childCount > 0) {
        metaParts.push(childCount === 1 ? "1 child" : `${childCount} children`);
    }
    if (includeHousehold && ctx.householdLabel) metaParts.push(ctx.householdLabel);

    const location = options?.locationLabel?.trim() || null;
    if (location) metaParts.push(location);

    return {
        metaRow: metaParts.length > 0 ? metaParts.join(" · ") : null,
        contactRow: null,
    };
}
