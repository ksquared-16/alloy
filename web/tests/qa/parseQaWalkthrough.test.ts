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

    it("records all eight human QA gates and their states", () => {
        /*
         * The appendix is the engineering record now — the step-by-step guide is a component, not
         * markdown. What has to survive here is the GATE TABLE: H6 to H8 are the ones that get
         * forgotten, because nothing reaches them yet.
         */
        const tables = blocks.filter((b): b is Extract<typeof b, { kind: "table" }> => b.kind === "table");
        const gateTable = tables.find((t) => t.rows.some((r) => r[0] === "H1"));
        expect(gateTable).toBeTruthy();
        expect(gateTable!.rows.map((r) => r[0])).toEqual(["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"]);
    });

    it("keeps the ten delivery items, with participant QA still open", () => {
        const tables = blocks.filter((b): b is Extract<typeof b, { kind: "table" }> => b.kind === "table");
        const ledger = tables.find((t) => t.rows.some((r) => r[1]?.includes("Admissions v12 authored")));
        expect(ledger).toBeTruthy();
        expect(ledger!.rows).toHaveLength(10);
        expect(ledger!.rows.find((r) => r[0] === "6")?.[2]).toBe("NOT COMPLETE");
    });

    it("records the import path correction rather than the superseded claim alone", () => {
        const prose = blocks
            .filter((b) => b.kind === "paragraph" || b.kind === "note")
            .map((b) => JSON.stringify(b))
            .join(" ");
        // The earlier pass called document import unsupported on the strength of one disabled control.
        // The appendix has to carry the correction, not just the old sentence.
        expect(prose).toContain("Processing");
        expect(prose).toContain("too narrow");
    });

    it("carries the payment UX finding forward unfixed", () => {
        const all = blocks.map((b) => JSON.stringify(b)).join(" ");
        expect(all).toContain("PAYMENT SHOULD LIKELY BE A JOURNEY STEP");
    });

    it("renders its tables as tables", () => {
        expect(blocks.filter((b) => b.kind === "table").length).toBeGreaterThanOrEqual(2);
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
