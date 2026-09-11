import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseInline, parseQaWalkthrough, slugForHeading } from "@/lib/qa/parseQaWalkthrough";

/**
 * The QA reader serves the certification document itself.
 *
 * A QA script that only exists in the repository cannot be run by the person doing the
 * certification. These pin that the page keeps showing what the document actually says — that the
 * parts are all present, that DO/EXPECT/STOP survive into something the reader can style, and that
 * the anchors stay stable enough to share.
 */

const DOC = join(
    process.cwd(),
    "..",
    "docs",
    "audits",
    "active",
    "real-enrollment-certification-v1",
    "KELLY-QA-WALKTHROUGH.md",
);

describe("the real document", () => {
    const blocks = parseQaWalkthrough(readFileSync(DOC, "utf8"));

    it("keeps all seven parts, in order", () => {
        const parts = blocks
            .filter((b): b is Extract<typeof b, { kind: "heading" }> => b.kind === "heading" && /^PART /.test(b.text))
            .map((b) => b.slug);
        expect(parts).toEqual(["part-a", "part-b", "part-c", "part-d", "part-e", "part-f", "part-g"]);
    });

    it("finds the numbered steps as steps, not prose", () => {
        const steps = blocks.filter((b) => b.kind === "step");
        // The script is ~59 steps; assert it is clearly a script rather than a page of paragraphs.
        expect(steps.length).toBeGreaterThan(50);
        expect(steps.every((s) => s.kind === "step" && /^[A-G]\d+$/.test(s.label))).toBe(true);
    });

    it("every step is DO or EXPECT", () => {
        const verbs = new Set(blocks.filter((b) => b.kind === "step").map((b) => (b as { verb: string }).verb));
        expect([...verbs].sort()).toEqual(["DO", "EXPECT"]);
    });

    it("marks the STOP callouts so they can be made unmissable", () => {
        const stops = blocks.filter((b) => b.kind === "note" && (b as { stop: boolean }).stop);
        expect(stops.length).toBeGreaterThan(5);
    });

    it("keeps the Configuration Health table", () => {
        const tables = blocks.filter((b) => b.kind === "table");
        expect(tables.length).toBeGreaterThan(0);
    });
});

describe("anchors", () => {
    it("names parts by letter so a link can be shared", () => {
        expect(slugForHeading("PART D — Open the QA child, then launch the parent experience")).toBe("part-d");
        expect(slugForHeading("PART A — Configuration")).toBe("part-a");
    });

    it("falls back to a slug for other headings", () => {
        expect(slugForHeading("Appendix — known limitations (not defects to find)")).toMatch(/^appendix/);
    });
});

describe("inline", () => {
    it("splits emphasis and code without nesting", () => {
        expect(parseInline("Click **Launch packet** then `Copy`")).toEqual([
            { kind: "text", text: "Click " },
            { kind: "strong", text: "Launch packet" },
            { kind: "text", text: " then " },
            { kind: "code", text: "Copy" },
        ]);
    });

    it("returns plain text unchanged", () => {
        expect(parseInline("no emphasis here")).toEqual([{ kind: "text", text: "no emphasis here" }]);
    });
});
