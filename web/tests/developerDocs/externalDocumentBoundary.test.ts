/**
 * What a partner engineer is allowed to read.
 *
 * Two documents were being published that should never have been: `02-identity-installation-
 * credential.md` and `03-authorization-scopes-boundaries.md` are internal doctrine. They name
 * security findings by identifier, cite Threads and pull request numbers, and describe work in
 * phase language. All of it is accurate; none of it is for an external developer, and a security
 * finding identifier in partner-facing documentation is the kind of detail that is quoted back
 * years later.
 *
 * The published set is now the four partner-safe documents, and these assertions are what keeps a
 * fifth from arriving by being convenient.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DOCUMENTATION_SECTIONS, loadDocument } from "@/lib/developerDocs/documentationSources";
import { GOVERNED_DOCUMENT_SOURCES } from "@/lib/developerDocs/governedDocuments.generated";
import { plainText, type BlockNode } from "@/lib/developerDocs/markdown";

const REPO = resolve(__dirname, "../../..");

/** Language that means "this was written for Alloy, about Alloy's own delivery". */
const INTERNAL_MARKERS: [string, RegExp][] = [
    ["a Thread reference", /\bThread \d/],
    ["a Slice reference", /\bSlice [A-Z]\d?\b/],
    ["a security finding identifier", /\bSEC-\d/],
    ["delivery phase language", /\bPhase [A-Z]\b/],
    ["a pull request number", /\bPR #\d+/],
    ["sprint language", /\bsprint\b/i],
    ["a source path", /\bweb\/lib\/|\bsupabase\/migrations\//],
    ["a repository-relative document path", /\.\.\/[\w./-]*\.md/],
];

/** Every string a reader can actually see, including code blocks and tables. */
function visibleText(blocks: BlockNode[]): string {
    return blocks
        .map((block) => {
            switch (block.type) {
                case "heading":
                case "paragraph":
                    return plainText(block.children);
                case "code":
                    return block.value;
                case "callout":
                    return `${plainText(block.title ?? [])}\n${visibleText(block.children)}`;
                case "list":
                    return block.items.map((item) => visibleText(item.children)).join("\n");
                case "table":
                    return [...block.head, ...block.rows.flat()].map(plainText).join(" ");
                default:
                    return "";
            }
        })
        .join("\n");
}

describe("the internal doctrine documents are not published", () => {
    for (const file of [
        "docs/api/developer-platform/02-identity-installation-credential.md",
        "docs/api/developer-platform/03-authorization-scopes-boundaries.md",
    ]) {
        it(`${file.split("/").pop()} is neither registered nor embedded`, () => {
            expect(DOCUMENTATION_SECTIONS.map((s) => s.file)).not.toContain(file);
            expect(Object.keys(GOVERNED_DOCUMENT_SOURCES)).not.toContain(file);
        });
    }

    it("they really do contain what disqualifies them — this is measured, not assumed", () => {
        const source = readFileSync(
            resolve(REPO, "docs/api/developer-platform/02-identity-installation-credential.md"),
            "utf8",
        );
        expect(source).toMatch(/SEC-\d/);
        expect(source).toMatch(/Thread \d/);
    });

    it("the questions they answered are still answerable", () => {
        // Authentication, scopes and boundaries are covered by the partner-safe specification.
        const specification = loadDocument("specification");
        expect(specification).not.toBeNull();
        const text = visibleText(specification!.document.blocks);
        expect(text).toMatch(/authentication/i);
        expect(text).toMatch(/scope/i);
        expect(text).toMatch(/boundar/i);
    });
});

describe("nothing published carries internal language", () => {
    for (const section of DOCUMENTATION_SECTIONS) {
        it(`${section.slug} reads as external documentation`, () => {
            const loaded = loadDocument(section.slug);
            expect(loaded, section.slug).not.toBeNull();
            const text = visibleText(loaded!.document.blocks);
            for (const [what, pattern] of INTERNAL_MARKERS) {
                expect(pattern.test(text), `${section.slug} contains ${what}`).toBe(false);
            }
        });
    }

    it("no published document instructs a developer to open a repository path", () => {
        /*
         * The Getting Started guide used to end its production-credentials warning with
         * `../product/08-slice-b2-external-boundary.md`. An external developer cannot open that,
         * and being told to is worse than not being told where the detail lives.
         */
        for (const section of DOCUMENTATION_SECTIONS) {
            const raw = GOVERNED_DOCUMENT_SOURCES[section.file];
            expect(raw.includes("../product/"), section.slug).toBe(false);
        }
    });
});
