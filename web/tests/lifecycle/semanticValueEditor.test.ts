/**
 * "Change" must open an editor, not a blank composer.
 *
 * The address is the case that mattered: it is ONE canonical string, so the only way to fix a city
 * was to retype the whole thing from memory. These assert the round trip that makes a four-box
 * editor safe over a single value — and the refusals that keep it from inventing one.
 */

import { describe, expect, it } from "vitest";

import {
    addressParts,
    composeAddress,
    isAddressFact,
    semanticEditorFor,
} from "@/lib/enrollment/participantRuntime/semanticValueEditor";

const FULL = "418 NE Hancock St, Portland, OR 97212";

describe("splitting one address for editing", () => {
    it("reads a US-style address into its parts", () => {
        expect(addressParts(FULL)).toEqual({
            street: "418 NE Hancock St",
            city: "Portland",
            state: "OR",
            postal: "97212",
        });
    });

    it("keeps a multi-part street together", () => {
        expect(addressParts("418 NE Hancock St, Apt 3, Portland, OR 97212")).toEqual({
            street: "418 NE Hancock St, Apt 3",
            city: "Portland",
            state: "OR",
            postal: "97212",
        });
    });

    it("invents nothing for the parts that are genuinely absent", () => {
        expect(addressParts("418 NE Hancock St, Portland")).toEqual({
            street: "418 NE Hancock St",
            city: "Portland",
            state: "",
            postal: "",
        });
    });

    it("refuses to read a bare line", () => {
        // Guessing where a city begins in someone's address is worse than not offering the editor.
        expect(addressParts("418 NE Hancock St")).toBeNull();
        expect(addressParts("")).toBeNull();
        expect(addressParts(null)).toBeNull();
        expect(addressParts(42)).toBeNull();
    });
});

describe("putting it back", () => {
    it("round-trips an untouched address EXACTLY", () => {
        /*
         * The property the D-99 fingerprint depends on. A parent who opens the editor, changes
         * nothing and saves must write back the identical string — otherwise the confirmation of a
         * value nobody edited would silently stop matching.
         */
        expect(composeAddress(addressParts(FULL)!)).toBe(FULL);
    });

    it("round-trips a partial address without inventing separators", () => {
        const partial = "418 NE Hancock St, Portland";
        expect(composeAddress(addressParts(partial)!)).toBe(partial);
    });

    it("changes ONLY the part that was edited", () => {
        // The reported case: "it's Bend" must move the city and leave the street and ZIP alone.
        const parts = addressParts(FULL)!;
        expect(composeAddress({ ...parts, city: "Bend" })).toBe("418 NE Hancock St, Bend, OR 97212");
    });

    it("normalises the state without touching anything else", () => {
        const parts = addressParts(FULL)!;
        expect(composeAddress({ ...parts, state: "or" })).toBe(FULL);
    });
});

describe("which editor a fact deserves", () => {
    const editor = (over: Partial<Parameters<typeof semanticEditorFor>[0]>) =>
        semanticEditorFor({ canonicalKey: null, inputType: null, options: [], value: null, ...over });

    it("gives a whole address four boxes", () => {
        const chosen = editor({ canonicalKey: "customer:address", inputType: "text", value: FULL });
        expect(chosen.kind).toBe("address");
        if (chosen.kind !== "address") return;
        expect(chosen.parts.city).toBe("Portland");
    });

    it("does NOT decompose an already-componentized address key", () => {
        // `customer:city` is one editable value. A four-box editor over it would be nonsense.
        expect(isAddressFact("customer:city")).toBe(false);
        expect(isAddressFact("customer:address_line1")).toBe(false);
        expect(isAddressFact("customer:address")).toBe(true);
    });

    it("falls back to the plain line when the address cannot be read", () => {
        const chosen = editor({ canonicalKey: "customer:address", inputType: "text", value: "PO Box 12" });
        expect(chosen).toEqual({ kind: "value", inputType: "text" });
    });

    it("recovers the control an imported PDF field lost", () => {
        /*
         * Every imported box arrives as `text`, so an email got a plain field and gave up the
         * keyboard and validation the browser would have supplied. The key names the fact.
         */
        expect(editor({ canonicalKey: "guardian_email", inputType: "text" })).toEqual({ kind: "value", inputType: "email" });
        expect(editor({ canonicalKey: "person:phone", inputType: "text" })).toEqual({ kind: "value", inputType: "tel" });
        expect(editor({ canonicalKey: "customer_member:dob", inputType: "text" })).toEqual({ kind: "value", inputType: "date" });
    });

    it("lets the AUTHORED control lead where it says something specific", () => {
        expect(editor({ canonicalKey: "customer_member:dob", inputType: "date" })).toEqual({ kind: "value", inputType: "date" });
        expect(editor({ canonicalKey: "customer_member:gender", inputType: "select", options: ["Male", "Female"] })).toEqual({
            kind: "options",
            options: ["Male", "Female"],
        });
    });

    it("leaves an ordinary free-text answer a text box", () => {
        expect(editor({ canonicalKey: "customer_member:temperament", inputType: "text" })).toEqual({
            kind: "value",
            inputType: "text",
        });
    });
});
