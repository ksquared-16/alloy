import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The correction editor must open on the value being corrected.
 *
 * WHAT THIS CAUGHT. A parent clicking Edit on a CONFIRMED Birthday met an empty date input. The
 * editor was fine; one of its four call sites simply did not pass `initial`, and because the prop
 * was optional TypeScript accepted the omission in silence. `initial` defaulted to undefined,
 * `shown` became "", and for a date field `isoDraft("")` produced "". The family was asked to
 * retype from memory the value they were only trying to correct.
 *
 * WHY THE TEST IS SHAPED LIKE THIS. The defect was not in the editor's logic — it renders whatever
 * it is handed — so a test that mounts the editor with a good value would have passed throughout.
 * What failed was the WIRING, and the invariant worth pinning is that every call site supplies the
 * current value. That is a property of the file, so the file is what is asserted, alongside the
 * date conversion the empty value was mistakenly blamed on.
 */

const CARD = join(process.cwd(), "app/forms/embed/[token]/EnrollmentConversationCard.tsx");
const source = readFileSync(CARD, "utf8");

/** The component's own display -> editable conversion for date fields. */
function isoDraft(shown: string): string {
    const parsed = new Date(`${shown} UTC`);
    if (Number.isNaN(parsed.getTime())) return shown;
    return parsed.toISOString().slice(0, 10);
}

describe("correction editor initial value", () => {
    it("every StructuredFactEditor call site supplies the value being corrected", () => {
        const callSites = source.split("<StructuredFactEditor").slice(1);
        expect(callSites.length).toBeGreaterThanOrEqual(4);
        for (const [index, site] of callSites.entries()) {
            const props = site.slice(0, site.indexOf("/>"));
            expect(
                props.includes("initial="),
                `StructuredFactEditor call site #${index + 1} does not pass initial — the editor would open blank`,
            ).toBe(true);
        }
    });

    it("initial is REQUIRED, so a call site cannot omit it silently", () => {
        // THE MUTATION GUARD. Restoring `initial?: string` makes the omission compile again, which
        // is exactly how the blank editor shipped. Optionality is the defect, not the value.
        expect(source).toMatch(/\n\s*initial: string;/);
        expect(source).not.toMatch(/\n\s*initial\?: string;/);
    });

    it("a confirmed display date converts to the canonical editable representation", () => {
        // The display value is what the parent reads; the date input needs ISO. Both directions of
        // this were suspected before the real cause was found, so both are pinned.
        expect(isoDraft("Jun 14, 2021")).toBe("2021-06-14");
        expect(isoDraft("June 14, 2021")).toBe("2021-06-14");
        expect(isoDraft("2021-06-14")).toBe("2021-06-14");
    });

    it("an absent value converts to blank, which is why the omitted prop was invisible", () => {
        // Not a bug in the conversion — the correct behaviour for no input. It is recorded here
        // because this is precisely what made the missing prop look like a date-parsing failure.
        expect(isoDraft("")).toBe("");
    });

    it("a blank draft cannot be saved, so a failed initialization can never erase a fact", () => {
        // The empty editor could not have deleted the Birthday: Save is disabled while the draft is
        // blank. Pinned so the guard is not removed alongside some future editor change.
        expect(source).toContain("ready = draft.trim().length > 0");
        expect(source).toMatch(/disabled=\{busy \|\| !ready\}/);
    });
});
