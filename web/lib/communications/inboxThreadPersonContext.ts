const UUID_RE = /^[0-9a-f-]{36}$/i;

export function normalizeInboxRecipientEmail(raw: string | null | undefined): string | null {
    const v = String(raw ?? "").trim().toLowerCase();
    return v.includes("@") ? v : null;
}

export function normalizeInboxRecipientPhoneDigits(raw: string | null | undefined): string | null {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    if (digits.length >= 10) return digits.slice(-10);
    return null;
}

export function personDisplayNameFromRow(row: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
}): string {
    const full = (row.full_name ?? "").trim();
    if (full) return full;
    const composed = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    if (composed) return composed;
    const email = (row.email ?? "").trim();
    if (email) return email;
    const phone = (row.phone ?? "").trim();
    if (phone) return phone;
    return "Person";
}

export function resolveMessageContactPersonId(args: {
    primaryEntityType: string;
    primaryEntityId: string;
    recipientKey: string | null;
    primaryPersonByOpportunity: Map<string, string>;
    primaryPersonByJob: Map<string, string>;
    relatedPersonIdsByOpportunity: Map<string, Set<string>>;
    relatedPersonIdsByJob: Map<string, Set<string>>;
    personIdByEmail: Map<string, string>;
    personIdByPhone: Map<string, string>;
}): string | null {
    const type = args.primaryEntityType.trim().toLowerCase();
    const id = args.primaryEntityId;
    if (type === "persons" && UUID_RE.test(id)) return id;

    const email = normalizeInboxRecipientEmail(args.recipientKey);
    const phone = normalizeInboxRecipientPhoneDigits(args.recipientKey);

    const matchFromRelated = (related: Set<string> | undefined): string | null => {
        if (!related?.size) return null;
        if (email) {
            const byEmail = args.personIdByEmail.get(email);
            if (byEmail && related.has(byEmail)) return byEmail;
        }
        if (phone) {
            const byPhone = args.personIdByPhone.get(phone);
            if (byPhone && related.has(byPhone)) return byPhone;
        }
        return null;
    };

    if (type === "opportunities" && UUID_RE.test(id)) {
        const primary = args.primaryPersonByOpportunity.get(id);
        if (primary) return primary;
        const related = args.relatedPersonIdsByOpportunity.get(id);
        const matched = matchFromRelated(related);
        if (matched) return matched;
        if (email && args.personIdByEmail.has(email)) return args.personIdByEmail.get(email)!;
        if (phone && args.personIdByPhone.has(phone)) return args.personIdByPhone.get(phone)!;
        return null;
    }

    if (type === "jobs" && UUID_RE.test(id)) {
        const primary = args.primaryPersonByJob.get(id);
        if (primary) return primary;
        const related = args.relatedPersonIdsByJob.get(id);
        return matchFromRelated(related);
    }

    return null;
}

export function joinInboxRelatedNames(names: string[], limit = 4): string | null {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) return null;
    const shown = unique.slice(0, limit);
    const suffix = unique.length > limit ? ` +${unique.length - limit} more` : "";
    return `${shown.join(", ")}${suffix}`;
}
