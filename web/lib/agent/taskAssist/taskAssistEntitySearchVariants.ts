import { sanitizeCrmSearchToken } from "@/lib/admin/forms/crmEntitySearchShared";

const FAMILY_HOUSEHOLD_SUFFIX_RE = /\s+(family|household)\s*$/i;

/**
 * Deterministic search tokens from an entity phrase (e.g. "Mitchell family").
 * Preserves original phrase and adds surname / household cross-variants.
 */
export function buildTaskAssistEntitySearchVariants(rawPhrase: string): string[] {
    const base = sanitizeCrmSearchToken(rawPhrase);
    if (base.length < 2) return base.length ? [base] : [];

    const out: string[] = [];
    const seen = new Set<string>();

    const add = (v: string) => {
        const t = sanitizeCrmSearchToken(v);
        if (t.length < 2) return;
        const key = t.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(t);
    };

    add(base);

    const withoutSuffix = base.replace(FAMILY_HOUSEHOLD_SUFFIX_RE, "").trim();
    if (withoutSuffix.length >= 2) add(withoutSuffix);

    if (/\bfamily\b/i.test(base)) {
        add(base.replace(/\bfamily\b/i, "household"));
    }
    if (/\bhousehold\b/i.test(base)) {
        add(base.replace(/\bhousehold\b/i, "family"));
    }

    const parts = withoutSuffix.split(/\s+/).filter(Boolean);
    if (parts.length >= 1) {
        add(parts[0]!);
    }
    if (parts.length >= 2) {
        add(parts[parts.length - 1]!);
    }

    return out.slice(0, 6);
}

/** Primary token for operator-facing no-match copy. */
export function primaryTaskAssistEntitySearchToken(rawPhrase: string): string {
    const variants = buildTaskAssistEntitySearchVariants(rawPhrase);
    if (variants.length === 0) return sanitizeCrmSearchToken(rawPhrase);
    const withoutSuffix = variants.find((v) => !FAMILY_HOUSEHOLD_SUFFIX_RE.test(v));
    return withoutSuffix ?? variants[0]!;
}

export function formatTaskAssistEntitySearchNoMatchMessage(displayToken: string): string {
    const t = displayToken.trim() || "that name";
    return `I couldn't find a matching family or opportunity for '${t}'. Try a different name or open the record first.`;
}
