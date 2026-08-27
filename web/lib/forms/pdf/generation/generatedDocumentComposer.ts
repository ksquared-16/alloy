/**
 * The completed document Alloy produces when the source never had a recoverable layout.
 *
 * Three of the certification packet's five artifacts came from hosted forms: no AcroForm field
 * identities, and no bounding boxes — only a page number. There is nothing to fill and nothing to
 * fill it into, so `fidelity_v1` cannot serve them and inventing coordinates would be a lie about
 * provenance. The honest alternative is not the old participant Form renderer either: a parent at
 * the end of enrolment should receive a document, not the web page they just filled in.
 *
 * So this composes one. It is authoritative as Alloy's completed representation of that intake, and
 * it says so — never as a pixel replica of the original. The distinction is carried in metadata, not
 * left to the reader to infer.
 *
 * PRESENTATION ONLY. The immutable Form version decides what exists, in what order, and what each
 * thing means; the participant's answers decide what it says. This module decides only where the ink
 * goes. It reinterprets no ownership, invents no field, re-runs no Processing, and creates no
 * canonical fact.
 *
 * Deterministic: the same version, answers and composer version produce byte-identical output, which
 * is what lets a signed document be reproduced exactly as it was signed.
 */

import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { FormSchemaV1, FormField } from "@/lib/forms/schema";
import { humanizeOperatorSlug } from "@/lib/forms/operatorDisplayLabels";
import { formatValueForDocumentDestination } from "@/lib/forms/pdf/documentDestinationDate";

/**
 * The layout's own version.
 *
 * A signed document must be reproducible exactly as it was signed, and layout is part of what was
 * signed — a page break that moves changes which page a signature sits on. Bumping this is what
 * makes a layout change visible, rather than letting a future spacing tweak silently redraw an old
 * agreement.
 */
export const GENERATED_DOCUMENT_COMPOSER_VERSION = "generated_document_v1" as const;

const PAGE = { width: 612, height: 792 } as const;
const MARGIN = { top: 64, bottom: 72, left: 64, right: 64 } as const;
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const SIGNATURE_BLOCK = { height: 96, ruleWidth: 260 } as const;

export interface GeneratedSignaturePlacement {
    /** The authored signature control this block satisfies — Forms' identity, not the layout's. */
    readonly field_id: string;
    readonly page: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface GeneratedDocumentProvenance {
    readonly form_definition_id: string;
    readonly form_definition_version_id: string;
    readonly source_document_id: string | null;
    readonly source_sha256: string | null;
    readonly source_title: string | null;
}

export interface ComposedGeneratedDocument {
    readonly bytes: Uint8Array;
    readonly pageCount: number;
    readonly signaturePlacements: readonly GeneratedSignaturePlacement[];
    /** Answered questions rendered as completed Q&A. */
    readonly answeredCount: number;
    /** Clauses rendered as executed, not as controls. */
    readonly acknowledgementCount: number;
    readonly composerVersion: string;
    readonly artifactSha256: string;
}

/**
 * The source as a person would name it.
 *
 * Provenance is for the reader, so it must not print a capture filename —
 * "school-of-enrichment-admissions-packet.capture.html (4)" tells a parent nothing and looks like
 * a leak. The stored title is whatever the upload was called, so the extension, the capture suffix
 * and any duplicate counter are stripped and the words are restored.
 */
function readableSourceTitle(raw: string | null): string | null {
    if (!raw) return null;
    const cleaned = raw
        .replace(/\s*\(\d+\)\s*$/, "")
        .replace(/\.(capture\.)?(html?|pdf|docx?)$/i, "")
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) return null;
    return cleaned.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * A question as a person would read it — never an internal key.
 *
 * `subject_line` reached a finished document as its own heading. A completed record must not print
 * implementation identifiers, and the platform already owns the fix: `humanizeOperatorSlug` is where
 * "never show raw keys in primary UI" lives, so a key goes through it rather than through a second
 * rule invented here. Anything a person actually wrote is left exactly as written.
 */
function presentableQuestion(label: string | null | undefined): string {
    const raw = (label ?? "").trim().replace(/\s*[:?]\s*$/, "");
    if (!raw) return "";
    const looksLikeKey = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(raw) || (/^[A-Z0-9_]+$/.test(raw) && raw.length > 1);
    return looksLikeKey ? humanizeOperatorSlug(raw) : raw;
}

const titlesMatch = (a: string, b: string) =>
    a.replace(/[^a-z0-9]/gi, "").toLowerCase() === b.replace(/[^a-z0-9]/gi, "").toLowerCase();

/** A question the participant was never asked has no answer to print, and prints nothing. */
function isRenderableValueField(field: FormField): boolean {
    if (field.type === "text_block") return false;
    if (field.type === "signature") return false;
    if (field.type === "file_ref") return false;
    return true;
}

/** An acknowledgement reads as an executed clause, never as a Yes/No control. */
function isAcknowledgement(field: FormField): boolean {
    return field.type === "boolean" && /^(i |we |by signing)/i.test(field.label ?? "");
}

/**
 * One stored answer, printed the way a document prints it.
 *
 * `formatValueForDocumentDestination` already owns this decision for the fidelity engine, and the
 * composed engine was skipping it: the same date printed `04/02/2021` on the Oregon CIS and
 * `2021-04-02` on the completed application beside it, and ten stored digits printed as a bare
 * number rather than as a phone. One stored value, formatted per destination — a composed document
 * is a destination too.
 */
function displayAnswer(field: FormField, raw: unknown): string {
    if (raw === undefined || raw === null || raw === "") return "—";
    if (typeof raw === "boolean") return raw ? "Yes" : "No";
    return String(formatValueForDocumentDestination(raw));
}

/**
 * Text the standard fonts can actually draw.
 *
 * The standard PDF fonts encode WinAnsi (Latin-1), and pdf-lib throws on anything outside it — a
 * source label reading "Non-Refundable Annual Material Fee 🛈" aborted the whole document. A school
 * may put any character in a label, so the composer must survive all of them: typographic quotes
 * and dashes become their ASCII equivalents because that preserves the meaning, and anything still
 * unencodable is dropped rather than allowed to fail the document a family is waiting for.
 */
function toDrawable(text: string): string {
    const folded = String(text)
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/\u2026/g, "...")
        .replace(/\u00A0/g, " ");
    let out = "";
    for (const ch of folded) {
        const code = ch.codePointAt(0) ?? 0;
        // WinAnsi covers Latin-1 plus a handful of punctuation already folded above.
        if (code === 9 || code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) out += ch;
    }
    return out.replace(/\s+/g, " ").trim();
}

/** Wrap on words, and never emit a line the page cannot hold. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = toDrawable(text).split(" ").filter((w) => w.length > 0);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
            line = next;
            continue;
        }
        if (line) lines.push(line);
        // A single word wider than the column is broken rather than allowed to run off the page.
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
            let chunk = "";
            for (const ch of word) {
                if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
                    lines.push(chunk);
                    chunk = ch;
                } else chunk += ch;
            }
            line = chunk;
        } else line = word;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

/**
 * A signature the participant actually made, ready to be drawn where this layout reserved room.
 *
 * The composer reserves a signature block and draws a rule under it, and for a long time that was
 * all it did — so a parent could sign the Tuition agreement, see the mark on their screen, and get
 * back a composed document with an empty line. A reserved block that never receives its mark is a
 * blank on a document someone agreed to.
 */
export interface ComposedSignatureMark {
    /** PNG bytes exactly as captured. The mark on paper is the mark that was made. */
    readonly drawnPng?: Uint8Array | null;
    readonly typedFullName?: string | null;
}

export async function composeGeneratedDocument(input: {
    schema: FormSchemaV1;
    /** Field id → the participant's answer. Absent means unanswered, and prints as such. */
    values: Readonly<Record<string, unknown>>;
    provenance: GeneratedDocumentProvenance;
    /** Field id → the captured signature, when the participant has signed that block. */
    signatures?: Readonly<Record<string, ComposedSignatureMark>>;
}): Promise<ComposedGeneratedDocument> {
    const pdf = await PDFDocument.create();
    const body = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const ink = rgb(0.09, 0.13, 0.18);
    const quiet = rgb(0.42, 0.46, 0.5);
    const rule = rgb(0.85, 0.87, 0.89);

    let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
    let y = PAGE.height - MARGIN.top;
    const signaturePlacements: GeneratedSignaturePlacement[] = [];
    let answeredCount = 0;
    let acknowledgementCount = 0;

    const newPage = () => {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - MARGIN.top;
    };
    /** Reserve vertical space, breaking the page when the block genuinely will not fit. */
    const reserve = (height: number) => {
        if (y - height < MARGIN.bottom) newPage();
    };
    const draw = (text: string, opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; gap?: number }) => {
        const lines = wrap(text, opts.font, opts.size, CONTENT_WIDTH);
        const lineHeight = opts.size * 1.38;
        reserve(lines.length * lineHeight);
        for (const line of lines) {
            page.drawText(toDrawable(line), { x: MARGIN.left, y: y - opts.size, size: opts.size, font: opts.font, color: opts.color ?? ink });
            y -= lineHeight;
        }
        y -= opts.gap ?? 0;
    };

    // ── title ────────────────────────────────────────────────────────────────────────────────────
    draw(input.schema.title, { font: bold, size: 18, gap: 4 });
    const sourceLabel = readableSourceTitle(input.provenance.source_title);
    if (sourceLabel) {
        // Says what this document IS. It is Alloy's completed record of that intake, not a replica.
        draw(`Completed enrollment record · based on ${sourceLabel}`, { font: italic, size: 9, color: quiet, gap: 10 });
    }
    page.drawLine({
        start: { x: MARGIN.left, y: y + 4 },
        end: { x: PAGE.width - MARGIN.right, y: y + 4 },
        thickness: 0.75,
        color: rule,
    });
    y -= 18;

    const fieldById = new Map(input.schema.fields.map((f) => [f.id, f]));

    for (const section of input.schema.sections) {
        const fields = section.field_ids.map((id) => fieldById.get(id)).filter(Boolean) as FormField[];
        if (!fields.length) continue;

        // A section heading that merely repeats the document title is noise on the page.
        const heading = section.title && !titlesMatch(section.title, input.schema.title) ? section.title : null;
        if (heading) {
            // A heading with nothing under it on the page is an orphan; keep it with its first entry.
            reserve(13 * 1.38 + 34);
            draw(heading.toUpperCase(), { font: bold, size: 10, color: quiet, gap: 8 });
        }

        for (const field of fields) {
            if (field.type === "text_block") {
                const content = (field as { content?: string }).content ?? "";
                if (content.trim()) draw(content, { font: body, size: 9.5, color: quiet, gap: 8 });
                continue;
            }

            if (field.type === "signature") {
                /*
                 * A reserved block, positioned by this layout rather than by geometry the source
                 * never had. Deterministic for a given version + composer version, which is what
                 * lets a signed document be reproduced exactly as it was signed.
                 */
                reserve(SIGNATURE_BLOCK.height);
                const label = (field.label ?? "Signature").replace(/\s*[:?]\s*$/, "");
                draw(label, { font: body, size: 9.5, gap: 6 });
                const lineY = y - 26;
                page.drawLine({
                    start: { x: MARGIN.left, y: lineY },
                    end: { x: MARGIN.left + SIGNATURE_BLOCK.ruleWidth, y: lineY },
                    thickness: 0.75,
                    color: ink,
                });
                page.drawText("Signature", { x: MARGIN.left, y: lineY - 12, size: 7.5, font: body, color: quiet });

                /*
                 * The mark goes ON the rule this layout just drew.
                 *
                 * Sized to fit the reserved block and centred over the rule, so a wide or a narrow
                 * capture both sit on the line rather than across the text above it. A drawn mark
                 * is drawn; a typed name is written in the same script-ish italic the operator side
                 * uses; an unreadable asset leaves the line empty rather than substituting a
                 * stand-in, exactly as the fidelity path decided.
                 */
                const mark = input.signatures?.[field.id];
                if (mark?.drawnPng && mark.drawnPng.length > 0) {
                    try {
                        const png = await pdf.embedPng(mark.drawnPng);
                        const maxW = SIGNATURE_BLOCK.ruleWidth - 8;
                        const maxH = 30;
                        const scale = Math.min(maxW / png.width, maxH / png.height, 1);
                        const w = png.width * scale;
                        const h = png.height * scale;
                        page.drawImage(png, {
                            x: MARGIN.left + (SIGNATURE_BLOCK.ruleWidth - w) / 2,
                            y: lineY + 2,
                            width: w,
                            height: h,
                        });
                    } catch {
                        /* Unreadable capture: the line stays empty rather than showing a stand-in. */
                    }
                } else if (mark?.typedFullName && mark.typedFullName.trim()) {
                    const typed = toDrawable(mark.typedFullName.trim());
                    const size = 16;
                    const w = Math.min(italic.widthOfTextAtSize(typed, size), SIGNATURE_BLOCK.ruleWidth - 8);
                    page.drawText(typed, {
                        x: MARGIN.left + (SIGNATURE_BLOCK.ruleWidth - w) / 2,
                        y: lineY + 5,
                        size,
                        font: italic,
                        color: ink,
                    });
                }
                signaturePlacements.push({
                    field_id: field.id,
                    page: pdf.getPageCount() - 1,
                    x: MARGIN.left,
                    y: lineY,
                    width: SIGNATURE_BLOCK.ruleWidth,
                    height: 34,
                });
                y = lineY - 30;
                continue;
            }

            if (field.type === "file_ref") {
                const label = (field.label ?? "Attachment").replace(/\s*[:?]\s*$/, "");
                const provided = input.values[field.id];
                draw(`${label}: ${provided ? "Provided" : "To be provided"}`, { font: body, size: 10, gap: 6 });
                continue;
            }

            if (isAcknowledgement(field)) {
                // An executed clause: the statement, and that it was accepted. Not a control.
                acknowledgementCount += 1;
                const accepted = input.values[field.id] === true || input.values[field.id] === "Yes";
                draw(field.label ?? "", { font: body, size: 9.5, gap: 2 });
                draw(accepted ? "Acknowledged and accepted." : "Not acknowledged.", {
                    font: italic,
                    size: 9,
                    color: quiet,
                    gap: 8,
                });
                continue;
            }

            if (!isRenderableValueField(field)) continue;

            /*
             * A read-only destination with nothing in it has nothing to say.
             *
             * A blank the PARENT left is meaningful and still prints as "—"; a blank the PLATFORM
             * was going to fill and could not is not the parent's answer to anything. The captured
             * Admissions form carries an email `subject_line` of exactly this kind, and it opened
             * the family's completed application with a labelled dash.
             */
            const held = input.values[field.id];
            const empty = held === undefined || held === null || held === "";
            if (field.read_only === true && empty) continue;

            const question = presentableQuestion(field.label);
            const answer = displayAnswer(field, input.values[field.id]);
            if (answer !== "—") answeredCount += 1;
            // Question quiet, answer prominent — a completed record reads answer-first.
            reserve(9 * 1.38 + 11 * 1.38 + 8);
            draw(question, { font: body, size: 8.5, color: quiet, gap: 1 });
            draw(answer, { font: bold, size: 10.5, gap: 9 });
        }
        y -= 6;
    }

    // ── provenance footer, on every page ─────────────────────────────────────────────────────────
    const stamp = [
        `Form ${input.provenance.form_definition_version_id.slice(0, 8)}`,
        input.provenance.source_sha256 ? `source ${input.provenance.source_sha256.slice(0, 12)}` : null,
        GENERATED_DOCUMENT_COMPOSER_VERSION,
    ]
        .filter(Boolean)
        .join(" · ");
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
        p.drawText(toDrawable(`${stamp}    Page ${i + 1} of ${pages.length}`), {
            x: MARGIN.left,
            y: MARGIN.bottom - 26,
            size: 7,
            font: body,
            color: quiet,
        });
    });

    // Deterministic bytes: no creation date, no producer drift, so the same inputs hash the same.
    pdf.setTitle(toDrawable(input.schema.title));
    pdf.setCreationDate(new Date(0));
    pdf.setModificationDate(new Date(0));
    const bytes = await pdf.save({ useObjectStreams: false });

    return {
        bytes,
        pageCount: pages.length,
        signaturePlacements,
        answeredCount,
        acknowledgementCount,
        composerVersion: GENERATED_DOCUMENT_COMPOSER_VERSION,
        artifactSha256: createHash("sha256").update(bytes).digest("hex"),
    };
}
