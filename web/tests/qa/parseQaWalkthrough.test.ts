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

    it("keeps all eight human QA gates, in order", () => {
        const gates = blocks
            .filter((b): b is Extract<typeof b, { kind: "heading" }> => b.kind === "heading" && /^H\d+ /.test(b.text))
            .map((b) => b.text.split(" ")[0]);
        /*
         * The lifecycle is only tested from the beginning if every gate is on the page. H1 gets
         * forgotten least — it is where the Director starts — and H6 to H8 get forgotten most, because
         * nothing reaches them yet.
         */
        expect(gates).toEqual(["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"]);
    });

    it("starts at H1 rather than at the participant packet", () => {
        const firstGate = blocks.find(
            (b): b is Extract<typeof b, { kind: "heading" }> => b.kind === "heading" && /^H\d+ /.test(b.text),
        );
        expect(firstGate?.text.startsWith("H1")).toBe(true);
    });

    it("scopes H1's steps to H1", () => {
        const labels = blocks.filter((b) => b.kind === "step").map((b) => (b as { label: string }).label);
        expect(labels.length).toBeGreaterThan(0);
        // Gate-scoped labels say which gate they belong to, which is why the parser accepts them.
        expect(labels.every((l) => /^H\d+[a-z]$/.test(l))).toBe(true);
        expect(labels).toContain("H1a");
    });

    it("finds the numbered steps as steps, not prose", () => {
        const steps = blocks.filter((b) => b.kind === "step");
        // H1 is a real click-by-click gate, not a paragraph of intent.
        expect(steps.length).toBeGreaterThan(5);
        expect(
            steps.every((s) => s.kind === "step" && /^(?:H\d+[a-z]|[A-G]\d+|0\.\d+)$/.test(s.label)),
        ).toBe(true);
    });

    it("every step is DO or EXPECT", () => {
        const verbs = new Set(blocks.filter((b) => b.kind === "step").map((b) => (b as { verb: string }).verb));
        expect([...verbs].sort()).toEqual(["DO", "EXPECT"]);
    });

    it("marks a STOP callout inside H1, where stopping too late costs the most", () => {
        const gateStarts = blocks
            .map((b, i) => ({ b, i }))
            .filter(({ b }) => b.kind === "heading" && /^H\d+ /.test((b as { text: string }).text))
            .map(({ i }) => i);
        expect(gateStarts.length).toBe(8);
        const h1 = blocks.slice(gateStarts[0], gateStarts[1]);
        // H1 ends at a DRAFT. Publishing it over the live Admissions Packet is the one irreversible
        // mistake available in this gate, so the stop has to be unmissable rather than prose.
        expect(h1.filter((b) => b.kind === "note" && (b as { stop: boolean }).stop).length).toBeGreaterThan(0);
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
