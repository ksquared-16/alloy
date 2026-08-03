import { describe, expect, it } from "vitest";
import { extractFactsFromText } from "@/lib/intake/extract/extractFactsFromText";
import { mapFactsToCreateLeadIntake } from "@/lib/admin/actions/createLead/adapters/mapFactsToCreateLeadIntake";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

const SPEC: ActionIntakeSpec = {
    action_key: "create_lead",
    required: [],
    recommended: [],
    optional: [],
} as unknown as ActionIntakeSpec;

function fieldValue(text: string, key: string): { value: string; confidence: string } | null {
    const extraction = extractFactsFromText({ text });
    const mapping = mapFactsToCreateLeadIntake({ extraction, spec: SPEC });
    const c = mapping.candidates.find((x) => x.payload_key === key);
    return c ? { value: c.value, confidence: c.confidence } : null;
}

describe("Create Lead — contact (email/phone) capture", () => {
    // Regression: an email/phone provided WITHOUT a parent name in the same message must still map to
    // the primary-contact fields. Previously email/phone only mapped when household.parents[0] existed,
    // so a contact-only BOS turn was silently dropped ("I still need: Email").
    it("captures email + phone from a message that has no parent name (contact-only turn)", () => {
        expect(fieldValue("brian@fitz.com 6546546547 children: Caitlyn (DOB 7/7/2022)", "email")).toEqual({
            value: "brian@fitz.com",
            confidence: "high",
        });
        expect(fieldValue("brian@fitz.com 6546546547 children: Caitlyn (DOB 7/7/2022)", "phone")).toEqual({
            value: "6546546547",
            confidence: "high",
        });
    });

    it("still captures email + phone from a full note with a parent name (no regression, no duplication)", () => {
        const text = "Brian and Brittany Fitz\nbrian@fitz.com 6546546547\nchildren: Caitlyn (DOB 7/7/2022)";
        expect(fieldValue(text, "email")?.value).toBe("brian@fitz.com");
        expect(fieldValue(text, "phone")?.value).toBe("6546546547");
        // exactly one email/phone candidate (seen-guard prevents the fallback from duplicating)
        const mapping = mapFactsToCreateLeadIntake({ extraction: extractFactsFromText({ text }), spec: SPEC });
        expect(mapping.candidates.filter((c) => c.payload_key === "email")).toHaveLength(1);
        expect(mapping.candidates.filter((c) => c.payload_key === "phone")).toHaveLength(1);
    });

    it("adds no email/phone field when the message has no contact info", () => {
        expect(fieldValue("Brian and Brittany Fitz", "email")).toBeNull();
        expect(fieldValue("Brian and Brittany Fitz", "phone")).toBeNull();
    });
});
