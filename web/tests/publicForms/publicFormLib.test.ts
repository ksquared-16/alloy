import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import {
    isEmbedOriginAllowed,
    normalizeEmbedAllowlistEntry,
    requestEmbedOrigin,
} from "@/lib/public/forms/embedOrigin";
import { mergePublicSubmissionMeta } from "@/lib/public/forms/publicPayloadMeta";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import { parseFormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";

describe("public form lib", () => {
    it("hashFormLinkToken is stable hex", () => {
        const h = hashFormLinkToken("secret-token");
        expect(h).toMatch(/^[0-9a-f]{64}$/);
        expect(hashFormLinkToken("secret-token")).toBe(h);
    });

    it("requestEmbedOrigin reads Origin header", () => {
        const req = new NextRequest("http://localhost/x", {
            headers: { Origin: "https://example.com" },
        });
        expect(requestEmbedOrigin(req)).toBe("https://example.com");
    });

    it("isEmbedOriginAllowed permits when list empty", () => {
        expect(isEmbedOriginAllowed("https://evil.com", [])).toBe(true);
        expect(isEmbedOriginAllowed(null, undefined)).toBe(true);
    });

    it("isEmbedOriginAllowed enforces allowlist", () => {
        expect(isEmbedOriginAllowed("https://good.com", ["https://good.com"])).toBe(true);
        expect(isEmbedOriginAllowed("https://bad.com", ["https://good.com"])).toBe(false);
    });

    it("linkRequiresLeadCapture reads metadata flags", () => {
        expect(linkRequiresLeadCapture({ lead_capture: true })).toBe(true);
        expect(linkRequiresLeadCapture({ mode: "intake" })).toBe(true);
        expect(linkRequiresLeadCapture({})).toBe(false);
    });

    it("parseFormIntakeMeta extracts nested intake object", () => {
        const m = parseFormIntakeMeta({
            intake: { guardian: { email: "a@b.com", phone: "+15555550100" }, vertical_id: "vid" },
        });
        expect(m?.guardian?.email).toBe("a@b.com");
        expect(m?.vertical_id).toBe("vid");
    });

    it("normalizeEmbedAllowlistEntry strips path from full URL", () => {
        expect(normalizeEmbedAllowlistEntry("https://example.com/embed/foo")).toBe("https://example.com");
    });

    it("mergePublicSubmissionMeta drops spoofed server meta then applies hash", () => {
        const m = mergePublicSubmissionMeta(
            {
                client_ip_hash: "fake",
                intake_resolution_path: "bogus",
                intake: { vertical_id: "x" },
            } as Record<string, unknown>,
            "realhash"
        );
        expect(m.client_ip_hash).toBe("realhash");
        expect(m.intake_resolution_path).toBeUndefined();
        expect((m as { intake?: unknown }).intake).toEqual({ vertical_id: "x" });
    });
});
