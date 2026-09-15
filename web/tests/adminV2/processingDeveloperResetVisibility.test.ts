/**
 * Who sees the Processing developer reset, and who does not.
 *
 * The control deletes Processing artifacts and returns Work + Studio to blank. It was gated on
 * `NODE_ENV !== "production"`, which is true on every Alloy certification and Human-QA host — so an
 * operator walking Processing for QA was offered a button that wipes the fixture they are walking.
 * Nothing asserted its visibility either way, which is why the exposure survived from July.
 *
 * Both directions are asserted here, because only proving the removal would leave the capability
 * free to disappear entirely in some later cleanup. Developers keep the tool; operators stop being
 * offered it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
    resolve(__dirname, "../../app/adminV2/pos/ProcessingOverviewLanding.tsx"),
    "utf8",
);

/** The gate as written, normalized for whitespace. */
const gate = source.slice(source.indexOf("const showDeveloperReset")).slice(0, 260).replace(/\s+/g, " ");

describe("development runtime with no explicit debug opt-in is ordinary operator product", () => {
    it("the control is not gated on the runtime mode alone", () => {
        expect(gate).toContain('process.env.NODE_ENV === "development"');
        expect(gate).toContain("&&");
        // The second gate is what a person has to set deliberately.
        expect(gate).toContain('process.env.NEXT_PUBLIC_PROCESSING_DEBUG === "1"');
    });

    it("no rendered branch falls back to the old single gate", () => {
        // The exact predicate that shipped, in any rendered position.
        expect(source).not.toMatch(/\{\s*process\.env\.NODE_ENV\s*!==\s*"production"\s*\?/);
    });
});

describe("development runtime with the explicit opt-in keeps the developer control", () => {
    it("the reset control still exists and is still wired to the cleanup dialog", () => {
        expect(source).toContain("showDeveloperReset ? (");
        expect(source).toContain("Reset test data");
        expect(source).toContain("processing-dev-cleanup-open");
        expect(source).toContain("ProcessingDevCleanupDialog");
    });

    it("the reset semantics themselves were not touched", () => {
        // The repair is a visibility boundary. What the tool does when a developer opens it is
        // unchanged, and this is the line that would notice if that stopped being true.
        expect(source).toContain("setCleanupOpen(true)");
        expect(source).toContain("onApplied");
    });
});
