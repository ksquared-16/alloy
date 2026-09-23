/**
 * The documentation reader, tested against the governed sources it will actually render.
 *
 * Two of these assertions are the reason the parser exists rather than a `<pre>`: frontmatter must
 * never reach an external reader, and a code example must survive byte-for-byte. The rest exercise
 * the constructs the canonical guides really use, read from the files themselves — a parser proven
 * only against handwritten fixtures is proven against the wrong document.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    parseBlocks,
    parseInline,
    parseMarkdownDocument,
    plainText,
    splitFrontmatter,
    type BlockNode,
} from "@/lib/developerDocs/markdown";

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(resolve(REPO, relative), "utf8");

const GETTING_STARTED = "docs/api/developer-platform/guide/README.md";
const CONVENTIONS = "docs/api/developer-platform/guide/conventions.md";
const LOCATIONS = "docs/api/developer-platform/guide/locations.md";

function flatten(blocks: BlockNode[]): BlockNode[] {
    return blocks.flatMap((b) =>
        b.type === "callout" ? [b, ...flatten(b.children)]
        : b.type === "list" ? [b, ...b.items.flatMap((i) => flatten(i.children))]
        : [b],
    );
}

describe("frontmatter never reaches the reader", () => {
    it("is removed from the body and returned separately", () => {
        const source = read(GETTING_STARTED);
        const { frontmatter, body } = splitFrontmatter(source);
        expect(frontmatter.owner).toBe("platform");
        expect(frontmatter.status).toBe("canonical");
        expect(body).not.toContain("owner: platform");
        expect(body).not.toContain("supersedes:");
        expect(body.trimStart().startsWith("#")).toBe(true);
    });

    it("no rendered text node of any governed guide carries a frontmatter key", () => {
        for (const file of [GETTING_STARTED, CONVENTIONS, LOCATIONS]) {
            const doc = parseMarkdownDocument(read(file));
            const text = flatten(doc.blocks)
                .map((b) =>
                    b.type === "code" ? b.value
                    : b.type === "paragraph" || b.type === "heading" ? plainText(b.children)
                    : "",
                )
                .join("\n");
            expect(text, file).not.toMatch(/^\s*last_reviewed:/m);
            expect(text, file).not.toMatch(/^\s*supersedes:/m);
        }
    });

    it("a document with no frontmatter is left alone", () => {
        const { frontmatter, body } = splitFrontmatter("# Title\n\nBody.\n");
        expect(frontmatter).toEqual({});
        expect(body).toBe("# Title\n\nBody.\n");
    });
});

describe("code examples survive exactly", () => {
    it("a fenced block is preserved byte-for-byte, including indentation and blank lines", () => {
        const source = [
            "```bash",
            "curl -s -X POST https://app.alloy.example/api/v1/oauth/token \\",
            '  -H "content-type: application/json" \\',
            '  -d \'{"grant_type":"client_credentials"}\'',
            "",
            "# second command",
            "```",
        ].join("\n");
        const [block] = parseBlocks(source);
        expect(block.type).toBe("code");
        expect(block).toMatchObject({ lang: "bash" });
        expect((block as Extract<BlockNode, { type: "code" }>).value).toBe(
            'curl -s -X POST https://app.alloy.example/api/v1/oauth/token \\\n  -H "content-type: application/json" \\\n  -d \'{"grant_type":"client_credentials"}\'\n\n# second command',
        );
    });

    it("every fenced block in the governed guides round-trips into the source it came from", () => {
        for (const file of [GETTING_STARTED, CONVENTIONS, LOCATIONS]) {
            const source = read(file);
            const codes = flatten(parseMarkdownDocument(source).blocks)
                .filter((b): b is Extract<BlockNode, { type: "code" }> => b.type === "code");
            expect(codes.length, `${file} has code examples`).toBeGreaterThan(0);
            for (const code of codes) {
                expect(source, `${file}: ${code.value.slice(0, 40)}`).toContain(code.value);
            }
        }
    });

    it("markdown punctuation inside a code span stays literal", () => {
        expect(parseInline("use `a**b**c` here")).toEqual([
            { type: "text", value: "use " },
            { type: "code", value: "a**b**c" },
            { type: "text", value: " here" },
        ]);
    });
});

describe("the constructs the governed guides use", () => {
    it("headings become a navigable outline with stable anchors", () => {
        const doc = parseMarkdownDocument(read(GETTING_STARTED));
        expect(doc.title).toBe("Alloy API — Getting Started");
        expect(doc.blocks.some((b) => b.type === "heading" && b.depth === 1)).toBe(false);
        expect(doc.outline.length).toBeGreaterThan(3);
        for (const entry of doc.outline) {
            expect(entry.id).toMatch(/^[a-z0-9-]+$/);
            expect(entry.text.length).toBeGreaterThan(0);
        }
        expect(new Set(doc.outline.map((o) => o.id)).size).toBe(doc.outline.length);
    });

    it("a blockquote becomes a callout, and the marker chooses the tone", () => {
        /*
         * Parser behaviour, proven on the parser's own input. This used to assert the tone by
         * finding a specific warning in the getting-started guide and matching its wording — so
         * the day that guide stopped warning about unimplemented endpoints, a passing parser
         * looked broken. A test of the renderer should not be a lock on what the documentation
         * currently says.
         */
        const [warning] = parseBlocks("> ## ⚠ Mind this\n>\n> Body text.");
        expect(warning).toMatchObject({ type: "callout", tone: "warning" });
        expect(plainText((warning as Extract<BlockNode, { type: "callout" }>).title ?? []))
            .toContain("Mind this");

        const [note] = parseBlocks("> ## Just so you know\n>\n> Body text.");
        expect(note).toMatchObject({ type: "callout", tone: "note" });
    });

    it("the getting-started guide still opens with a callout a reader cannot miss", () => {
        // Content-level expectation, kept separate from the parser's own contract above.
        const doc = parseMarkdownDocument(read(GETTING_STARTED));
        const callouts = doc.blocks.filter((b) => b.type === "callout");
        expect(callouts.length, "the orientation banner must survive as a callout").toBeGreaterThan(0);
    });

    it("lists parse, including nested items", () => {
        const [list] = parseBlocks("- one\n- two\n  - two a\n  - two b\n- three");
        expect(list.type).toBe("list");
        const items = (list as Extract<BlockNode, { type: "list" }>).items;
        expect(items).toHaveLength(3);
        const nested = items[1].children.find((c) => c.type === "list");
        expect(nested, "the sub-list belongs to its parent bullet").toBeTruthy();
        expect((nested as Extract<BlockNode, { type: "list" }>).items).toHaveLength(2);
    });

    it("ordered lists keep their starting number", () => {
        const [list] = parseBlocks("3. third\n4. fourth");
        expect(list).toMatchObject({ type: "list", ordered: true, start: 3 });
    });

    it("pipe tables parse into a head and rows", () => {
        const [table] = parseBlocks(
            "| Field | Type |\n| --- | --- |\n| `id` | string |\n| `label` | string |",
        );
        expect(table.type).toBe("table");
        const t = table as Extract<BlockNode, { type: "table" }>;
        expect(t.head.map(plainText)).toEqual(["Field", "Type"]);
        expect(t.rows).toHaveLength(2);
        expect(plainText(t.rows[0][0])).toBe("id");
    });

    it("links, bold and inline code parse together", () => {
        const nodes = parseInline("See [the spec](../openapi/a.json) for **exact** `limit` values.");
        expect(nodes.find((n) => n.type === "link")).toMatchObject({ href: "../openapi/a.json" });
        expect(nodes.find((n) => n.type === "strong")).toBeTruthy();
        expect(nodes.find((n) => n.type === "code")).toMatchObject({ value: "limit" });
    });

    it("an underscored identifier is not mistaken for emphasis", () => {
        expect(plainText(parseInline("`updated_since` and grant_type stay whole")))
            .toBe("updated_since and grant_type stay whole");
    });
});

describe("nothing authored is silently dropped", () => {
    it("every non-blank source line of the getting-started guide appears in the parsed tree", () => {
        const doc = parseMarkdownDocument(read(GETTING_STARTED));
        const rendered = flatten(doc.blocks)
            .map((b) =>
                b.type === "code" ? b.value
                : b.type === "heading" || b.type === "paragraph" ? plainText(b.children)
                : b.type === "callout" ? plainText(b.title ?? [])
                : b.type === "table" ? [...b.head, ...b.rows.flat()].map(plainText).join(" ")
                : "",
            )
            .join("\n");
        /*
         * A link renders its TEXT; the destination becomes an anchor target rather than prose. So
         * the source is reduced to what a reader actually sees before the comparison, otherwise the
         * URL inside `[text](url)` reads as a dropped sentence.
         */
        const visible = (s: string) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
        const normalize = (s: string) => s.replace(/[`*_>|[\]()#-]/g, "").replace(/\s+/g, " ").trim();
        const renderedText = normalize(`${doc.title ?? ""}\n${rendered}`);

        const missing = splitFrontmatter(read(GETTING_STARTED)).body
            .split("\n")
            .map((l) => normalize(visible(l)))
            .filter((l) => l.length > 24)
            .filter((l) => !renderedText.includes(l));
        expect(missing, "these authored lines would not reach the reader").toEqual([]);
    });
});
