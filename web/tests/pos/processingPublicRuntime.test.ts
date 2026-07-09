import { describe, it, expect } from "vitest";
import {
    buildProcessingPublicFormIframeHtml,
    resolveProcessingPublicShareUrl,
    resolveProcessingPublicSlug,
    slugifyProcessingPublicFormSlug,
} from "@/lib/pos/processingPublicRuntime";

describe("processingPublicRuntime", () => {
    it("slugifies form names for public URLs", () => {
        expect(slugifyProcessingPublicFormSlug("Firefly Lead Form!")).toBe("firefly-lead-form");
        expect(slugifyProcessingPublicFormSlug("   ")).toBe("form");
    });

    it("prefers stored slug metadata, then form key", () => {
        expect(
            resolveProcessingPublicSlug("lead_form_v2", "Lead Form", { processing_public_slug: "custom-slug" })
        ).toBe("custom-slug");
        expect(resolveProcessingPublicSlug("lead_form_v2", "Lead Form", {})).toBe("lead-form-v2");
    });

    it("builds responsive iframe embed HTML", () => {
        const html = buildProcessingPublicFormIframeHtml({
            embedUrl: "https://app.example.com/forms/embed/token123",
            formTitle: "Lead Form",
        });
        expect(html).toContain('src="https://app.example.com/forms/embed/token123"');
        expect(html).toContain('style="width:100%;min-height:720px;border:0;"');
        expect(html).toContain('title="Lead Form"');
    });

    it("resolves share URL from embed path and origin", () => {
        expect(
            resolveProcessingPublicShareUrl({
                embedUrl: null,
                embedPath: "/forms/embed/abc",
                origin: "https://app.example.com",
            })
        ).toBe("https://app.example.com/forms/embed/abc");
    });
});
