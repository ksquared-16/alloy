/**
 * Patch 7 — Lead drawer visual renderer smoke markers (production variant).
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadOverviewRuntimeComposition from "@/components/layout/LeadOverviewRuntimeComposition";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { leadOverviewCompositionHints } from "@/lib/layout/runtime/leadOverviewComposition";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";

describe("lead drawer visual renderer (Patch 7)", () => {
    const doc = buildLeadDrawerDefaultDoc();
    const record = buildProofOpportunityRecord();
    const split = splitDrawerLayoutDocShellZones(doc, "opportunity");

    it("renders compact summary strip widget markers in production", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeCompositionProvider value={leadOverviewCompositionHints()}>
                <LayoutRuntimePlanView
                    doc={split.summaryDoc}
                    record={record}
                    variant="production"
                    sectionPresentation="summary_strip"
                />
            </LayoutRuntimeCompositionProvider>,
        );
        expect(html).toContain('data-layout-runtime-summary-widget="true"');
        expect(html).toContain('data-lead-enrollment-health-summary="true"');
        expect(html).toContain('data-layout-runtime-summary-row="true"');
    });

    it("renders enrollment card list via composition", () => {
        const html = renderToStaticMarkup(
            <LeadOverviewRuntimeComposition
                doc={split.bodyDoc}
                record={record}
                entityId="opp-1"
            />,
        );
        expect(html).toContain('data-lead-enrollment-card-list="true"');
        expect(html).toContain('data-lead-overview-composition="true"');
    });

    it("renders lead operating decision cards in strip", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeCompositionProvider value={leadOverviewCompositionHints()}>
                <LayoutRuntimePlanView
                    doc={split.summaryDoc}
                    record={record}
                    variant="production"
                    sectionPresentation="summary_strip"
                />
            </LayoutRuntimeCompositionProvider>,
        );
        expect(html).toContain('data-lead-operating-summary-card="true"');
        expect(html).toContain('data-lead-operating-summary-card-key="last_touch"');
        expect(html).toContain('data-lead-last-touch-summary="true"');
        expect(html).toContain('data-lead-operating-summary-card-key="enrollment_health"');
    });

    it("uses flat read surfaces in composition body", () => {
        const html = renderToStaticMarkup(
            <LeadOverviewRuntimeComposition doc={split.bodyDoc} record={record} entityId="opp-1" />,
        );
        expect(html).not.toContain("focus-within:border-alloy-juniper/35");
    });
});
