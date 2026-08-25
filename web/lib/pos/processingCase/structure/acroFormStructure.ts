/**
 * AcroForm → DocumentStructureCandidate: the seam that lets exact extraction and semantic
 * understanding compose.
 *
 * Configuration Discovery consumes `DocumentStructureCandidate`. The AcroForm path did not
 * produce one — it built a draft directly — so a fillable PDF returned its widgets and nothing
 * else: no acknowledgements, no upload requirements, no relationship groups, no binding
 * proposals. The document that supplied the BEST field evidence received the LEAST semantic
 * understanding, which is exactly backwards.
 *
 * This adapter projects the widget list into the structure contract without inventing anything.
 * Every field keeps its native name, type, page and bounding box. Sections are pages, because
 * that is the only grouping a widget list actually carries; the page's extracted text runs ride
 * along as `static_text` so the prose evidence a widget cannot hold — "attach a copy", "I certify
 * that…" — is still available to discovery.
 *
 * The page text is EVIDENCE, never a source of fields. Widget sections keep the `fields`
 * disposition: a page holding 49 input widgets is a collection page even when its footer
 * mentions a signature, and letting prose re-classify the page would discard every widget on it.
 *
 * Pure + deterministic. No second extraction pass — the text runs come from the same AcroForm
 * read that produced the widgets.
 */

import type { PdfAcroFormResult, PdfFieldRegion, PdfPageContext, PdfPageText } from "./pdfAcroForm";
import { detectRepeatingFieldGroups } from "./repeatingFieldGroups";
import { segmentLogicalArtifacts, type LogicalArtifact } from "./logicalArtifacts";
import type {
    DocumentStructureCandidate,
    DocumentStructureField,
    DocumentStructureSection,
    StructureFieldType,
} from "./types";

export const ACROFORM_STRUCTURE_VERSION = "fp18.0-acroform-structure";

/** Widget type → the structure detector's review vocabulary. */
function structureType(t: PdfFieldRegion["type"]): StructureFieldType {
    switch (t) {
        case "date":
            return "date";
        case "number":
            return "number";
        case "boolean":
            return "checkbox";
        case "select":
            return "select";
        case "signature":
            return "signature";
        case "text":
        case "unknown":
        default:
            return "text";
    }
}

/** Group a page's text runs back into visual lines (same baseline within tolerance), top → bottom. */
export function pageTextLines(texts: PdfPageText[] | undefined, tolerance = 2.5): string[] {
    if (!texts || texts.length === 0) return [];
    const sorted = [...texts].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: string[] = [];
    let bucket: PdfPageText[] = [];
    let baseline: number | null = null;
    const flush = () => {
        if (bucket.length === 0) return;
        const text = [...bucket]
            .sort((a, b) => a.x - b.x)
            .map((t) => t.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        if (text) lines.push(text);
        bucket = [];
    };
    for (const t of sorted) {
        if (baseline === null || Math.abs(t.y - baseline) <= tolerance) {
            baseline = baseline === null ? t.y : baseline;
            bucket.push(t);
        } else {
            flush();
            baseline = t.y;
            bucket = [t];
        }
    }
    flush();
    return lines;
}

export interface AcroFormStructureOptions {
    /**
     * Supplemental prose sections from another reader (native layout / OCR) that hold content the
     * widget list cannot: consent paragraphs, instruction blocks, signature prose. Only sections
     * with a non-`fields` disposition are carried, and they never contribute fields — the native
     * widgets remain the only destinations.
     */
    supplementalProseSections?: DocumentStructureSection[];
}

/**
 * Project AcroForm widgets (plus the page text that accompanied them) into the structure contract
 * Configuration Discovery consumes. Field identity, geometry and native type are preserved exactly.
 */
export function buildStructureFromAcroForm(
    acro: PdfAcroFormResult,
    opts: AcroFormStructureOptions = {}
): DocumentStructureCandidate {
    const pageContext = new Map<number, PdfPageContext>();
    for (const p of acro.pages ?? []) pageContext.set(p.page, p);

    // Repeated destinations the page geometry declares — resolved before sectioning so each field
    // can carry its group membership.
    const repeatingGroups = detectRepeatingFieldGroups(acro.fields);
    const groupOfField = new Map<string, string>();
    for (const g of repeatingGroups) for (const n of g.member_names) groupOfField.set(n, g.id);

    const byPage = new Map<number, DocumentStructureField[]>();
    const order: number[] = [];
    for (const f of acro.fields) {
        const page = f.page > 0 ? f.page : 1;
        if (!byPage.has(page)) {
            byPage.set(page, []);
            order.push(page);
        }
        byPage.get(page)!.push({
            label: f.label,
            suggested_type: structureType(f.type),
            confidence: "high",
            evidence: `pdf_field:${f.name}`,
            page,
            ...(f.bbox ? { bbox: f.bbox } : {}),
            ...(groupOfField.has(f.name) ? { repeat_group_id: groupOfField.get(f.name) } : {}),
            ...(f.signature_variant ? { signature_variant: f.signature_variant } : {}),
        });
    }

    const multiPage = acro.page_count > 1;
    const sections: DocumentStructureSection[] = order.map((page) => {
        const lines = pageTextLines(pageContext.get(page)?.texts);
        return {
            title: multiPage ? `Page ${page}` : "Form fields",
            confidence: "high",
            page,
            // A page of input widgets collects fields. Prose on the page is evidence for the
            // concepts below it, never a reason to reclassify the page and drop its widgets.
            disposition: "fields",
            static_text: lines.length > 0 ? lines.join("\n") : null,
            fields: byPage.get(page)!,
        };
    });

    for (const prose of opts.supplementalProseSections ?? []) {
        if (!prose.disposition || prose.disposition === "fields") continue;
        sections.push({ ...prose, fields: [] });
    }

    // A fillable PDF can carry more than one attestation — the immunization certificate's front
    // records vaccinations and its back declares an exemption, each signed separately. Scoping them
    // is what stops one signature from appearing to satisfy the other.
    const logicalArtifacts: LogicalArtifact[] = segmentLogicalArtifacts(
        sections.map((s, i) => ({
            title: s.title,
            index: i,
            destinations: s.fields.map((f) => ({ id: f.evidence ?? f.label, type: f.suggested_type, label: f.label })),
        }))
    );

    const fieldCount = acro.fields.length;
    return {
        sections,
        warnings: [],
        ...(logicalArtifacts.length ? { logical_artifacts: logicalArtifacts } : {}),
        ...(repeatingGroups.length > 0 ? { repeating_groups: repeatingGroups } : {}),
        diagnostics: {
            text_length: sections.reduce((n, s) => n + (s.static_text?.length ?? 0), 0),
            line_count: sections.reduce((n, s) => n + (s.static_text ? s.static_text.split("\n").length : 0), 0),
            candidate_labels: fieldCount,
            section_headers: sections.map((s) => s.title),
            rejected_examples: [],
            rejected_headers: [],
            detected_known_labels: [],
            confidence_summary: { high: fieldCount, medium: 0, low: 0 },
            quality: fieldCount > 0 ? "strong" : "failed",
        },
    };
}
