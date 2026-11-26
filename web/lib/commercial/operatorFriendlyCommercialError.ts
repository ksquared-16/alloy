/**
 * Sanitize commercial configuration API / DB failures for operators.
 * Prefer domain-specific mappers (e.g. program offerings) when available.
 */

export function operatorFriendlyCommercialError(
    raw: string | null | undefined,
    fallback = "Could not save. Check the form and try again.",
): string {
    const message = (raw ?? "").trim();
    if (!message) return fallback;

    if (/duplicate key|unique constraint|23505/i.test(message)) {
        if (/commercial_products/i.test(message)) {
            return "A catalog item with this name already exists for this scope.";
        }
        if (/commercial_policies/i.test(message)) {
            return "A matching policy already exists for this Applied To scope.";
        }
        if (/commercial_categories/i.test(message)) {
            return "A category with this name already exists.";
        }
        if (/gl_accounts|org_code/i.test(message)) {
            return "A GL code with this account code already exists.";
        }
        if (/program_offerings/i.test(message)) {
            return "A matching tuition plan already exists for this program and care format.";
        }
        return "A matching record already exists. Change the name or scope and try again.";
    }

    if (/violates check constraint|check constraint/i.test(message)) {
        return "One or more values are not allowed for this configuration. Review the form and try again.";
    }

    if (/foreign key|violates foreign key/i.test(message)) {
        return "A related record is missing or no longer available. Refresh and try again.";
    }

    if (/violates not-null|null value in column/i.test(message)) {
        return "A required field is missing. Complete the form and try again.";
    }

    // Strip obvious Postgres wrappers if something slips through.
    if (/^duplicate key value/i.test(message) || /violates .+ constraint/i.test(message)) {
        return fallback;
    }

    return message;
}
