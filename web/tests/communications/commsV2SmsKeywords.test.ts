import { describe, expect, it } from "vitest";
import { parseSmsKeyword, keywordTargetState, SMS_KEYWORD_CATEGORIES } from "@/lib/communications/v2/smsKeywords";

/** PKG-08 — SMS STOP/START/HELP parsing. */
describe("parseSmsKeyword", () => {
    it("recognizes stop variants", () => {
        for (const w of ["STOP", "unsubscribe", "Cancel", "quit", " stop now "]) expect(parseSmsKeyword(w)).toBe("stop");
    });
    it("recognizes start + help variants", () => {
        expect(parseSmsKeyword("START")).toBe("start");
        expect(parseSmsKeyword("unstop")).toBe("start");
        expect(parseSmsKeyword("HELP")).toBe("help");
        expect(parseSmsKeyword("info")).toBe("help");
    });
    it("does NOT treat 'yes' as a resubscribe keyword", () => {
        // Changed in Phase 0 when keyword handling was first wired to a live
        // path. "yes" is not carrier-standard and collides with ordinary
        // conversation: a parent answering "Yes" to "Can you make Tuesday?"
        // would have been silently resubscribed.
        expect(parseSmsKeyword("yes")).toBeNull();
    });
    it("returns null for non-keywords", () => {
        expect(parseSmsKeyword("hello there")).toBeNull();
    });
    it("maps keyword to target state; help changes nothing; affects every SMS category", () => {
        expect(keywordTargetState("stop")).toBe("opted_out");
        expect(keywordTargetState("start")).toBe("opted_in");
        expect(keywordTargetState("help")).toBeNull();
        // Carrier semantics: STOP suppresses ALL SMS. sms_operational was added
        // in Phase 0 alongside the operational message category — without it,
        // STOP could not block the bulk of what the platform sends.
        expect([...SMS_KEYWORD_CATEGORIES].sort()).toEqual(
            ["sms_marketing", "sms_operational", "sms_transactional"].sort()
        );
    });
});
