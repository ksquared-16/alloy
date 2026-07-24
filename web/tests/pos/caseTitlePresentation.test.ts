import { describe, expect, it } from "vitest";
import { DEFAULT_CASE_TITLE_TEMPLATE, resolveCaseTitle } from "@/lib/pos/caseTitlePresentation";

describe("caseTitlePresentation (§6)", () => {
    it("default template = {person_name} — {purpose}", () => {
        expect(
            resolveCaseTitle({ template: null, tokens: { person_name: "Nadia Northfield", purpose: "New enrollment lead", form_name: "Firefly Lead Capture" } })
        ).toBe("Nadia Northfield — New enrollment lead");
        expect(DEFAULT_CASE_TITLE_TEMPLATE).toBe("{person_name} — {purpose}");
    });

    it("honors a form-level template with safe tokens", () => {
        expect(
            resolveCaseTitle({
                template: "{person_name} · {child_name} · {stage}",
                tokens: { person_name: "Marisol Ziptest", child_name: "Wren", stage: "Lead" },
            })
        ).toBe("Marisol Ziptest · Wren · Lead");
    });

    it("collapses missing tokens and their dangling separators", () => {
        // No child → the middle segment and its separators disappear cleanly.
        expect(
            resolveCaseTitle({ template: "{person_name} — {child_name} — {purpose}", tokens: { person_name: "Nadia Northfield", purpose: "New enrollment lead" } })
        ).toBe("Nadia Northfield — New enrollment lead");
    });

    it("falls back to the form name when the template resolves to nothing", () => {
        expect(resolveCaseTitle({ template: "{person_name} — {purpose}", tokens: { form_name: "Firefly Lead Capture" } })).toBe(
            "Firefly Lead Capture"
        );
    });

    it("never evaluates arbitrary/unknown tokens — they stay literal", () => {
        const out = resolveCaseTitle({ template: "{person_name} {evil_token}", tokens: { person_name: "A" } });
        expect(out).toContain("{evil_token}");
        expect(out).not.toMatch(/undefined|\[object/);
    });

    it("safe final fallback when nothing is available", () => {
        expect(resolveCaseTitle({ template: "{person_name}", tokens: {} })).toBe("Untitled case");
    });
});
