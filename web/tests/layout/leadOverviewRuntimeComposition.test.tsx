/**
 * Patch 8 — Lead overview composition render smoke markers.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadOverviewRuntimeComposition from "@/components/layout/LeadOverviewRuntimeComposition";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";

describe("LeadOverviewRuntimeComposition", () => {
    const doc = buildLeadDrawerDefaultDoc();
    const bodyDoc = splitDrawerLayoutDocShellZones(doc, "opportunity").bodyDoc;
    const record = buildProofOpportunityRecord();

    it("renders dashboard grid slots for v2 sections", () => {
        const html = renderToStaticMarkup(
            <LeadOverviewRuntimeComposition doc={bodyDoc} record={record} entityId="opp-1" />,
        );
        expect(html).toContain('data-lead-overview-composition="true"');
        expect(html).toContain('data-lead-overview-slot="household_contact"');
        expect(html).toContain('data-lead-overview-slot="children_enrollment"');
        expect(html).toContain('lg:col-span-7');
        expect(html).toContain('lg:col-span-2');
        expect(html).toContain('data-lead-overview-slot="right_rail"');
        expect(html).toContain('data-lead-overview-slot="lead_source"');
        expect(html).toContain('data-lead-overview-composition-section="children_enrollment"');
    });
});
