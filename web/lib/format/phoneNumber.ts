/**
 * THE PLATFORM'S PHONE PRIMITIVE — one reading, one writing, one presentation.
 *
 * ## What drifted
 *
 * Phone was already a platform field type (`platformFieldCatalog`), and the storage contract was
 * already decided: ten digits for a North American number, set by `normalizePhoneInput` and read
 * back by `displayValue`. What had NOT converged was who formats it. Three formatters existed —
 * `formatPhoneUS` in the admin formatters, `formatPhoneDisplay` in intake normalization, and an
 * inline `/^\d{10}$/` test in the document destination — and several participant surfaces went
 * through none of them.
 *
 * MEASURED in human QA: a known emergency contact read `(541) 555-7788` and a contact the family
 * had just typed read `1231231234`, one above the other on the same card. Neither value was wrong;
 * the known one merely happened to be stored with its punctuation. Nothing was formatting either.
 *
 * ## The contract this module states
 *
 *   STORAGE   unchanged, and NOT decided here. Ten digits for a NANP number is what the
 *             participant normalizer already writes; anything else is kept exactly as given.
 *   DISPLAY   `(541) 555-7788` for a NANP number in any of its stored shapes.
 *   OTHERWISE returned untouched. An international number is not a NANP number with extra digits.
 *
 * That last line is the one with teeth. `formatPhoneUS` formatted the LAST ten digits of whatever
 * it was handed, so `+442071838750` printed as `(207) 183-8750` — a London number rendered as an
 * Oregon one, on an operator's screen, with no sign anything had happened. Only a number this
 * module can recognise as NANP is reformatted; everything else survives verbatim.
 */

/** A NANP number in any shape we store it: 10 digits, 11 with the country code, or `+1` E.164. */
function nanpDigits(raw: string): string | null {
    const text = raw.trim();
    if (!text) return null;

    /*
     * A `+` is the author saying which country this is. `+1` we know; anything else we do not, and
     * a number we cannot read is left exactly as the person wrote it rather than guessed at.
     */
    if (text.startsWith("+")) {
        const digits = text.slice(1).replace(/\D/g, "");
        return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : null;
    }

    // Punctuation a person typed is not information: (541) 555-7788, 541.555.7788, 541 555 7788.
    if (/[^\d\s().+-]/.test(text)) return null;
    const digits = text.replace(/\D/g, "");
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return null;
}

/**
 * One value, as a person reads a phone number.
 *
 * Total: anything that is not a recognisable NANP number comes back as it went in, so this is safe
 * to apply to a field whose contents may not be a phone number at all.
 */
export function formatPhoneNumber(value: unknown): string {
    if (value === null || value === undefined) return "";
    const raw = String(value);
    const digits = nanpDigits(raw);
    if (!digits) return raw.trim();
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Whether this value is a NANP number this module will reformat. */
export function isFormattablePhoneNumber(value: unknown): boolean {
    return value !== null && value !== undefined && nanpDigits(String(value)) !== null;
}

/**
 * What an input box shows WHILE it is being typed.
 *
 * Progressive rather than all-or-nothing, because a mask that only appears on the tenth digit
 * teaches the parent nothing about what is expected of them. Derived from the digits each time, so
 * backspacing through a separator deletes a digit instead of getting stuck on a bracket: `(541) 5`
 * backspaces to `(541)` → four digits minus one → `541`, and on down to empty.
 *
 * Never destroys input it does not understand: an international number, or more digits than a NANP
 * number has, is returned untouched so a correct value cannot be truncated by the mask.
 */
export function formatPhoneAsTyped(raw: string): string {
    const text = String(raw ?? "");
    if (!text.trim()) return text;

    /*
     * A complete NANP number is laid out whatever shape it arrived in — `+1 (541) 555-7788` pasted
     * from a contacts app is the same number as `5415557788` typed, and refusing to mask it was how
     * a pasted US number stayed visibly different from a typed one.
     */
    const complete = nanpDigits(text);
    if (complete) return `(${complete.slice(0, 3)}) ${complete.slice(3, 6)}-${complete.slice(6)}`;

    // Any OTHER explicit country code is the author's declaration; the mask does not argue with it.
    if (text.trim().startsWith("+")) return text;
    if (/[^\d\s().+-]/.test(text)) return text;

    let digits = text.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    // More digits than a NANP number holds: not something this mask can lay out.
    if (digits.length > 10) return text;

    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * What gets STORED for a typed phone number.
 *
 * Ten digits for a complete NANP number — the shape `normalizePhoneInput` already writes and every
 * canonical reader already expects — and the text exactly as typed for anything else. Display
 * formatting never becomes the stored truth: the brackets are how the number is read, not what it
 * is.
 */
export function phoneStorageValue(raw: string): string {
    const text = String(raw ?? "").trim();
    const digits = nanpDigits(text);
    return digits ?? text;
}

/**
 * Whether an authored field means "phone number".
 *
 * The canonical binding leads — a field bound to the `phone` field key IS a phone, whatever it is
 * labelled — and the label is consulted only when the Form carries no binding, which is the same
 * precedence `valueControlForTurn` and `normalizeParticipantAnswer` already use. Stated once here
 * so a fourth surface cannot invent a fourth rule.
 */
export function fieldMeansPhone(input: { readonly fieldKey?: string | null; readonly type?: string | null; readonly label?: string | null }): boolean {
    const type = (input.type ?? "").toLowerCase();
    if (type === "phone" || type === "tel") return true;
    const key = (input.fieldKey ?? "").toLowerCase();
    if (key.includes("phone") || key.includes("mobile") || key.includes("tel")) return true;
    const label = (input.label ?? "").toLowerCase();
    return /\bphone\b|\bmobile\b|\bcell\b/.test(label);
}
