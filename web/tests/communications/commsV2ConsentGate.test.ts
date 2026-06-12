import { describe, expect, it } from "vitest";
import { evaluateConsent, effectiveSendClass } from "@/lib/communications/v2/consentGate";

/** PKG-08 — platform consent gate doctrine. */
describe("effectiveSendClass", () => {
    it("classifies explicit categories", () => {
        expect(effectiveSendClass("email_transactional", "lead")).toBe("transactional");
        expect(effectiveSendClass("sms_marketing", "enrolled")).toBe("marketing");
        expect(effectiveSendClass("emergency", "lead")).toBe("transactional");
    });
    it("announcements follow lifecycle with safer default", () => {
        expect(effectiveSendClass("announcements", "enrolled")).toBe("transactional");
        expect(effectiveSendClass("announcements", "lead")).toBe("marketing");
        expect(effectiveSendClass("announcements", "unknown")).toBe("marketing");
    });
});

describe("evaluateConsent", () => {
    it("transactional permitted unless explicitly opted out", () => {
        expect(evaluateConsent({ category: "email_transactional", lifecycleStage: "lead" }).allowed).toBe(true);
        expect(evaluateConsent({ category: "email_transactional", lifecycleStage: "lead", preferenceState: "opted_out" }).allowed).toBe(false);
    });
    it("marketing requires opt-in (safer default blocks unset)", () => {
        expect(evaluateConsent({ category: "email_marketing", lifecycleStage: "lead" }).allowed).toBe(false);
        expect(evaluateConsent({ category: "email_marketing", lifecycleStage: "lead", preferenceState: "opted_in" }).allowed).toBe(true);
    });
    it("promotional override permits marketing for UNSET only — never over an opt-out", () => {
        expect(evaluateConsent({ category: "sms_marketing", lifecycleStage: "lead", promotionalOverride: true }).allowed).toBe(true);
        expect(evaluateConsent({ category: "sms_marketing", lifecycleStage: "lead", preferenceState: "opted_out", promotionalOverride: true }).allowed).toBe(false);
    });
    it("reports the effective class on every decision", () => {
        expect(evaluateConsent({ category: "announcements", lifecycleStage: "lead" }).effectiveClass).toBe("marketing");
        expect(evaluateConsent({ category: "announcements", lifecycleStage: "enrolled" }).effectiveClass).toBe("transactional");
    });
});
