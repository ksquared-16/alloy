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
import { isPublicFormEmbedPath } from "@/lib/public/forms/publicFormEmbedPath";

describe("public form lib", () => {
    it("isPublicFormEmbedPath matches embed routes only", () => {
        expect(isPublicFormEmbedPath("/forms/embed/abc-token")).toBe(true);
        expect(isPublicFormEmbedPath("/forms/embed")).toBe(true);
        expect(isPublicFormEmbedPath("/forms/other")).toBe(false);
        expect(isPublicFormEmbedPath("/")).toBe(false);
        expect(isPublicFormEmbedPath(null)).toBe(false);
    });

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
        expect(linkRequiresLeadCapture({ form_context_mode: "existing_record", lead_capture: true })).toBe(false);
    });

    it("linkRequiresLeadCapture runs intake for Studio processing_intake links that carry the intent", () => {
        // Studio "Create link" (incl. per-campus Share-by-location) mints form_context_mode
        // = processing_intake. When the form's operational intent marked it lead-capture the
        // link MUST still run intake — otherwise public submissions skip intake entirely and
        // never reach the Mailroom.
        expect(linkRequiresLeadCapture({ form_context_mode: "processing_intake", lead_capture: true })).toBe(true);
        expect(linkRequiresLeadCapture({ form_context_mode: "processing_intake", intake: true })).toBe(true);
        // A processing_intake link WITHOUT the intent flags still does not run intake.
        expect(linkRequiresLeadCapture({ form_context_mode: "processing_intake" })).toBe(false);
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

    it("mergePublicSubmissionMeta drops spoofed server meta and client intake then applies hash", () => {
        const m = mergePublicSubmissionMeta(
            {
                client_ip_hash: "fake",
                intake_resolution_path: "bogus",
                intake_error: "nope",
                intake_skip_reason: "x",
                intake_match_strategy: "spoof",
                intake_match_confidence: "high",
                intake_needs_review: false,
                intake_review_reason: "x",
                intake_candidate_email_count: 9,
                intake_candidate_phone_count: 9,
                intake: { vertical_id: "x", guardian: { email: "evil@x.com" } },
            } as Record<string, unknown>,
            "realhash"
        );
        expect(m.client_ip_hash).toBe("realhash");
        expect(m.intake_resolution_path).toBeUndefined();
        expect(m.intake_error).toBeUndefined();
        expect(m.intake_skip_reason).toBeUndefined();
        expect((m as { intake_match_strategy?: unknown }).intake_match_strategy).toBeUndefined();
        expect((m as { intake_match_confidence?: unknown }).intake_match_confidence).toBeUndefined();
        expect((m as { intake_needs_review?: unknown }).intake_needs_review).toBeUndefined();
        expect((m as { intake_review_reason?: unknown }).intake_review_reason).toBeUndefined();
        expect((m as { intake_candidate_email_count?: unknown }).intake_candidate_email_count).toBeUndefined();
        expect((m as { intake_candidate_phone_count?: unknown }).intake_candidate_phone_count).toBeUndefined();
        expect((m as { intake?: unknown }).intake).toBeUndefined();
    });

    it("mergePublicSubmissionMeta strips spoofed prefill_snapshot", () => {
        const m = mergePublicSubmissionMeta(
            {
                prefill_snapshot: { evil: "x" },
                prefill_applied: true,
            } as Record<string, unknown>,
            "realhash"
        );
        expect((m as { prefill_snapshot?: unknown }).prefill_snapshot).toBeUndefined();
        expect((m as { prefill_applied?: unknown }).prefill_applied).toBeUndefined();
    });
});
