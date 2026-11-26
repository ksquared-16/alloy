import { describe, expect, it } from "vitest";
import { matchReasonLabel } from "@/lib/pos/processingCase/recommendation/candidateDetail";

describe("candidateDetail — match reasons (§3)", () => {
    it("translates engine match identifiers into operator-facing reasons", () => {
        expect(matchReasonLabel("parent email")).toBe("Exact parent email");
        expect(matchReasonLabel("email")).toBe("Exact parent email");
        expect(matchReasonLabel("phone")).toBe("Exact phone number");
    });

    it("humanizes any other reason without exposing raw keys", () => {
        expect(matchReasonLabel("household_address")).toBe("Household address");
    });
});
