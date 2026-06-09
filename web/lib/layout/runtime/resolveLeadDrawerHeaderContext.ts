function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
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
    const householdLabel = trimOrNull(household?.label) ?? trimOrNull(record._customer_name);

    return { primaryContactLabel, contactLine, householdLabel };
}

export type LeadDrawerCommandHeaderMeta = {
    /** Primary contact · household · campus — identity/context only (no stage/status). */
    metaRow: string | null;
    /** Email · phone — optional second row under meta. */
    contactRow: string | null;
};

/** Command-center meta row: primary contact · household · campus. Stage/status live in lifecycle + status control. */
export function resolveLeadDrawerCommandHeaderMeta(
    record: Record<string, unknown>,
    options?: {
        locationLabel?: string | null;
        /** Ignored — lifecycle rail + status dropdown own stage/status. */
        statusLabel?: string | null;
        stageLabel?: string | null;
    },
): LeadDrawerCommandHeaderMeta {
    const ctx = resolveLeadDrawerHeaderContext(record);
    const metaParts = [ctx.primaryContactLabel, ctx.householdLabel, options?.locationLabel?.trim() || null].filter(
        Boolean,
    );
    return {
        metaRow: metaParts.length > 0 ? metaParts.join(" · ") : null,
        contactRow: ctx.contactLine,
    };
}
