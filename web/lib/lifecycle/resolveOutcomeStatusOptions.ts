/**
 * Pure status option resolver for Process Builder outcome close / status effects.
 *
 * Configured statuses only — never invent keys, never treat labels as identities,
 * never silently rewrite legacy free-text into a valid status.
 */

export type OutcomeStatusConfiguredRow = {
    status_key: string;
    status_label: string;
    entity_type: string;
    is_active?: boolean;
    /** When known from metadata / catalog — preferred closed-signal. */
    is_closed?: boolean;
    metadata?: Record<string, unknown> | null;
};

export type OutcomeStatusOption = {
    status_key: string;
    status_label: string;
    entity_type: string;
    is_closed: boolean;
};

export type ResolveOutcomeStatusOptionsPurpose = "close_record" | "status_effect";

export type ResolveOutcomeStatusOptionsInput = {
    configuredStatuses: ReadonlyArray<OutcomeStatusConfiguredRow>;
    purpose: ResolveOutcomeStatusOptionsPurpose;
    /** Entity grain the outcome editor is authoring against. */
    entityType: string;
    /** Draft / persisted status_key — may be legacy free-text. */
    selectedStatusKey?: string | null;
};

export type ResolveOutcomeStatusOptionsResult = {
    options: OutcomeStatusOption[];
    selectedStatusKey: string | null;
    selectedValid: boolean;
    /** Present when draft has a key that is not in the valid option set. */
    invalidSelectedStatusKey: string | null;
    available: boolean;
    unavailableReason: string | null;
};

function trimKey(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

function normalizeEntityType(entityType: string): string {
    const t = entityType.trim().toLowerCase();
    if (t === "opportunity" || t === "opportunities" || t === "case" || t === "family") {
        return "opportunities";
    }
    if (
        t === "opportunity_customer_member"
        || t === "opportunity_customer_members"
        || t === "child"
        || t === "enrollment"
        || t === "participation"
    ) {
        return "opportunity_customer_members";
    }
    if (t === "person" || t === "persons") return "persons";
    if (t === "customer" || t === "customers") return "customers";
    return t || "opportunities";
}

/**
 * Closed-semantic detection against an already-configured catalog row.
 * Does not invent status keys — only classifies rows present in config.
 */
export function isConfiguredClosedStatus(row: OutcomeStatusConfiguredRow): boolean {
    if (row.is_closed === true) return true;
    if (row.is_active === false) return false;
    const meta = row.metadata;
    if (meta && typeof meta === "object") {
        if (meta.is_closed === true || meta.closes_record === true || meta.is_terminal === true) {
            return true;
        }
        if (meta.is_closed === false || meta.closes_record === false) return false;
        const category = typeof meta.status_category === "string" ? meta.status_category.trim().toLowerCase() : "";
        if (category === "closed" || category === "terminal") return true;
    }

    const key = row.status_key.trim().toLowerCase();
    const entity = normalizeEntityType(row.entity_type);
    if (entity === "opportunities") {
        return key === "closed";
    }
    if (entity === "opportunity_customer_members") {
        return key === "withdrawn" || key === "not_enrolling";
    }
    if (entity === "persons" || entity === "customers") {
        return key === "inactive" || key === "archived" || key === "closed";
    }
    return false;
}

function toOption(row: OutcomeStatusConfiguredRow): OutcomeStatusOption {
    const status_key = row.status_key.trim();
    const status_label =
        (row.status_label && row.status_label.trim())
        || status_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
        status_key,
        status_label,
        entity_type: normalizeEntityType(row.entity_type),
        is_closed: isConfiguredClosedStatus(row),
    };
}

export function resolveOutcomeStatusOptions(
    input: ResolveOutcomeStatusOptionsInput,
): ResolveOutcomeStatusOptionsResult {
    const entityType = normalizeEntityType(input.entityType);
    const selectedRaw = trimKey(input.selectedStatusKey);

    const scoped = input.configuredStatuses.filter((row) => {
        if (!trimKey(row.status_key)) return false;
        if (row.is_active === false) return false;
        return normalizeEntityType(row.entity_type) === entityType;
    });

    let options = scoped.map(toOption);
    if (input.purpose === "close_record") {
        options = options.filter((opt) => opt.is_closed);
    }

    // Deterministic order: closed first for status_effect, then label.
    options = [...options].sort((a, b) => {
        if (a.is_closed !== b.is_closed) return a.is_closed ? -1 : 1;
        return a.status_label.localeCompare(b.status_label) || a.status_key.localeCompare(b.status_key);
    });

    const selectedInOptions = selectedRaw
        ? options.find((opt) => opt.status_key === selectedRaw) ?? null
        : null;

    const selectedValid = Boolean(selectedInOptions);
    const invalidSelectedStatusKey =
        selectedRaw && !selectedValid ? selectedRaw : null;

    if (!options.length) {
        return {
            options: [],
            selectedStatusKey: null,
            selectedValid: false,
            invalidSelectedStatusKey,
            available: false,
            unavailableReason:
                input.purpose === "close_record"
                    ? "No configured closed statuses are available for this entity."
                    : "No configured statuses are available for this entity.",
        };
    }

    return {
        options,
        selectedStatusKey: selectedInOptions?.status_key ?? null,
        selectedValid,
        invalidSelectedStatusKey,
        available: true,
        unavailableReason: null,
    };
}
