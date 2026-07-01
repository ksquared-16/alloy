import { describe, expect, it } from "vitest";
import {
    buildEmbedOperatorNote,
    buildFormEmbedIframeSnippet,
    resolveFormShareHint,
} from "@/lib/forms/formSharePresentation";

describe("formSharePresentation", () => {
    it("builds iframe embed snippet", () => {
        const snippet = buildFormEmbedIframeSnippet("https://example.com/forms/embed/abc", "Enrollment lead");
        expect(snippet).toContain('src="https://example.com/forms/embed/abc"');
        expect(snippet).toContain('title="Enrollment lead"');
        expect(snippet).toContain("<iframe");
    });

    it("resolves share hint from operational intent", () => {
        expect(resolveFormShareHint("enrollment_lead")).toContain("website");
        expect(resolveFormShareHint(null)).toContain("Copy the share link");
    });

    it("builds embed operator notes by intent", () => {
        expect(buildEmbedOperatorNote("enrollment_lead")).toContain("new enrollment inquiry");
        expect(buildEmbedOperatorNote("existing_family")).toContain("duplicate lead");
        expect(buildEmbedOperatorNote("packet_step")).toContain("enrollment packet");
    });
});
