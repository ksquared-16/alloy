/**
 * Compatibility adapters — preserve legacy call-site signatures and outputs
 * while routing through canonical `lib/identity` primitives where possible.
 *
 * B1a only. Matching / candidate generation is B1b.
 */

import { normalizeDob } from "./normalizeDob";
import { normalizeEmail } from "./normalizeEmail";
import { normalizeName } from "./normalizeName";
import { phoneDigitsNanp } from "./normalizePhone";
import { phoneLookupVariants as canonicalPhoneLookupVariants } from "./phoneLookupVariants";

/** Intake `normalizeEmail(raw: string): string` — never null (empty → ""). */
export function normalizeEmailAsIntakeString(raw: string): string {
    return normalizeEmail(raw) ?? "";
}

/** Forms/intake `normalizeIntakeEmail` — empty/nullish → null. */
export function normalizeIntakeEmailCompat(email: string | null | undefined): string | null {
    return normalizeEmail(email);
}

/**
 * Intake `normalizePhoneDigits` — digits-only; strips leading US `1` when 11 digits.
 * Preserves legacy empty→`""` (not null) for non-digit input.
 */
export function normalizePhoneDigitsCompat(raw: string): string {
    return phoneDigitsNanp(raw);
}

/** Forms/intake `normalizeIntakePhone` — empty → null; else digits-10 (legacy storage form). */
export function normalizeIntakePhoneCompat(phone: string | null | undefined): string | null {
    if (typeof phone !== "string") return null;
    const digits = phoneDigitsNanp(phone);
    return digits.length ? digits : null;
}

/**
 * Forms/intake `phoneLookupVariants(canonicalDigits)` — same ordered set as pre-B1a
 * for a 10-digit canonical input. Delegates to the library variant builder.
 */
export function phoneLookupVariantsCompat(canonicalDigits: string): string[] {
    if (!canonicalDigits.length) return [];
    const all = canonicalPhoneLookupVariants(canonicalDigits);
    // Legacy intake order for 10-digit input: digits first, then +1, 1, formatted…
    // Canonical builder puts E.164 first. Re-order to match legacy when input is 10 digits.
    if (/^\d{10}$/.test(canonicalDigits)) {
        const c = canonicalDigits;
        const legacyOrder = [
            c,
            `+1${c}`,
            `1${c}`,
            `(${c.slice(0, 3)}) ${c.slice(3, 6)}-${c.slice(6)}`,
            `${c.slice(0, 3)}-${c.slice(3, 6)}-${c.slice(6)}`,
            `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`,
        ];
        const out: string[] = [];
        for (const v of legacyOrder) {
            if (all.includes(v) && !out.includes(v)) out.push(v);
        }
        for (const v of all) {
            if (!out.includes(v)) out.push(v);
        }
        return out;
    }
    return all;
}

/**
 * Name-part normalizer used by intake matching / dedup.
 * Legacy returns `""` for nullish/empty (not null).
 */
export function normalizeNamePartCompat(value: string | null | undefined): string {
    return normalizeName(value) ?? "";
}

/** Intake `parseFlexibleDate` / DOB — ISO or null. */
export function normalizeDobCompat(raw: string | null | undefined): string | null {
    return normalizeDob(raw);
}

/**
 * `findOrCreatePersonInOrg` email norm — same as canonical email.
 */
export function normalizeEmailForFindOrCreate(email: string | null | undefined): string | null {
    return normalizeEmail(email);
}

/**
 * `findOrCreatePersonInOrg` phone norm — **legacy trim-only** (not E.164, not digits).
 * Preserved byte-identical for B1a; callers must not assume canonical storage yet.
 */
export function normalizePhoneForFindOrCreate(phone: string | null | undefined): string | null {
    if (phone == null) return null;
    const trimmed = String(phone).trim();
    return trimmed || null;
}
