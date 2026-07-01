import { describe, expect, it } from "vitest";

import {
    buildConfigProposalReviewHref,
    buildEntityResolveContext,
    resolveEntityTypeFromPhrase,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistEntityResolve";

describe("configLayoutAssistEntityResolve", () => {
    const ctx = buildEntityResolveContext(
        [
            {
                entity_type: "opportunities",
                singular: "Inquiry",
                plural: "Inquiries",
            },
        ],
        "opportunity"
    );

    it("resolves inquiry aliases to opportunity", () => {
        expect(resolveEntityTypeFromPhrase("inquiries", ctx)).toBe("opportunity");
        expect(resolveEntityTypeFromPhrase("inquiry", ctx)).toBe("opportunity");
        expect(resolveEntityTypeFromPhrase("the inquiries", ctx)).toBe("opportunity");
    });

    it("resolves opportunities label key to opportunity", () => {
        expect(resolveEntityTypeFromPhrase("opportunities", ctx)).toBe("opportunity");
    });

    it("uses tenant display labels", () => {
        expect(ctx.displayLabel("opportunity", "plural")).toBe("Inquiries");
        expect(ctx.displayLabel("opportunity", "singular")).toBe("Inquiry");
    });

    it("buildConfigProposalReviewHref includes proposalId", () => {
        const href = buildConfigProposalReviewHref("550e8400-e29b-41d4-a716-446655440000");
        expect(href).toContain("proposalId=550e8400-e29b-41d4-a716-446655440000");
    });
});
