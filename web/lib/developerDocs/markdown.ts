/**
 * A Markdown reader for the governed Developer Platform documentation.
 *
 * WHY THIS EXISTS RATHER THAN A DEPENDENCY. The product must render the canonical Markdown, not a
 * second copy of it — so something has to parse it. What that something must guarantee here is
 * narrow and unusual: frontmatter must never reach an external reader, code examples must survive
 * byte-for-byte, and nothing in an authored document may become markup the browser executes. This
 * parser produces a typed tree and never HTML, so the React renderer escapes every text node as a
 * matter of course; there is no `dangerouslySetInnerHTML` anywhere in the path and no sanitiser to
 * get wrong.
 *
 * It reads the subset the governed sources actually use — headings, paragraphs, lists, fenced code,
 * GFM tables, blockquote callouts, rules, and inline emphasis/code/links. Anything it does not
 * recognise degrades to a paragraph of text rather than disappearing: an unrendered sentence is a
 * documentation defect, and silence is how those ship.
 */

export type InlineNode =
    | { type: "text"; value: string }
    | { type: "code"; value: string }
    | { type: "strong"; children: InlineNode[] }
    | { type: "emphasis"; children: InlineNode[] }
    | { type: "link"; href: string; children: InlineNode[] };

export type ListItem = { children: BlockNode[] };

export type BlockNode =
    | { type: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; id: string; children: InlineNode[] }
    | { type: "paragraph"; children: InlineNode[] }
    | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
    | { type: "code"; lang: string | null; value: string }
    | { type: "table"; head: InlineNode[][]; rows: InlineNode[][][] }
    | { type: "callout"; tone: CalloutTone; title: InlineNode[] | null; children: BlockNode[] }
    | { type: "rule" };

export type CalloutTone = "warning" | "note";

export type MarkdownDocument = {
    /** Parsed YAML-ish frontmatter. Authority metadata — never rendered as document body. */
    frontmatter: Record<string, string>;
    /** The first level-1 heading, which is the document's own title. */
    title: string | null;
    /** Body blocks, with the title heading removed so a page can own its own header. */
    blocks: BlockNode[];
    /** Level 2 and 3 headings, in document order, for a table of contents. */
    outline: { depth: 2 | 3; id: string; text: string }[];
};

/**
 * Split frontmatter from body.
 *
 * Deliberately the FIRST thing that happens to any source, and the only place the two are ever both
 * in scope. `owner`, `status`, `classification` and `last_reviewed` are governance facts about the
 * document; an external developer reading `supersedes: []` learns nothing and trusts Alloy less.
 */
export function splitFrontmatter(source: string): { frontmatter: Record<string, string>; body: string } {
    const normalized = source.replace(/\r\n/g, "\n");
    if (!normalized.startsWith("---\n")) return { frontmatter: {}, body: normalized };
    const end = normalized.indexOf("\n---", 3);
    if (end === -1) return { frontmatter: {}, body: normalized };

    const raw = normalized.slice(4, end);
    const frontmatter: Record<string, string> = {};
    for (const line of raw.split("\n")) {
        const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (match) frontmatter[match[1]] = match[2].trim();
    }
    const bodyStart = normalized.indexOf("\n", end + 1);
    return { frontmatter, body: bodyStart === -1 ? "" : normalized.slice(bodyStart + 1) };
}

/** A stable anchor for a heading, so a table of contents and a deep link agree. */
export function headingId(text: string): string {
    return text
        .toLowerCase()
        .replace(/`/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        || "section";
}

const FENCE = /^(?:\s{0,3})(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/;

/** Block-level parse. Operates on already-frontmatter-free text. */
export function parseBlocks(body: string): BlockNode[] {
    const lines = body.replace(/\r\n/g, "\n").split("\n");
    const blocks: BlockNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === "") { i += 1; continue; }

        // Fenced code. Everything between the fences is preserved exactly — no trimming, no
        // re-indentation, no entity substitution. A copied example that does not run is worse
        // than no example.
        const fence = FENCE.exec(line);
        if (fence) {
            const [, marker, lang] = fence;
            const collected: string[] = [];
            i += 1;
            while (i < lines.length && !new RegExp(`^\\s{0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) {
                collected.push(lines[i]);
                i += 1;
            }
            i += 1; // closing fence (or end of input)
            blocks.push({ type: "code", lang: lang || null, value: collected.join("\n") });
            continue;
        }

        if (/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
            blocks.push({ type: "rule" });
            i += 1;
            continue;
        }

        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            const depth = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
            const text = heading[2].replace(/\s+#+\s*$/, "").trim();
            blocks.push({ type: "heading", depth, id: headingId(plainText(parseInline(text))), children: parseInline(text) });
            i += 1;
            continue;
        }

        // Blockquote → callout. The governed guides use `> ## ⚠ …` for the things a reader must not
        // miss, so the leading marker chooses the tone rather than a class somebody remembers to add.
        if (/^\s{0,3}>/.test(line)) {
            const quoted: string[] = [];
            while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (quoted.length > 0 && lines[i].trim() !== "" && !/^#{1,6}\s/.test(lines[i])))) {
                quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
                i += 1;
            }
            const inner = parseBlocks(quoted.join("\n"));
            const first = inner[0];
            let title: InlineNode[] | null = null;
            let children = inner;
            if (first && first.type === "heading") {
                title = first.children;
                children = inner.slice(1);
            }
            const titleText = title ? plainText(title) : "";
            blocks.push({
                type: "callout",
                tone: /⚠|warning|not safe|do not/i.test(titleText) ? "warning" : "note",
                title,
                children,
            });
            continue;
        }

        // GFM table: a header row followed by a delimiter row.
        if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
            const head = splitRow(line).map(parseInline);
            i += 2;
            const rows: InlineNode[][][] = [];
            while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
                rows.push(splitRow(lines[i]).map(parseInline));
                i += 1;
            }
            blocks.push({ type: "table", head, rows });
            continue;
        }

        if (listMarker(line)) {
            const { list, next } = parseList(lines, i);
            blocks.push(list);
            i = next;
            continue;
        }

        // Paragraph: consecutive lines until something else starts.
        const paragraph: string[] = [];
        while (
            i < lines.length
            && lines[i].trim() !== ""
            && !/^#{1,6}\s/.test(lines[i])
            && !FENCE.test(lines[i])
            && !/^\s{0,3}>/.test(lines[i])
            && !listMarker(lines[i])
            && !/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(lines[i])
        ) {
            paragraph.push(lines[i].trim());
            i += 1;
        }
        if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
    }

    return blocks;
}

function splitRow(line: string): string[] {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function listMarker(line: string): { indent: number; ordered: boolean; start: number; rest: string } | null {
    const unordered = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (unordered) return { indent: unordered[1].length, ordered: false, start: 1, rest: unordered[2] };
    const ordered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (ordered) return { indent: ordered[1].length, ordered: true, start: Number(ordered[2]), rest: ordered[3] };
    return null;
}

/**
 * One list, including nested lists and the continuation lines of an item.
 *
 * Nesting is decided by indentation against the FIRST item's indent, so a sub-list keeps its
 * relationship to the bullet above it. The governed request-contract guide leans on this.
 */
function parseList(lines: string[], start: number): { list: Extract<BlockNode, { type: "list" }>; next: number } {
    const first = listMarker(lines[start])!;
    const items: ListItem[] = [];
    let i = start;
    let current: string[] | null = null;

    const flush = () => {
        if (current) items.push({ children: parseBlocks(current.join("\n")) });
        current = null;
    };

    while (i < lines.length) {
        const marker = listMarker(lines[i]);
        if (marker && marker.indent <= first.indent && marker.ordered === first.ordered) {
            flush();
            current = [marker.rest];
            i += 1;
            continue;
        }
        if (current === null) break;
        if (lines[i].trim() === "") {
            // A blank line ends the list unless the next line is still inside it.
            const following = lines[i + 1];
            if (!following || (!listMarker(following) && !/^\s{2,}\S/.test(following))) break;
            current.push("");
            i += 1;
            continue;
        }
        const indented = /^(\s{2,})(.*)$/.exec(lines[i]);
        if (indented) {
            // Strip exactly one level so nested markers are seen at column zero by the recursion.
            current.push(lines[i].slice(Math.min(indented[1].length, first.indent + 2)));
            i += 1;
            continue;
        }
        if (marker) { flush(); current = [marker.rest]; i += 1; continue; }
        current.push(lines[i].trim()); // lazy continuation
        i += 1;
    }
    flush();

    return { list: { type: "list", ordered: first.ordered, start: first.start, items }, next: i };
}

/**
 * Inline parse.
 *
 * Code spans are taken FIRST and never re-scanned, so `**` inside a code span stays literal — which
 * matters when the documentation is about an API whose examples contain punctuation.
 */
export function parseInline(text: string): InlineNode[] {
    const out: InlineNode[] = [];
    let rest = text;

    const pushText = (value: string) => {
        if (!value) return;
        const last = out[out.length - 1];
        if (last && last.type === "text") last.value += value;
        else out.push({ type: "text", value });
    };

    while (rest.length > 0) {
        const code = /^([\s\S]*?)(`+)([\s\S]*?)\2/.exec(rest);
        const strong = /^([\s\S]*?)\*\*([\s\S]+?)\*\*/.exec(rest);
        const emphasis = /^([\s\S]*?)(?<![*\w])\*([^*\n]+?)\*(?!\*)/.exec(rest);
        const link = /^([\s\S]*?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);

        const candidates = [
            code && { at: code[1].length, kind: "code" as const, match: code },
            strong && { at: strong[1].length, kind: "strong" as const, match: strong },
            emphasis && { at: emphasis[1].length, kind: "emphasis" as const, match: emphasis },
            link && { at: link[1].length, kind: "link" as const, match: link },
        ].filter(Boolean) as { at: number; kind: "code" | "strong" | "emphasis" | "link"; match: RegExpExecArray }[];

        if (candidates.length === 0) { pushText(rest); break; }

        candidates.sort((a, b) => a.at - b.at || rank(a.kind) - rank(b.kind));
        const chosen = candidates[0];
        pushText(rest.slice(0, chosen.at));

        if (chosen.kind === "code") {
            out.push({ type: "code", value: chosen.match[3] });
        } else if (chosen.kind === "strong") {
            out.push({ type: "strong", children: parseInline(chosen.match[2]) });
        } else if (chosen.kind === "emphasis") {
            out.push({ type: "emphasis", children: parseInline(chosen.match[2]) });
        } else {
            out.push({ type: "link", href: chosen.match[3], children: parseInline(chosen.match[2] || chosen.match[3]) });
        }
        rest = rest.slice(chosen.match[0].length);
    }

    return out;
}

/** Code wins ties: a span that starts where an emphasis starts is a span. */
function rank(kind: string): number {
    return kind === "code" ? 0 : kind === "link" ? 1 : kind === "strong" ? 2 : 3;
}

export function plainText(nodes: InlineNode[]): string {
    return nodes
        .map((n) =>
            n.type === "text" ? n.value
            : n.type === "code" ? n.value
            : "children" in n ? plainText(n.children)
            : "",
        )
        .join("");
}

/** Parse a whole governed source into the shape a page renders. */
export function parseMarkdownDocument(source: string): MarkdownDocument {
    const { frontmatter, body } = splitFrontmatter(source);
    const blocks = parseBlocks(body);

    let title: string | null = null;
    const withoutTitle = [...blocks];
    const firstHeadingIndex = withoutTitle.findIndex((b) => b.type === "heading" && b.depth === 1);
    if (firstHeadingIndex !== -1) {
        const heading = withoutTitle[firstHeadingIndex] as Extract<BlockNode, { type: "heading" }>;
        title = plainText(heading.children);
        withoutTitle.splice(firstHeadingIndex, 1);
    }

    const outline = withoutTitle
        .filter((b): b is Extract<BlockNode, { type: "heading" }> => b.type === "heading" && (b.depth === 2 || b.depth === 3))
        .map((b) => ({ depth: b.depth as 2 | 3, id: b.id, text: plainText(b.children) }));

    return { frontmatter, title, blocks: withoutTitle, outline };
}
