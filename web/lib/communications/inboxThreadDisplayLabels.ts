/** Strip generic inquiry boilerplate from inbox-facing labels (never show as primary title). */
export function inboxLabelIsGenericBoilerplate(label: string | null | undefined): boolean {
    const raw = String(label ?? "").trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (lower === "inquiry" || lower === "family inquiry" || lower === "opportunity") return true;
    if (/^family\s+inquir/i.test(raw)) return true;
    if (/^family\s+inquiry\b/i.test(raw)) return true;
    return false;
}

/** Returns a human-facing label or null when the value is generic/internal boilerplate. */
export function sanitizeInboxEntityLabel(label: string | null | undefined): string | null {
    const raw = String(label ?? "").trim();
    if (!raw) return null;
    if (!inboxLabelIsGenericBoilerplate(raw)) return raw;

    const segments = raw.split(/\s[-–—/|·]\s/);
    for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i]?.trim();
        if (segment && !inboxLabelIsGenericBoilerplate(segment)) return segment;
    }
    return null;
}

/** True when a string should never appear in Inbox UI copy. */
export function inboxDisplayTextAllowed(label: string | null | undefined): boolean {
    const raw = String(label ?? "").trim();
    if (!raw) return false;
    return !inboxLabelIsGenericBoilerplate(raw);
}
