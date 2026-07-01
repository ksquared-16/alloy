import { describe, expect, it } from "vitest";
import {
    formsCaseFileRegionTitle,
    formsCaseFileStack,
} from "@/lib/forms/review/formsReviewClassTokens";
import {
    OPERATIONAL_SPACING_SCALE_PX,
    isOperationalSpacingPx,
    opGap,
    opSpaceY,
    operationalSpacingUnit,
} from "@/lib/operational/ui/operationalVisualSpacing";
import {
    opCaseFileTitle,
    opGroupedSurface,
    opInsightSummary,
    opIntelligenceSurface,
    opMetadata,
    opPageTitle,
    opSectionTitle,
    opStackRegion,
} from "@/lib/operational/ui/operationalVisualTokens";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { OperationalPageHeader } from "@/components/operational/ui/OperationalPageHeader";
import { BosReviewSummaryPlaceholder } from "@/components/forms/review/BosReviewSummaryPlaceholder";

describe("operationalVisualTokens", () => {
    it("exports core typography roles as non-empty class strings", () => {
        expect(opPageTitle).toContain("text-xl");
        expect(opSectionTitle).toContain("font-semibold");
        expect(opCaseFileTitle).toContain("text-lg");
        expect(opMetadata).toContain("text-xs");
        expect(opInsightSummary).toContain("text-sm");
    });

    it("uses alloy palette tokens — no legacy hex in class strings", () => {
        const samples = [opPageTitle, opSectionTitle, opIntelligenceSurface, opMetadata];
        for (const token of samples) {
            expect(token).not.toMatch(/#[0-9a-f]{3,8}/i);
            expect(token).toMatch(/alloy-/);
        }
    });

    it("intelligence surface includes subtle left accent without heavy double border", () => {
        expect(opIntelligenceSurface).toContain("border-l-");
        expect(opIntelligenceSurface).toContain("alloy-blue");
        expect(opIntelligenceSurface).not.toContain("shadow-sm");
    });

    it("grouped surface uses single ring container", () => {
        expect(opGroupedSurface).toContain("divide-y");
        expect(opGroupedSurface).toContain("ring-1");
    });

    it("formsReviewClassTokens re-exports align with operational stack and section title", () => {
        expect(formsCaseFileStack).toBe(opStackRegion);
        expect(formsCaseFileRegionTitle).toBe(opSectionTitle);
    });
});

describe("operationalVisualSpacing", () => {
    it("enforces 8·12·16·20·24px scale", () => {
        expect(OPERATIONAL_SPACING_SCALE_PX).toEqual([8, 12, 16, 20, 24]);
        expect(isOperationalSpacingPx(16)).toBe(true);
        expect(isOperationalSpacingPx(10)).toBe(false);
    });

    it("maps px to tailwind spacing units", () => {
        expect(operationalSpacingUnit(8)).toBe(2);
        expect(operationalSpacingUnit(16)).toBe(4);
        expect(opSpaceY(16)).toBe("space-y-4");
        expect(opGap(12)).toBe("gap-3");
    });
});

describe("operational typography adoption", () => {
    it("OperationalPageHeader uses page title hierarchy", () => {
        const html = renderToStaticMarkup(
            <OperationalPageHeader title="Packet review" subtitle="Enrollment intake" />
        );
        expect(html).toContain('data-testid="operational-page-header"');
        expect(html).toContain("Packet review");
        expect(html).toContain("Enrollment intake");
        expect(html).toContain("text-xl");
    });

    it("BosReviewSummaryPlaceholder inherits operational intelligence surface", () => {
        const html = renderToStaticMarkup(<BosReviewSummaryPlaceholder />);
        expect(html).toContain("border-l-");
        expect(html).toContain("Review assist");
        expect(html).not.toContain("Sparkles");
    });
});
