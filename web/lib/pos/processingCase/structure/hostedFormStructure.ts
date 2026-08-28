/**
 * Hosted web form → DocumentStructureCandidate.
 *
 * The largest artifact in the real School of Enrichment packet is not a PDF. It is a hosted form on
 * formsite.com carrying 97 of the packet's 182 destinations and three of the four signatures a
 * parent gives. Converting it to a PDF to get it through the PDF importer would throw away the best
 * structural evidence in the whole packet — a hosted form declares its labels, its control types,
 * its requiredness and its allowed choices, none of which a PDF heuristic has to guess.
 *
 * So it is a reader, alongside AcroForm and native layout, and it reads a CAPTURE: HTML bytes
 * already stored as a document, with a hash. It never fetches anything. This is not a web scraper
 * and has no network access of any kind.
 *
 * Extraction is driven by STANDARD form semantics — `<label for>`, control types, `required`,
 * `<option>`, headings, radio/checkbox groups sharing a name — so it is not tied to one vendor's
 * markup. Two structural conventions are also honored where present, because signature widgets have
 * no standard element: a container class marking requiredness, and a `signature` container backed by
 * a hidden value input. Both are STRUCTURAL. No semantic binding is ever inferred from a class name
 * or a display label; Configuration Discovery proposes semantics afterwards, exactly as it does for
 * a PDF.
 *
 * Pure + deterministic. Parsing is a small hand-written scan rather than a DOM library: the input is
 * a static captured page, the subset needed is small, and the alternative was depending on a
 * transitive package that is not declared.
 */

import type {
    DocumentStructureCandidate,
    DocumentStructureField,
    DocumentStructureSection,
    StructureFieldType,
} from "./types";
import type { LogicalArtifact } from "./logicalArtifacts";
import { segmentLogicalArtifacts } from "./logicalArtifacts";

export const HOSTED_FORM_STRUCTURE_VERSION = "fp19.0-hosted-form";

/** Controls that hold no participant answer. */
const NON_DATA_INPUT_TYPES = new Set(["hidden", "submit", "button", "image", "reset"]);

/** Suffixes a signature widget appends to its hidden value inputs. */
const SIGNATURE_VALUE_SUFFIX = /_(svg|30|png|data)$/i;

export interface HostedFormCapture {
    /** The captured page bytes, as text. Never fetched here — always supplied by the caller. */
    html: string;
    /** The hosted form's own address, preserved as provenance. */
    sourceUri?: string | null;
}

// ── tiny deterministic scan helpers ──────────────────────────────────────────

function stripNonContent(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");
}

const ENTITIES: Record<string, string> = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘",
    ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…", times: "×", deg: "°",
};

export function decodeEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Drop the requiredness marker element from a prompt before reading its text. A red asterisk is
 * requiredness, not part of the question, and stripping it by element rather than by trailing
 * character also handles a label that puts something after it.
 */
function stripMarkerElements(fragment: string): string {
    return fragment.replace(/<(b|span|em|i|sup)\b[^>]*class="[^"]*\b(icon_)?required\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, " ");
}

/** Visible text of an HTML fragment, whitespace-normalized. */
export function visibleText(fragment: string): string {
    return decodeEntities(stripMarkerElements(fragment).replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
}

function attr(tag: string, name: string): string | null {
    const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag) ?? new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i").exec(tag);
    if (m) return m[1];
    return new RegExp(`\\b${name}\\b(?!\\s*=)`, "i").test(tag) ? "" : null;
}

function classList(tag: string): string[] {
    return (attr(tag, "class") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

// ── destinations ─────────────────────────────────────────────────────────────

interface RawDestination {
    /** Stable identity: the control's submitted name. */
    name: string;
    /** The item container's id when the markup carries one (a second stable handle). */
    containerId: string | null;
    type: StructureFieldType;
    label: string;
    required: boolean;
    options: string[];
    /** Validation the control declares (maxlength / pattern / min / max). */
    validate?: { pattern?: string; min?: number; max?: number; min_length?: number; max_length?: number };
    /** Byte offset in the stripped document — establishes source ORDER. */
    at: number;
    /** How the destination was recognized. */
    evidenceKind: "input" | "select" | "textarea" | "choice_group" | "signature" | "file";
}

/** All `<label for="…">` texts, keyed by the control id they point at. */
function labelsByFor(html: string): Map<string, string> {
    const out = new Map<string, string>();
    const re = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
        const f = attr(m[1], "for");
        if (f) out.set(f, visibleText(m[2]));
    }
    return out;
}

/**
 * A destination's prompt: the `<label for>` bound to it, else the nearest question-ish text before
 * it. A required marker inside the prompt is stripped — it is requiredness, not part of the wording.
 */
function promptBefore(html: string, at: number, forLabel: string | null): { label: string; required: boolean; containerId: string | null } {
    const lookback = html.slice(Math.max(0, at - 4000), at);

    // Requiredness belongs to the destination's OWN item container — the nearest opening <div>
    // before it. Widening that window lets the previous question's marker bleed onto this one and
    // makes every optional field look mandatory.
    const containers = [...lookback.matchAll(/<div\b([^>]*)>/gi)];
    const ownContainer = containers.length ? containers[containers.length - 1][1] : "";
    const containerId = attr(ownContainer, "id");
    const item = containers.length ? lookback.slice(containers[containers.length - 1].index ?? 0) : lookback;

    let label = forLabel ?? "";
    if (!label) {
        // Nearest preceding prompt element inside this item: a <label>, or an element whose class
        // marks it a question (a signature widget's prompt is a <span>, not a <label>).
        const promptRe = /<(label|span|div|p|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
        let m: RegExpExecArray | null;
        let best = "";
        while ((m = promptRe.exec(item))) {
            const cls = classList(m[2]);
            if (cls.some((c) => c.includes("question")) || m[1].toLowerCase() === "label") best = visibleText(m[3]);
        }
        label = best;
    }

    const required = classList(ownContainer).includes("required") || /class="[^"]*\bicon_required\b[^"]*"/i.test(item);
    const cleaned = label.replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim();
    return { label: cleaned, required, containerId: containerId || null };
}

/** Validation the control itself declares. Only what is written; nothing inferred. */
function declaredValidation(tag: string): RawDestination["validate"] {
    const num = (name: string): number | undefined => {
        const raw = attr(tag, name);
        if (raw === null || raw.trim() === "") return undefined;
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
    };
    const pattern = attr(tag, "pattern");
    const out = {
        ...(pattern ? { pattern } : {}),
        ...(num("min") !== undefined ? { min: num("min") } : {}),
        ...(num("max") !== undefined ? { max: num("max") } : {}),
        ...(num("minlength") !== undefined ? { min_length: num("minlength") } : {}),
        ...(num("maxlength") !== undefined ? { max_length: num("maxlength") } : {}),
    };
    return Object.keys(out).length ? out : undefined;
}

function inputType(tag: string): StructureFieldType {
    const t = (attr(tag, "type") ?? "text").toLowerCase();
    if (t === "date") return "date";
    if (t === "number") return "number";
    if (t === "file") return "file";
    if (t === "checkbox" || t === "radio") return "checkbox";
    return "text";
}

/** Count every control element in the capture, before radio/checkbox groups collapse into one. */
export function countRawControls(html: string): number {
    let n = 0;
    const inputRe = /<input\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = inputRe.exec(html))) {
        const type = (attr(m[1], "type") ?? "text").toLowerCase();
        const name = attr(m[1], "name") ?? "";
        if (!name || NON_DATA_INPUT_TYPES.has(type)) continue;
        n += 1;
    }
    n += [...html.matchAll(/<select\b[^>]*name="/gi)].length;
    n += [...html.matchAll(/<textarea\b[^>]*name="/gi)].length;
    n += [...html.matchAll(/<div\b[^>]*class="[^"]*\bsignature\b(?![^"]*clear)[^"]*"/gi)].length;
    return n;
}

function collectDestinations(html: string): RawDestination[] {
    const forLabels = labelsByFor(html);
    const out: RawDestination[] = [];
    const claimedChoiceNames = new Set<string>();

    // ── inputs ──
    const inputRe = /<input\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = inputRe.exec(html))) {
        const tag = m[1];
        const type = (attr(tag, "type") ?? "text").toLowerCase();
        const name = attr(tag, "name") ?? "";
        if (!name || NON_DATA_INPUT_TYPES.has(type)) continue;

        if (type === "checkbox" || type === "radio") {
            if (claimedChoiceNames.has(name)) continue;
            claimedChoiceNames.add(name);
            // Every control sharing this name is one option of ONE question.
            const options: string[] = [];
            const optRe = new RegExp(`<input\\b[^>]*name="${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"[^>]*>`, "gi");
            let o: RegExpExecArray | null;
            while ((o = optRe.exec(html))) {
                const id = attr(o[0], "id");
                const text = id ? forLabels.get(id) : null;
                options.push(text || attr(o[0], "value") || "");
            }
            const prompt = promptBefore(html, m.index, null);
            out.push({
                name,
                containerId: prompt.containerId,
                type: "select",
                label: prompt.label,
                required: prompt.required,
                options: options.filter(Boolean),
                at: m.index,
                evidenceKind: "choice_group",
            });
            continue;
        }

        const id = attr(tag, "id");
        const prompt = promptBefore(html, m.index, id ? (forLabels.get(id) ?? null) : null);
        const validate = declaredValidation(tag);
        out.push({
            name,
            containerId: prompt.containerId,
            type: inputType(tag),
            label: prompt.label,
            required: prompt.required || attr(tag, "required") !== null,
            options: [],
            ...(validate ? { validate } : {}),
            at: m.index,
            evidenceKind: type === "file" ? "file" : "input",
        });
    }

    // ── selects ──
    const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
    while ((m = selRe.exec(html))) {
        const name = attr(m[1], "name") ?? "";
        if (!name) continue;
        const id = attr(m[1], "id");
        const prompt = promptBefore(html, m.index, id ? (forLabels.get(id) ?? null) : null);
        const options = [...m[2].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => visibleText(o[1])).filter(Boolean);
        out.push({
            name,
            containerId: prompt.containerId,
            type: "select",
            label: prompt.label,
            required: prompt.required || attr(m[1], "required") !== null,
            options,
            at: m.index,
            evidenceKind: "select",
        });
    }

    // ── textareas ──
    const taRe = /<textarea\b([^>]*)>[\s\S]*?<\/textarea>/gi;
    while ((m = taRe.exec(html))) {
        const name = attr(m[1], "name") ?? "";
        if (!name) continue;
        const id = attr(m[1], "id");
        const prompt = promptBefore(html, m.index, id ? (forLabels.get(id) ?? null) : null);
        out.push({
            name, containerId: prompt.containerId, type: "text", label: prompt.label,
            required: prompt.required, options: [], at: m.index, evidenceKind: "textarea",
        });
    }

    // ── signature widgets ──
    // A signature has no standard element. What it does have is a container marked `signature`
    // backed by hidden value inputs — the widget's own structure, not a styling choice.
    const sigRe = /<div\b([^>]*)>/gi;
    while ((m = sigRe.exec(html))) {
        const cls = classList(m[1]);
        if (!cls.includes("signature")) continue;
        if (cls.some((c) => c.includes("clear"))) continue; // the widget's own "clear" control
        const before = html.slice(Math.max(0, m.index - 1200), m.index);
        const hidden = [...before.matchAll(/<input\b[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*>/gi)].map((h) => h[1]);
        const valueInput = hidden.reverse().find((n) => SIGNATURE_VALUE_SUFFIX.test(n));
        const name = valueInput ? valueInput.replace(SIGNATURE_VALUE_SUFFIX, "") : `signature_at_${m.index}`;
        if (out.some((d) => d.name === name && d.type === "signature")) continue;
        const prompt = promptBefore(html, m.index, null);
        out.push({
            name, containerId: prompt.containerId, type: "signature", label: prompt.label || "Signature",
            required: prompt.required, options: [], at: m.index, evidenceKind: "signature",
        });
    }

    // Hidden inputs that only exist to carry a signature's value are not separate destinations.
    const signatureNames = new Set(out.filter((d) => d.type === "signature").map((d) => d.name));
    return out
        .filter((d) => !(SIGNATURE_VALUE_SUFFIX.test(d.name) && signatureNames.has(d.name.replace(SIGNATURE_VALUE_SUFFIX, ""))))
        .sort((a, b) => a.at - b.at);
}

// ── sections + instructional content ─────────────────────────────────────────

interface RawHeading {
    title: string;
    at: number;
    /** Instruction text the author wrote into the heading — kept as prose, never dropped. */
    overflow?: string | null;
}

/**
 * A heading is a name, but authors write instructions into them. Keep the naming clause as the
 * section title and let the rest travel as prose — no words are lost either way.
 */
const MAX_SECTION_TITLE = 72;

export function headingTitleAndOverflow(text: string): { title: string; overflow: string | null } {
    if (text.length <= MAX_SECTION_TITLE) return { title: text, overflow: null };
    const cut = /^(.{10,72}?)(?:[:.]\s+|\s+—\s+)([\s\S]+)$/.exec(text);
    if (cut) return { title: cut[1].trim(), overflow: cut[2].trim() };
    const space = text.lastIndexOf(" ", MAX_SECTION_TITLE);
    return space > 10
        ? { title: text.slice(0, space).trim(), overflow: text.slice(space).trim() }
        : { title: text.slice(0, MAX_SECTION_TITLE), overflow: text.slice(MAX_SECTION_TITLE) };
}

function collectHeadings(html: string): RawHeading[] {
    const out: RawHeading[] = [];
    const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
        const text = visibleText(m[2]);
        if (!text) continue;
        const { title, overflow } = headingTitleAndOverflow(text);
        out.push({ title, at: m.index, overflow });
    }
    return out;
}

/**
 * Prose that belongs to a section and is not a control's prompt: policy paragraphs, instructions,
 * consent text. Clause-level discovery reads this the same way it reads a PDF page's prose.
 */
function sectionProse(slice: string, promptLabels: Set<string>): string | null {
    const blocks: string[] = [];
    const re = /<(p|div|span|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(slice))) {
        if (/<(input|select|textarea)\b/i.test(m[3])) continue; // a container, not a text block
        const text = visibleText(m[3]);
        if (text.length < 24) continue;
        if (promptLabels.has(text)) continue;
        if (blocks.includes(text)) continue;
        blocks.push(text);
    }
    return blocks.length ? blocks.join("\n") : null;
}

// ── main ─────────────────────────────────────────────────────────────────────

export interface HostedFormStructureResult extends DocumentStructureCandidate {
    /** Present when the capture was readable as a form. */
    hosted_form?: {
        source_uri: string | null;
        /** Normalized destinations — what the packet addresses. */
        destination_count: number;
        /**
         * Raw controls and widgets in the capture, before normalization. A Yes/No question is two
         * checkbox elements and ONE destination; reporting only the normalized figure would make
         * the difference look like loss.
         */
        raw_control_count: number;
        version: string;
    };
}

/**
 * Read a captured hosted form. Honest when the capture is not one: a page with no data controls
 * yields an empty candidate with a reason, never invented fields.
 */
export function detectHostedFormStructure(capture: HostedFormCapture): HostedFormStructureResult {
    const html = stripNonContent(capture.html ?? "");
    const empty = (reason: string): HostedFormStructureResult => ({
        sections: [],
        warnings: [reason],
        diagnostics: {
            text_length: html.length, line_count: 0, candidate_labels: 0, section_headers: [],
            rejected_examples: [], rejected_headers: [], detected_known_labels: [],
            confidence_summary: { high: 0, medium: 0, low: 0 }, quality: "failed",
        },
    });
    if (!html.trim()) return empty("empty_capture");

    const destinations = collectDestinations(html);
    if (destinations.length === 0) return empty("no_form_controls_found");

    const headings = collectHeadings(html);
    const promptLabels = new Set(destinations.map((d) => d.label).filter(Boolean));

    // Sections are heading-delimited spans in source order. A destination before the first heading
    // belongs to an opening section named from the document's own title when it has one.
    const bounds: Array<{ title: string; start: number; end: number; overflow?: string | null }> = [];
    if (headings.length === 0 || headings[0].at > destinations[0].at) {
        bounds.push({ title: headings[0]?.title ?? "Form", start: 0, end: headings[0]?.at ?? html.length });
    }
    for (let i = 0; i < headings.length; i += 1) {
        bounds.push({ title: headings[i].title, start: headings[i].at, end: headings[i + 1]?.at ?? html.length, overflow: headings[i].overflow });
    }

    const sections: DocumentStructureSection[] = [];
    for (const b of bounds) {
        const inSection = destinations.filter((d) => d.at >= b.start && d.at < b.end);
        const sectionText = sectionProse(html.slice(b.start, b.end), promptLabels);
        const prose = [b.overflow, sectionText].filter(Boolean).join("\n") || null;
        if (inSection.length === 0 && !prose) continue;
        const fields: DocumentStructureField[] = inSection.map((d) => ({
            label: d.label || d.name,
            suggested_type: d.type,
            required: d.required,
            confidence: d.label ? "high" : "low",
            evidence: `hosted_form:${d.containerId ? `${d.containerId}:` : ""}${d.name}`,
            page: 1,
            ...(d.options.length ? { options: d.options } : {}),
            ...(d.validate ? { validate: d.validate } : {}),
        }));
        sections.push({
            title: b.title,
            confidence: "high",
            page: 1,
            // A hosted form section collects. Its prose is evidence for the concepts inside it —
            // the same rule the AcroForm reader follows.
            disposition: "fields",
            static_text: prose,
            fields,
        });
    }

    const artifacts: LogicalArtifact[] = segmentLogicalArtifacts(
        sections.map((s, i) => ({
            title: s.title,
            index: i,
            destinations: s.fields.map((f) => ({ id: f.evidence ?? f.label, type: f.suggested_type, label: f.label })),
        }))
    );

    return {
        sections,
        warnings: [],
        ...(artifacts.length ? { logical_artifacts: artifacts } : {}),
        hosted_form: {
            source_uri: capture.sourceUri ?? null,
            destination_count: destinations.length,
            raw_control_count: countRawControls(html),
            version: HOSTED_FORM_STRUCTURE_VERSION,
        },
        diagnostics: {
            text_length: html.length,
            line_count: sections.length,
            candidate_labels: destinations.length,
            section_headers: sections.map((s) => s.title),
            rejected_examples: [],
            rejected_headers: [],
            detected_known_labels: [],
            confidence_summary: {
                high: destinations.filter((d) => d.label).length,
                medium: 0,
                low: destinations.filter((d) => !d.label).length,
            },
            quality: destinations.length > 0 ? "strong" : "failed",
        },
    };
}
