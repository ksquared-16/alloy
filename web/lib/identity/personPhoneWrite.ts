/**
 * E2E-16 — THE PHONE A PERSON IS STORED WITH.
 *
 * `persons.phone` was written exactly as typed by every person writer (the find-or-create compat
 * normaliser is trim-only, "so B1a does not change stored/matched phone strings"). So
 * `5555550146`, `(555) 555-0146` and `555-555-0146` persisted as three different values for one
 * number, and find-or-create — which matched by exact string — could not recognise the same parent
 * typed two ways.
 *
 * The canonical stored form already exists: E.164 from `normalizePhone` (Decision C) — what the
 * seeds, `contacts.phone` and SMS sending use. This applies it at the person write boundary, for NEW
 * and UPDATED writes only; history is not rewritten. Input with no digits keeps its trimmed text, so
 * the behaviour for unparseable input is unchanged (nothing is rejected that was accepted before).
 */

import { normalizePhone } from "./normalizePhone";
import { phoneLookupVariants } from "./phoneLookupVariants";

/** The value to store in `persons.phone`: E.164 when the input has digits, else the trimmed text. */
export function normalizePhoneForPersonWrite(phone: string | null | undefined): string | null {
    if (phone == null) return null;
    const trimmed = String(phone).trim();
    if (!trimmed) return null;
    return normalizePhone(trimmed) ?? trimmed;
}

/**
 * Exact values to MATCH an existing person on: the canonical form plus every legacy shape a row
 * stored before this rule may carry, and the input as typed. Matching on these is what keeps a new
 * canonical write from creating a second person beside a legacy-formatted one.
 */
export function personPhoneMatchValues(phone: string | null | undefined): string[] {
    if (phone == null) return [];
    const trimmed = String(phone).trim();
    if (!trimmed) return [];
    const out = phoneLookupVariants(trimmed);
    if (!out.includes(trimmed)) out.push(trimmed);
    return out;
}
