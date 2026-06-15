import { describe, expect, it } from "vitest";
import {
    resolveAvailableChannels,
    applyConsentToChannels,
    validateComposerDraft,
    smsBodyStripHtml,
    buildSendPayloads,
    composerPreview,
} from "@/lib/communications/v2/composerModel";

describe("channel availability", () => {
    it("disables SMS without binding/phone, with reasons", () => {
        const a = resolveAvailableChannels({ hasEmailBinding: true, hasSmsBinding: false, recipientHasEmail: true, recipientHasPhone: true });
        expect(a.email).toBe(true);
        expect(a.sms).toBe(false);
        expect(a.reasons.sms).toMatch(/No SMS provider/);
        expect(a.note).toBe(true);
    });
    it("consent can block an otherwise-available channel", () => {
        const base = resolveAvailableChannels({ hasEmailBinding: true, hasSmsBinding: true, recipientHasEmail: true, recipientHasPhone: true });
        const gated = applyConsentToChannels(base, { sms: false });
        expect(gated.email).toBe(true);
        expect(gated.sms).toBe(false);
        expect(gated.reasons.sms).toMatch(/consent/);
    });
});

describe("validation", () => {
    it("requires body, subject for email, recipients for non-notes", () => {
        expect(validateComposerDraft({ channel: "email", body: "", recipients: [] })).toEqual(
            expect.arrayContaining(["Message body is required.", "Email subject is required.", "At least one recipient is required."])
        );
        expect(validateComposerDraft({ channel: "note", body: "internal" })).toEqual([]);
    });
});

describe("sms strip + payloads + preview", () => {
    it("strips html for sms", () => {
        expect(smsBodyStripHtml("<p>Hello <b>there</b></p>")).toBe("Hello there");
    });
    it("expands one payload per recipient with correct format", () => {
        const p = buildSendPayloads({ channel: "email", subject: "Hi", body: "<p>x</p>", recipients: ["a@x.com", "b@y.com"] });
        expect(p).toHaveLength(2);
        expect(p[0]).toMatchObject({ channel: "email", to: "a@x.com", subject: "Hi", body_format: "html" });
        const sms = buildSendPayloads({ channel: "sms", body: "<b>hi</b>", recipients: ["+1"] });
        expect(sms[0]).toMatchObject({ body: "hi", body_format: "plain", subject: null });
        const note = buildSendPayloads({ channel: "note", body: "n" });
        expect(note[0].to).toBe("__internal__");
    });
    it("provides desktop + mobile preview", () => {
        const pv = composerPreview({ channel: "email", subject: "S", body: "B" });
        expect(pv.desktop.subject).toBe("S");
        expect(pv.mobile.format).toBe("html");
    });
});
