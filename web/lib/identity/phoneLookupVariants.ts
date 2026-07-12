/**
 * Deterministic phone lookup variants for matching legacy non-E.164 rows.
 * Accepts E.164, 10-digit, 11-digit, or formatted input; always returns a stable ordered set.
 */

import { normalizePhone, phoneDigitsNanp } from "./normalizePhone";

/**
 * Exact-match variants for `persons.phone` / legacy `contacts.phone` equality lookups.
 * Includes the canonical E.164 form plus common legacy stored shapes.
 */
export function phoneLookupVariants(rawOrCanonical: string | null | undefined): string[] {
    if (rawOrCanonical === null || rawOrCanonical === undefined) return [];
    const input = String(rawOrCanonical).trim();
    if (!input) return [];

    const digits10 = phoneDigitsNanp(input);
    const e164 = normalizePhone(input);
    const out: string[] = [];

    const add = (v: string | null | undefined) => {
        const s = v != null ? String(v).trim() : "";
        if (s && !out.includes(s)) out.push(s);
    };

    add(e164);
    if (digits10.length === 10) {
        const c = digits10;
        add(c);
        add(`+1${c}`);
        add(`1${c}`);
        add(`(${c.slice(0, 3)}) ${c.slice(3, 6)}-${c.slice(6)}`);
        add(`${c.slice(0, 3)}-${c.slice(3, 6)}-${c.slice(6)}`);
        add(`${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`);
    } else if (digits10.length > 0) {
        add(digits10);
    }

    return out;
}
