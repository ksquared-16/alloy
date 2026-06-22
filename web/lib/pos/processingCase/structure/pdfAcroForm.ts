/**
 * POS-FP14 — PDF AcroForm field extraction (foundation).
 *
 * When a PDF is a real fillable form (an AcroForm), the document carries the fields
 * explicitly: each form field is a widget annotation with a field NAME, a field TYPE
 * (Tx / Btn / Ch / Sig), a PAGE, and a bounding RECT. That is far more reliable than
 * guessing fields from extracted text — so it is the right primary source for template
 * setup (text is only a fallback).
 *
 * `unpdf` (already installed) exposes `getDocumentProxy`, which returns a pdf.js
 * `PDFDocumentProxy`; each page's `getAnnotations()` yields these widgets. This module is
 * the PURE mapper from those raw widgets → a normalized field list (label / type / page /
 * bbox). It is deterministic and unit-tested. The thin runtime adapter that calls pdf.js
 * lives in `extractPdfAcroFormFields` below and is intentionally NOT wired into the live
 * pipeline yet — it needs an integration test against a real PDF before enabling.
 *
 * No OCR, no AI, no new dependency.
 */

export type PdfFieldType = "text" | "number" | "date" | "boolean" | "select" | "signature" | "unknown";

/** A raw widget annotation, normalized from pdf.js `page.getAnnotations()`. */
export interface PdfAcroFieldRaw {
    /** pdf.js fully-qualified field name, e.g. "child_name", "ChildsName". */
    fieldName?: string | null;
    /** pdf.js field type: "Tx" (text), "Btn" (button/checkbox/radio), "Ch" (choice), "Sig". */
    fieldType?: string | null;
    /** 1-based page number the widget is on. */
    page: number;
    /** [x0, y0, x1, y1] in PDF points (bottom-left origin). */
    rect?: number[] | null;
    checkBox?: boolean;
    radioButton?: boolean;
    pushButton?: boolean;
    combo?: boolean;
}

export interface PdfFieldRegion {
    label: string;
    name: string;
    type: PdfFieldType;
    page: number;
    bbox: [number, number, number, number] | null;
}

export interface PdfAcroFormResult {
    /** True when the PDF carried real form fields. */
    has_acroform: boolean;
    fields: PdfFieldRegion[];
    page_count: number;
}

/** Hungarian / widget prefixes some forms put on field names (txtName, chkAgree). */
const NAME_PREFIX_RE = /^(txt|fld|chk|cb|rb|btn|sig|dt|dte|num)(?=[A-Z_])/;

/** Turn a raw field name into a human label: strip prefixes, split camel/underscore, title-case. */
export function cleanFieldName(name: string): string {
    let s = name.trim().replace(NAME_PREFIX_RE, "");
    s = s.replace(/[._\-]+/g, " "); // separators → space
    s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2"); // camelCase → words
    s = s.replace(/\s+/g, " ").trim();
    if (!s) return name.trim();
    return s
        .toLowerCase()
        .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

function mapFieldType(a: PdfAcroFieldRaw): PdfFieldType {
    const ft = (a.fieldType ?? "").toLowerCase();
    const name = (a.fieldName ?? "").toLowerCase();
    if (ft === "sig" || /\bsign(ature)?\b/.test(name)) return "signature";
    if (ft === "btn" || a.checkBox || a.radioButton) return "boolean";
    if (ft === "ch" || a.combo) return "select";
    if (ft === "tx" || ft === "") {
        if (/(\bdate\b|dob|birth|expir)/.test(name)) return "date";
        if (/\b(amount|total|fee|zip|age|number|qty|count)\b/.test(name)) return "number";
        return "text";
    }
    return "unknown";
}

function toBbox(rect?: number[] | null): [number, number, number, number] | null {
    if (!Array.isArray(rect) || rect.length < 4) return null;
    const [a, b, c, d] = rect;
    if ([a, b, c, d].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;
    return [a, b, c, d];
}

/**
 * Pure: map raw widget annotations → a deduped, normalized field list. Push buttons
 * (submit/print) are dropped — they hold no data. Radio groups collapse to one field.
 */
export function mapAcroFormFields(raw: PdfAcroFieldRaw[], pageCount = 0): PdfAcroFormResult {
    const fields: PdfFieldRegion[] = [];
    const seen = new Set<string>();
    for (const a of raw) {
        if (a.pushButton) continue;
        const name = (a.fieldName ?? "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        fields.push({
            label: cleanFieldName(name),
            name,
            type: mapFieldType(a),
            page: a.page > 0 ? a.page : 1,
            bbox: toBbox(a.rect),
        });
    }
    return { has_acroform: fields.length > 0, fields, page_count: pageCount };
}

/**
 * Runtime adapter — read AcroForm widgets from PDF bytes via the installed `unpdf`
 * (pdf.js). NOT wired into the live route yet: it must be integration-tested against a
 * real PDF (pdf.js needs a worker/runtime that isn't exercised by the unit suite). Wire
 * it into `buildFormDraftForCaseSafe` as the PRIMARY source (text detection as fallback)
 * once a runtime test exists. Never throws.
 */
export async function extractPdfAcroFormFields(bytes: Uint8Array): Promise<PdfAcroFormResult> {
    try {
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(bytes);
        const raw: PdfAcroFieldRaw[] = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const annots = (await page.getAnnotations()) as Array<Record<string, unknown>>;
            for (const an of annots) {
                if (an.subtype !== "Widget") continue;
                raw.push({
                    fieldName: typeof an.fieldName === "string" ? an.fieldName : null,
                    fieldType: typeof an.fieldType === "string" ? an.fieldType : null,
                    page: p,
                    rect: Array.isArray(an.rect) ? (an.rect as number[]) : null,
                    checkBox: an.checkBox === true,
                    radioButton: an.radioButton === true,
                    pushButton: an.pushButton === true,
                    combo: an.combo === true,
                });
            }
        }
        return mapAcroFormFields(raw, pdf.numPages);
    } catch (e) {
        console.warn("[extractPdfAcroFormFields]", e instanceof Error ? e.message : e);
        return { has_acroform: false, fields: [], page_count: 0 };
    }
}
