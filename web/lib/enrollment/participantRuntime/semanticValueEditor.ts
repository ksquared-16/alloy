/**
 * What editing THIS semantic fact should actually look like.
 *
 * ## The failure this closes
 *
 * "Change" on a known value revealed the authored control — and for a plain text field the surface
 * deliberately renders no second text box, so the parent was left facing a composer that said
 * "Message Alloy…". They had just pressed a button meaning "let me correct this" and were handed a
 * blank conversational prompt. For an address that is worse than unhelpful: the only way to fix a
 * city was to retype the whole address from memory, exactly, or lose the parts they were not
 * changing.
 *
 * So Change opens a STRUCTURED editor chosen from the semantic domain, and the composer stays
 * available beside it rather than instead of it.
 *
 * ## Decomposition is presentation. It creates no canonical fields.
 *
 * The tenant's packet binds ONE address datum — `customer:address` — and that is the fact the
 * platform holds, the fact the D-99 fingerprint is taken over, and the single string every one of
 * its destinations receives. This module splits that string into parts so a parent can change the
 * city without retyping the street, and puts it back together on save. Nothing here writes, nothing
 * here is stored, and no part ever acquires an identity of its own: `addressParts` and
 * `composeAddress` are a round trip over one value.
 *
 * That distinction is the reason a parse failure is a first-class outcome rather than a guess. An
 * address this module cannot read confidently gets the plain single-line control, because inventing
 * a city boundary in someone's address is worse than not offering one.
 *
 * Pure. No I/O.
 */

/** The editor a semantic fact deserves. */
export type SemanticEditor =
    /** Street / city / state / ZIP over ONE canonical address string. */
    | { readonly kind: "address"; readonly parts: AddressParts }
    /** A single typed control — the browser's own date, email or phone affordances. */
    | { readonly kind: "value"; readonly inputType: "date" | "email" | "tel" | "number" | "text" }
    /** A closed vocabulary the authored control already declares. */
    | { readonly kind: "options"; readonly options: readonly string[] };

export type AddressParts = {
    readonly street: string;
    readonly city: string;
    readonly state: string;
    readonly postal: string;
};

const EMPTY_PARTS: AddressParts = { street: "", city: "", state: "", postal: "" };

/** `OR 97212`, `OR 97212-1234` — the trailing region of a US-style address line. */
const STATE_POSTAL = /^([A-Za-z]{2})[.,]?\s+(\d{5}(?:-\d{4})?)$/;
/** A lone postal code, for an address that names no state. */
const POSTAL_ONLY = /^(\d{5}(?:-\d{4})?)$/;

/**
 * Split one address string into editable parts, or null when it cannot be read confidently.
 *
 * Comma-delimited and deliberately conservative. Null is a real answer: the caller falls back to
 * editing the whole line, which is always correct even when it is less convenient.
 */
export function addressParts(value: unknown): AddressParts | null {
    if (typeof value !== "string") return null;
    const segments = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    // Street plus at least one more component. Fewer than that is a line, not an address.
    if (segments.length < 2) return null;

    const tail = segments[segments.length - 1]!;
    const statePostal = STATE_POSTAL.exec(tail);
    if (statePostal) {
        return {
            street: segments.slice(0, Math.max(1, segments.length - 2)).join(", "),
            city: segments.length >= 3 ? segments[segments.length - 2]! : "",
            state: statePostal[1]!.toUpperCase(),
            postal: statePostal[2]!,
        };
    }
    const postalOnly = POSTAL_ONLY.exec(tail);
    if (postalOnly) {
        return {
            street: segments.slice(0, Math.max(1, segments.length - 2)).join(", "),
            city: segments.length >= 3 ? segments[segments.length - 2]! : "",
            state: "",
            postal: postalOnly[1]!,
        };
    }
    /*
     * A trailing segment that is neither a state+ZIP nor a ZIP is treated as the city, and nothing
     * is invented for the parts that are genuinely absent. "418 NE Hancock St, Portland" is a real
     * address a parent may have given, and it must round-trip unchanged if they edit nothing.
     */
    return {
        street: segments.slice(0, segments.length - 1).join(", "),
        city: tail,
        state: "",
        postal: "",
    };
}

/**
 * Put the parts back into ONE canonical address string.
 *
 * The inverse of `addressParts` for anything that parsed: parts that were absent stay absent, so a
 * parent who edits nothing writes back exactly what they were shown, and the D-99 fingerprint of an
 * untouched address does not move.
 */
export function composeAddress(parts: AddressParts): string {
    const street = parts.street.trim();
    const city = parts.city.trim();
    const state = parts.state.trim().toUpperCase();
    const postal = parts.postal.trim();
    const region = [state, postal].filter(Boolean).join(" ");
    return [street, city, region].filter(Boolean).join(", ");
}

/** Does this fact's canonical key name a whole postal address? */
export function isAddressFact(canonicalKey: string | null | undefined): boolean {
    const key = (canonicalKey ?? "").trim().toLowerCase();
    if (!key) return false;
    const field = key.split(":").pop() ?? "";
    // The WHOLE address only. A componentized key (`address_line1`, `city`) is already one editable
    // value and needs no decomposition — offering it a four-box editor would be nonsense.
    return field === "address" || field === "mailing_address" || field === "home_address";
}

/**
 * Choose the editor for one semantic fact.
 *
 * The AUTHORED control leads wherever it says something specific, exactly as the conversational
 * control does — an operator who chose a select gets their vocabulary, and a date stays a date. The
 * address branch is the one place a canonical key overrides the authored type, because the authored
 * type on a whole-address field is invariably `text` and a text box is the control that caused the
 * problem.
 */
export function semanticEditorFor(input: {
    readonly canonicalKey: string | null;
    readonly inputType: string | null;
    readonly options: readonly string[];
    readonly value: unknown;
}): SemanticEditor {
    if (input.options.length > 0) return { kind: "options", options: input.options };

    if (isAddressFact(input.canonicalKey)) {
        const parts = addressParts(input.value);
        // Unreadable, or simply empty: edit the line itself rather than guess where a city begins.
        if (parts) return { kind: "address", parts };
        if (typeof input.value !== "string" || input.value.trim().length === 0) {
            return { kind: "address", parts: EMPTY_PARTS };
        }
        return { kind: "value", inputType: "text" };
    }

    const authored = (input.inputType ?? "").toLowerCase();
    if (authored === "date") return { kind: "value", inputType: "date" };
    if (authored === "number") return { kind: "value", inputType: "number" };
    if (authored === "email") return { kind: "value", inputType: "email" };
    if (authored === "phone" || authored === "tel") return { kind: "value", inputType: "tel" };

    /*
     * The canonical key, where the authored type is the generic `text` a PDF import produces.
     *
     * An imported email box is `text` on every one of these forms, and handing a parent a plain
     * text field for their email address gives up the keyboard and the validation the browser would
     * have provided for free. The key names the fact; the authored type only records how it was
     * printed.
     */
    const key = (input.canonicalKey ?? "").toLowerCase();
    const field = key.split(":").pop() ?? "";
    if (field.includes("email")) return { kind: "value", inputType: "email" };
    if (field.includes("phone")) return { kind: "value", inputType: "tel" };
    if (field === "dob" || field.includes("date_of_birth")) return { kind: "value", inputType: "date" };

    return { kind: "value", inputType: "text" };
}
