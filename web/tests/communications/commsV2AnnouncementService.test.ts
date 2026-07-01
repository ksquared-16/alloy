import { describe, expect, it } from "vitest";
import {
    validateAnnouncementChannels,
    validateCreateAnnouncementInput,
    validatePatchAnnouncementInput,
} from "@/lib/communications/v2/announcementService";

/** Comms V2 Phase 1 / B4 — announcement skeleton validation (draft-only, no send). */

describe("validateAnnouncementChannels", () => {
    it("accepts a valid subset, de-duped", () => {
        expect(validateAnnouncementChannels(["email", "sms", "email"])).toEqual({
            ok: true,
            value: ["email", "sms"],
        });
    });
    it("defaults missing to empty", () => {
        expect(validateAnnouncementChannels(undefined)).toEqual({ ok: true, value: [] });
    });
    it("rejects an invalid channel", () => {
        expect(validateAnnouncementChannels(["fax"]).ok).toBe(false);
    });
    it("rejects a non-array", () => {
        expect(validateAnnouncementChannels("email").ok).toBe(false);
    });
});

describe("validateCreateAnnouncementInput", () => {
    it("creates a draft with normalized fields", () => {
        const r = validateCreateAnnouncementInput({
            title: "  Closure notice  ",
            channels: ["in_app"],
            subject: " Snow day ",
            body: "We are closed.",
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.title).toBe("Closure notice");
            expect(r.value.channels).toEqual(["in_app"]);
            expect(r.value.subject).toBe("Snow day");
            expect(r.value.body_format).toBe("text");
        }
    });
    it("requires a title", () => {
        expect(validateCreateAnnouncementInput({ title: "  " }).ok).toBe(false);
    });
    it("rejects an invalid channel", () => {
        expect(validateCreateAnnouncementInput({ title: "X", channels: ["nope"] }).ok).toBe(false);
    });
    it("rejects an invalid body_format", () => {
        expect(validateCreateAnnouncementInput({ title: "X", body_format: "markdown" }).ok).toBe(false);
    });
    it("does not accept a status (always draft on create)", () => {
        const r = validateCreateAnnouncementInput({ title: "X", status: "sent" });
        // status is ignored by the validator; the route always inserts 'draft'
        expect(r.ok).toBe(true);
        if (r.ok) expect((r.value as Record<string, unknown>).status).toBeUndefined();
    });
});

describe("validatePatchAnnouncementInput", () => {
    it("accepts metadata-only fields", () => {
        const r = validatePatchAnnouncementInput({ title: "New", channels: ["email"], body: "hi" });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.title).toBe("New");
            expect(r.value.channels).toEqual(["email"]);
            expect(r.value.body).toBe("hi");
        }
    });
    it("rejects an empty title", () => {
        expect(validatePatchAnnouncementInput({ title: "  " }).ok).toBe(false);
    });
    it("validates template_id as uuid or null", () => {
        expect(validatePatchAnnouncementInput({ template_id: null }).ok).toBe(true);
        expect(validatePatchAnnouncementInput({ template_id: "not-a-uuid" }).ok).toBe(false);
    });
    it("never accepts status / send_at (no scheduling in the skeleton)", () => {
        const r = validatePatchAnnouncementInput({ status: "scheduled", send_at: "2026-07-01T00:00:00Z" });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect((r.value as Record<string, unknown>).status).toBeUndefined();
            expect((r.value as Record<string, unknown>).send_at).toBeUndefined();
        }
    });
});
