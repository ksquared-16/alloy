/**
 * How a DATE prints at one document destination.
 *
 * ## The defect this closes
 *
 * A canonical date is stored ISO — `2021-03-14` — because that is what a date IS in storage. The
 * fidelity mapping then passed values straight through, so every mapped AcroForm field on a parent's
 * enrollment paperwork printed the database's serialization. One semantic fact reached three
 * destinations on the Firefly form and all three read `2021-03-14`.
 *
 * ## Why the destination decides, and not the runtime
 *
 * `fidelity_v1` is already declared the artifact-PRESENTATION authority and carries "only
 * presentation wiring". A date's printed shape on a specific line of a specific document is exactly
 * that: the school's form may want `03/14/2021`, a state form may want `03-14-2021`, and a rare
 * machine-read field may genuinely want ISO. So the format is a property of the DESTINATION, and it
 * is declared beside the destination.
 *
 * This is deliberately NOT a Participant Runtime date doctrine. The conversation keeps using
 * `formatDisplayDate` — the platform's human display helper — and this module is not imported there.
 * The same semantic value therefore renders as `Mar 14, 2021` to a parent and `03/14/2021` on their
 * paperwork, with ONE stored value behind both. Presentation differs; truth does not fork.
 *
 * Parsing is borrowed from `presentationDateFormat`, so there is no second date parser either.
 *
 * Pure.
 */

import { formatPhoneDisplay } from "@/lib/intake/normalize/phone";
import { formatDisplayDate, parsePresentationDateInput } from "@/lib/presentation/presentationDateFormat";

/**
 * The shapes a destination may ask for.
 *
 * `iso` exists so a destination that genuinely requires the machine form can say so EXPLICITLY —
 * which is the point: ISO on paperwork becomes a declared choice instead of an accident of storage.
 */
export const DOCUMENT_DATE_FORMATS = ["mm/dd/yyyy", "mm-dd-yyyy", "long", "iso"] as const;
export type DocumentDateFormat = (typeof DOCUMENT_DATE_FORMATS)[number];

/**
 * What an undeclared destination gets.
 *
 * Not ISO. A mapping authored before this contract existed is far likelier to be a printed US
 * enrollment form than a machine-read field, and `03/14/2021` is what a parent expects to see on it.
 * A destination that wants otherwise declares it.
 */
export const DEFAULT_DOCUMENT_DATE_FORMAT: DocumentDateFormat = "mm/dd/yyyy";

/** A bare calendar date in storage form — the only shape this module reformats. */
function isStoredDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * Render one value for one destination.
 *
 * Only a STORED date is touched. Anything else — a name, a note, a phone number, a date a parent
 * typed in some other shape — is returned exactly as given: this module formats a known
 * serialization, it does not normalize arbitrary input. Normalization is validation's job, upstream.
 */
export function formatValueForDocumentDestination(
    value: unknown,
    format: DocumentDateFormat = DEFAULT_DOCUMENT_DATE_FORMAT,
): unknown {
    if (typeof value !== "string") return value;
    const raw = value.trim();
    /*
     * Ten bare digits in a printed box are a phone number nobody wants to read.
     *
     * The canonical value stays exactly as stored; this is the destination deciding how the fact
     * appears on paper, which is the same job `date_format` already does for a date.
     */
    if (/^\d{10}$/.test(raw)) return formatPhoneDisplay(raw);
    if (!isStoredDate(raw)) return value;
    if (format === "iso") return raw;

    const parsed = parsePresentationDateInput(raw);
    // An unparseable stored date is returned untouched rather than guessed at. A document is not the
    // place to discover that a value was malformed, and inventing one would be worse than showing it.
    if (!parsed) return value;

    if (format === "long") return formatDisplayDate(raw, { timeZone: "UTC" });

    // UTC throughout: a date-only value has no timezone, and formatting it locally is how a child
    // born on the 14th prints as the 13th for anyone west of UTC.
    const parts = new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).formatToParts(parsed.date);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    const year = parts.find((p) => p.type === "year")?.value ?? "";
    if (!month || !day || !year) return value;

    return format === "mm-dd-yyyy" ? `${month}-${day}-${year}` : `${month}/${day}/${year}`;
}
