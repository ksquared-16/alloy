import { describe, expect, it } from "vitest";
import {
    communicationTemplateDraftSeedFromPreview,
    parseCommunicationTemplateCurrentVersion,
} from "@/lib/communications/v2/communicationTemplateDraftSeed";

describe("communicationTemplateDraftSeed", () => {
    it("parses current_version subject and body", () => {
        expect(parseCommunicationTemplateCurrentVersion({ subject: " Hi ", body: "Body text" })).toEqual({
            subject: "Hi",
            body: "Body text",
        });
        expect(parseCommunicationTemplateCurrentVersion({ subject: "", body: "SMS only" })).toEqual({
            subject: null,
            body: "SMS only",
        });
        expect(parseCommunicationTemplateCurrentVersion(null)).toBeNull();
    });

    it("maps preview to draft seed by channel", () => {
        expect(
            communicationTemplateDraftSeedFromPreview({ subject: "Subj", body: "Body" }, "email")
        ).toEqual({ subject: "Subj", body: "Body" });
        expect(
            communicationTemplateDraftSeedFromPreview({ subject: "Subj", body: "Body" }, "sms")
        ).toEqual({ subject: "", body: "Body" });
    });
});
