/**
 * Recipient greeting for outbound drafts — first name preferred, household label fallback.
 */

const GENERIC_GREETING_TOKENS = new Set([
    "family",
    "inquiry",
    "household",
    "customer",
    "contact",
    "parent",
    "guardian",
]);

function firstTokenLooksLikeFirstName(token: string | null | undefined): string | null {
    const t = token?.trim();
    if (!t || t.length < 2) return null;
    if (!/^[A-Za-z][A-Za-z'.-]*$/.test(t)) return null;
    if (GENERIC_GREETING_TOKENS.has(t.toLowerCase())) return null;
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function firstNameFromLabel(label: string | null | undefined): string | null {
    const raw = label?.trim();
    if (!raw) return null;
    const beforeParen = raw.split("(")[0]?.trim() ?? "";
    const first = beforeParen.split(/\s+/)[0];
    return firstTokenLooksLikeFirstName(first);
}

function householdGreetingFromLabel(label: string | null | undefined): string | null {
    const raw = label?.trim();
    if (!raw) return null;
    if (/\bfamily\b/i.test(raw)) return raw;
    const householdMatch = /^(.+?)\s+household$/i.exec(raw);
    if (householdMatch?.[1]?.trim()) {
        const base = householdMatch[1].trim();
        return `${base} family`;
    }
    if (/\s/.test(raw) && !GENERIC_GREETING_TOKENS.has(raw.toLowerCase())) {
        return raw;
    }
    return null;
}

export type ResolvedRecipientGreeting = {
    firstName: string | null;
    householdGreeting: string | null;
};

export function resolveRecipientGreetingFromOverview(
    overviewData: Record<string, unknown> | null | undefined
): ResolvedRecipientGreeting {
    if (!overviewData || typeof overviewData !== "object") {
        return { firstName: null, householdGreeting: null };
    }

    const ident = (overviewData._identity as Record<string, unknown> | null) ?? null;
    const primaryPerson = ident?.primary_person as { label?: unknown } | null;
    const primaryContact = ident?.primary_contact as { label?: unknown } | null;
    const household = ident?.household as { label?: unknown } | null;

    const fromPerson =
        firstNameFromLabel(
            typeof primaryContact?.label === "string" ? primaryContact.label : null
        ) ??
        firstNameFromLabel(
            typeof primaryPerson?.label === "string" ? primaryPerson.label : null
        ) ??
        firstNameFromLabel(
            typeof overviewData._primary_contact_name === "string"
                ? overviewData._primary_contact_name
                : typeof overviewData._primary_person_name === "string"
                  ? overviewData._primary_person_name
                  : null
        );

    if (fromPerson) {
        return { firstName: fromPerson, householdGreeting: null };
    }

    const rec = overviewData._operational_recommendation as { primary_display_name?: unknown } | null;
    const fromRec = firstNameFromLabel(
        typeof rec?.primary_display_name === "string" ? rec.primary_display_name : null
    );
    if (fromRec) {
        return { firstName: fromRec, householdGreeting: null };
    }

    const householdLabel =
        typeof household?.label === "string"
            ? household.label
            : typeof overviewData._customer_name === "string"
              ? overviewData._customer_name
              : typeof overviewData.name === "string"
                ? overviewData.name
                : null;

    const householdGreeting = householdGreetingFromLabel(householdLabel);
    if (householdGreeting && !/^family$/i.test(householdGreeting.trim())) {
        return { firstName: null, householdGreeting };
    }

    const fromName = firstNameFromLabel(
        typeof overviewData.name === "string" ? overviewData.name : null
    );
    if (fromName) {
        return { firstName: fromName, householdGreeting: null };
    }

    return { firstName: null, householdGreeting: null };
}

export function formatRecipientGreetingLine(resolved: ResolvedRecipientGreeting): string {
    if (resolved.firstName) return `Hi ${resolved.firstName},`;
    if (resolved.householdGreeting) return `Hi ${resolved.householdGreeting},`;
    return "Hello,";
}
