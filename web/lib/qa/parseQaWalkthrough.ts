/**
 * Parse the Real Enrollment QA walkthrough into blocks a reader can render.
 *
 * ## Why a closed parser and not a markdown library
 *
 * This renders exactly ONE document, whose constructs are known and finite: headings, tables,
 * blockquotes, ordered and unordered lists, rules, inline code and emphasis. There are no links in
 * it. A general markdown pipeline would be a dependency and an HTML-injection surface for a page
 * whose only job is to let an operator read a QA script beside the product.
 *
 * The document stays the single source of truth. This only decides how its lines are grouped, so a
 * change to the certification document appears on the page without anyone maintaining a copy.
 *
 * Pure. No I/O, no HTML — the caller renders React from these blocks, so nothing here can inject
 * markup.
 */

export type QaInline =
    | { kind: "text"; text: string }
    | { kind: "strong"; text: string }
    | { kind: "em"; text: string }
    | { kind: "code"; text: string };

export type QaBlock =
    /** `#`/`##`/`###`. `slug` is the anchor id, e.g. "part-d". */
    | { kind: "heading"; level: 1 | 2 | 3; text: string; slug: string }
    /** A numbered QA step. `label` is e.g. "A1", `verb` is DO or EXPECT. */
    | { kind: "step"; label: string; verb: "DO" | "EXPECT"; body: QaInline[] }
    /** A bare EXPECT continuing the step above it. */
    | { kind: "expect"; body: QaInline[] }
    /** A callout. `stop` marks the ones that halt QA. */
    | { kind: "note"; stop: boolean; lines: QaInline[][] }
    | { kind: "paragraph"; body: QaInline[] }
    | { kind: "list"; ordered: boolean; items: QaInline[][] }
    | { kind: "table"; head: string[]; rows: string[][] }
    | { kind: "rule" };

/** Heading → anchor id. "PART D — Open the QA child" becomes "part-d". */
export function slugForHeading(text: string): string {
    const part = text.match(/^PART\s+([A-G])\b/i);
    if (part) return `part-${part[1]!.toLowerCase()}`;
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}

/** Emphasis and code spans. Deliberately non-nesting — the document never nests them. */
export function parseInline(raw: string): QaInline[] {
    const out: QaInline[] = [];
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
        if (m.index > last) out.push({ kind: "text", text: raw.slice(last, m.index) });
        if (m[1] !== undefined) out.push({ kind: "strong", text: m[1] });
        else if (m[2] !== undefined) out.push({ kind: "code", text: m[2] });
        else if (m[3] !== undefined) out.push({ kind: "em", text: m[3] });
        last = re.lastIndex;
    }
    if (last < raw.length) out.push({ kind: "text", text: raw.slice(last) });
    return out.length ? out : [{ kind: "text", text: raw }];
}

const TABLE_DIVIDER = /^\|[\s:|-]+\|$/;
const cells = (line: string) =>
    line
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());

export function parseQaWalkthrough(markdown: string): QaBlock[] {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const blocks: QaBlock[] = [];
    let i = 0;

    const flushParagraph = (buf: string[]) => {
        if (!buf.length) return;
        const joined = buf.join(" ").trim();
        if (joined) blocks.push({ kind: "paragraph", body: parseInline(joined) });
        buf.length = 0;
    };

    let para: string[] = [];

    while (i < lines.length) {
        const line = lines[i]!;
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph(para);
            i += 1;
            continue;
        }

        // Rule
        if (/^---+$/.test(trimmed)) {
            flushParagraph(para);
            blocks.push({ kind: "rule" });
            i += 1;
            continue;
        }

        // Heading
        const h = trimmed.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
            flushParagraph(para);
            const text = h[2]!.trim();
            blocks.push({
                kind: "heading",
                level: h[1]!.length as 1 | 2 | 3,
                text,
                slug: slugForHeading(text),
            });
            i += 1;
            continue;
        }

        // Table: a header row followed by a divider row.
        if (trimmed.startsWith("|") && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1]!.trim())) {
            flushParagraph(para);
            const head = cells(trimmed);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && lines[i]!.trim().startsWith("|")) {
                rows.push(cells(lines[i]!.trim()));
                i += 1;
            }
            blocks.push({ kind: "table", head, rows });
            continue;
        }

        // Callout — consecutive `> ` lines. A STOP note is the one that halts QA.
        if (trimmed.startsWith(">")) {
            flushParagraph(para);
            const raw: string[] = [];
            while (i < lines.length && lines[i]!.trim().startsWith(">")) {
                raw.push(lines[i]!.trim().replace(/^>\s?/, ""));
                i += 1;
            }
            // Blank `>` lines separate paragraphs inside one callout.
            const groups: string[][] = [[]];
            for (const r of raw) {
                if (!r.trim()) groups.push([]);
                else groups[groups.length - 1]!.push(r);
            }
            const lineSets = groups.filter((g) => g.length).map((g) => parseInline(g.join(" ")));
            blocks.push({ kind: "note", stop: /\bSTOP\b/.test(raw.join(" ")), lines: lineSets });
            continue;
        }

        // A numbered step: "**A1. DO** — ..." or "**E3. EXPECT** — ...".
        const step = trimmed.match(/^\*\*([A-G]\d+)\.\s*(DO|EXPECT)\*\*\s*(?:—|-)?\s*(.*)$/);
        if (step) {
            flushParagraph(para);
            const body: string[] = [step[3]!];
            i += 1;
            // Continuation lines belong to the step until a blank line or the next marker.
            while (i < lines.length) {
                const n = lines[i]!.trim();
                if (!n || n.startsWith(">") || n.startsWith("|") || /^(#{1,3})\s/.test(n) || /^---+$/.test(n)) break;
                if (/^\*\*([A-G]\d+)\.\s*(DO|EXPECT)\*\*/.test(n) || /^\*\*EXPECT\*\*/.test(n)) break;
                body.push(n);
                i += 1;
            }
            blocks.push({
                kind: "step",
                label: step[1]!,
                verb: step[2] as "DO" | "EXPECT",
                body: parseInline(body.join(" ").trim()),
            });
            continue;
        }

        // A bare EXPECT continuing the step above.
        const expect = trimmed.match(/^\*\*EXPECT\*\*\s*(?:—|-)?\s*(.*)$/);
        if (expect) {
            flushParagraph(para);
            const body: string[] = [expect[1]!];
            i += 1;
            while (i < lines.length) {
                const n = lines[i]!.trim();
                if (!n || n.startsWith(">") || n.startsWith("|") || /^(#{1,3})\s/.test(n) || /^---+$/.test(n)) break;
                if (/^\*\*([A-G]\d+)\./.test(n) || /^\*\*EXPECT\*\*/.test(n)) break;
                body.push(n);
                i += 1;
            }
            blocks.push({ kind: "expect", body: parseInline(body.join(" ").trim()) });
            continue;
        }

        // Lists
        const li = trimmed.match(/^(?:[-*]\s+|(\d+)\.\s+)(.*)$/);
        if (li) {
            flushParagraph(para);
            const ordered = li[1] !== undefined;
            const items: QaInline[][] = [];
            while (i < lines.length) {
                const n = lines[i]!.trim();
                const m2 = n.match(/^(?:[-*]\s+|(\d+)\.\s+)(.*)$/);
                if (!m2 || (m2[1] !== undefined) !== ordered) break;
                items.push(parseInline(m2[2]!));
                i += 1;
            }
            blocks.push({ kind: "list", ordered, items });
            continue;
        }

        para.push(trimmed);
        i += 1;
    }

    flushParagraph(para);
    return blocks;
}
