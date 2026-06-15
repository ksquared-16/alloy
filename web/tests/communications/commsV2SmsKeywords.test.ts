import { describe, expect, it } from "vitest";
import { parseSmsKeyword, keywordTargetState, SMS_KEYWORD_CATEGORIES } from "@/lib/communications/v2/smsKeywords";

/** PKG-08 — SMS STOP/START/HELP parsing. */
describe("parseSmsKeyword", () => {
    it("recognizes stop variants", () => {
        for (const w of ["STOP", "unsubscribe", "Cancel", "quit", " stop now "]) expect(parseSmsKeyword(w)).toBe("stop");
    });
    it("recognizes start + help variants", () => {
        expect(parseSmsKeyword("START")).toBe("start");
        expect(parseSmsKeyword("yes")).toBe("start");
        expect(parseSmsKeyword("HELP")).toBe("help");
        expect(parseSmsKeyword("info")).toBe("help");
    });
    it("returns null for non-keywords", () => {
        expect(parseSmsKeyword("hello there")).toBeNull();
    });
    it("maps keyword to target state; help changes nothing; affects both SMS categories", () => {
        expect(keywordTargetState("stop")).toBe("opted_out");
        expect(keywordTargetState("start")).toBe("opted_in");
        expect(keywordTargetState("help")).toBeNull();
        expect(SMS_KEYWORD_CATEGORIES).toEqual(["sms_transactional", "sms_marketing"]);
    });
});
