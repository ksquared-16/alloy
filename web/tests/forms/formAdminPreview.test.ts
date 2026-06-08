import { describe, expect, it } from "vitest";
import {
    ADMIN_PREVIEW_LINK_METADATA,
    appendPreviewQueryToFullUrl,
    appendPreviewQueryToPath,
    buildPreviewEmbedUrl,
    previewEmbedSessionStorageKey,
} from "@/lib/forms/adminFormPreview";

describe("adminFormPreview", () => {
    it("uses stable sessionStorage key prefix", () => {
        expect(previewEmbedSessionStorageKey("11111111-1111-4111-8111-111111111111")).toBe(
            "alloy_admin_form_preview_embed:11111111-1111-4111-8111-111111111111"
        );
    });

    it("appendPreviewQueryToPath adds preview=1", () => {
        expect(appendPreviewQueryToPath("/forms/embed/abc")).toBe("/forms/embed/abc?preview=1");
        expect(appendPreviewQueryToPath("/forms/embed/abc?x=1")).toBe("/forms/embed/abc?x=1&preview=1");
    });

    it("appendPreviewQueryToFullUrl sets preview param", () => {
        expect(appendPreviewQueryToFullUrl("https://example.com/forms/embed/tok")).toBe(
            "https://example.com/forms/embed/tok?preview=1"
        );
        expect(appendPreviewQueryToFullUrl("https://example.com/forms/embed/tok?preview=1")).toBe(
            "https://example.com/forms/embed/tok?preview=1"
        );
    });

    it("buildPreviewEmbedUrl joins origin and path with preview query", () => {
        expect(buildPreviewEmbedUrl("https://app.example.com", "/forms/embed/x")).toBe(
            "https://app.example.com/forms/embed/x?preview=1"
        );
    });

    it("preview metadata flag is explicit and minimal", () => {
        expect(ADMIN_PREVIEW_LINK_METADATA).toEqual({ alloy_admin_preview: true });
    });
});
