/**
 * Structural signature recognition for form field NAMES.
 *
 * A form's signature line is not always declared as a `/Sig` widget. Government forms in
 * particular ship signature lines as ordinary text widgets, so the field NAME is the only
 * evidence. The Oregon Certificate of Immunization Status is the case that exposed this: it
 * carries `Signature1` (front, parent attestation), `Signature2` (back, exemption attestation)
 * and `Signature update` (re-sign line) — all `/Tx`.
 *
 * The previous rule was `/\bsign(ature)?\b/`. A trailing word boundary cannot follow a digit,
 * so `Signature1` and `Signature2` — the two MANDATORY signatures — failed to match while the
 * optional `Signature update` matched. Loosening the boundary is the wrong repair: it starts
 * calling `signature_count` and `signature_date` signatures too.
 *
 * The structural rule instead reads the name as a compound noun and asks what its HEAD is.
 * Tokens are walked right to left; ordinals and qualifiers that modify a signature without
 * changing what it is are skipped; the first substantive token decides:
 *
 *   Signature1 · Signature_1 · Parent Signature · Signature update   → head "signature"  ✓
 *   signature_count · signature_date · signature_name · sig_url      → head is another datum ✗
 *
 * A qualifier also records the signature's VARIANT, so an update / re-sign line stays
 * distinguishable from the initial required signature downstream.
 *
 * Pure + deterministic. Lexicons are generic English form vocabulary — no document-specific
 * field-name table.
 */

/** Head nouns that mean "this field IS a signature". */
const SIGNATURE_HEADS = new Set(["signature", "signatures", "sign", "signed", "esign", "esignature"]);

/**
 * Qualifiers that modify a signature without turning it into a different datum. Walking past
 * these is what lets "Signature update" and "signature line" still read as signatures.
 */
const SIGNATURE_QUALIFIERS = new Set([
    "update",
    "updated",
    "re",
    "resign",
    "second",
    "additional",
    "line",
    "lines",
    "block",
    "box",
    "field",
    "area",
    "here",
    "below",
    "above",
    "required",
    "optional",
]);

/**
 * Head nouns that make the field a DIFFERENT datum that merely mentions a signature — a date,
 * a typed name, a count, a stored file. Hitting one of these first is a definitive rejection,
 * never a skip, so `signature_date` stays a date and `signature_count` stays a number.
 */
const SIGNATURE_DISQUALIFIERS = new Set([
    "count",
    "date",
    "dated",
    "datetime",
    "time",
    "timestamp",
    "name",
    "names",
    "title",
    "type",
    "status",
    "state",
    "id",
    "image",
    "img",
    "url",
    "uri",
    "path",
    "file",
    "hash",
    "method",
    "reason",
    "note",
    "notes",
    "printed",
    "print",
]);

/** Variant of a recognized signature: the initial required one, or an update / re-sign line. */
export type SignatureVariant = "initial" | "update";

export interface SignatureNameVerdict {
    /** True when the field name's head noun is a signature. */
    isSignature: boolean;
    /** Which signature line this is — an update line is not the initial required signature. */
    variant?: SignatureVariant;
    /** The ordinal carried by the name (`Signature2` → 2), when one is present. */
    ordinal?: number;
    /** Deterministic reason, for diagnostics and operator-facing explanation. */
    reason: string;
}

const UPDATE_QUALIFIERS = new Set(["update", "updated", "re", "resign", "second", "additional"]);

/**
 * Split a raw field name into lowercase word tokens, separating a trailing ordinal from the
 * word it is glued to (`Signature1` → ["signature", "1"]) and splitting camelCase runs.
 */
export function signatureNameTokens(name: string): string[] {
    return (name ?? "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([a-zA-Z])(\d)/g, "$1 $2")
        .replace(/(\d)([a-zA-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

const ROMAN_RE = /^(i{1,3}|iv|v|vi{1,3}|ix|x)$/;

/**
 * Hungarian widget prefixes some authoring tools put on field names (`txtName`, `chkAgree`,
 * `sigParent`). A leading prefix DECLARES the widget's type, so it heads nothing — and when the
 * declared type is `sig`, that declaration is itself the signature evidence. Same lexicon the
 * label cleaner strips in `pdfAcroForm.cleanFieldName`.
 */
const WIDGET_PREFIXES = new Set(["txt", "fld", "chk", "cb", "rb", "btn", "sig", "dt", "dte", "num"]);

function isOrdinalToken(t: string): boolean {
    return /^\d+$/.test(t) || ROMAN_RE.test(t) || t === "first" || t === "second" || t === "third";
}

/**
 * Read a field name as a compound noun and decide whether its head is a signature.
 * `fieldType === "Sig"` is authoritative elsewhere; this is the name-only evidence path.
 */
export function classifySignatureName(name: string): SignatureNameVerdict {
    const all = signatureNameTokens(name);
    if (all.length === 0) return { isSignature: false, reason: "empty field name" };

    // A leading widget-type prefix declares the type rather than heading the noun. `sigParent`
    // is a signature by declaration; `txtName` drops the `txt` and reads as a name.
    const declaredSignature = all.length > 1 && all[0] === "sig";
    const tokens = all.length > 1 && WIDGET_PREFIXES.has(all[0]) ? all.slice(1) : all;

    let ordinal: number | undefined;
    let variant: SignatureVariant = "initial";

    for (let i = tokens.length - 1; i >= 0; i -= 1) {
        const t = tokens[i];

        if (isOrdinalToken(t)) {
            if (/^\d+$/.test(t) && ordinal === undefined) ordinal = Number(t);
            // "second" is both an ordinal and an update qualifier — record the variant too.
            if (UPDATE_QUALIFIERS.has(t)) variant = "update";
            continue;
        }

        if (SIGNATURE_DISQUALIFIERS.has(t)) {
            return { isSignature: false, reason: `head noun "${t}" — a ${t}, not a signature` };
        }

        if (SIGNATURE_QUALIFIERS.has(t)) {
            if (UPDATE_QUALIFIERS.has(t)) variant = "update";
            continue;
        }

        if (SIGNATURE_HEADS.has(t)) {
            return {
                isSignature: true,
                variant,
                ...(ordinal !== undefined ? { ordinal } : {}),
                reason:
                    variant === "update"
                        ? `head noun "${t}" with an update qualifier — a re-sign line`
                        : `head noun "${t}"${ordinal !== undefined ? ` with ordinal ${ordinal}` : ""}`,
            };
        }

        // Any other substantive token is the head. The field is that thing — unless the name
        // opened with a `sig` widget declaration, which is signature evidence in its own right.
        if (declaredSignature) {
            return { isSignature: true, variant, ...(ordinal !== undefined ? { ordinal } : {}), reason: `"sig" widget-type prefix on "${t}"` };
        }
        return { isSignature: false, reason: `head noun "${t}" — not a signature` };
    }

    // Every token was an ordinal or a qualifier: nothing substantive to head the noun.
    if (declaredSignature) return { isSignature: true, variant, ...(ordinal !== undefined ? { ordinal } : {}), reason: '"sig" widget-type prefix' };
    return { isSignature: false, reason: "no substantive head noun" };
}
