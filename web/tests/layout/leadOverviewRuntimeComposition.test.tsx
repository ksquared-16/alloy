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

    it("renders main-zone section flow for published layout sections", () => {
        const html = renderToStaticMarkup(
            <LeadOverviewRuntimeComposition doc={bodyDoc} record={record} entityId="opp-1" />,
        );
        expect(html).toContain('data-lead-overview-composition="true"');
        expect(html).toContain('data-lead-overview-slot="main_zone"');
        expect(html).toContain('data-lead-overview-main-zone-flow="true"');
        expect(html).toContain('data-layout-runtime-section-flow="true"');
        expect(html).toContain('data-lead-overview-slot="right_rail"');
        expect(html).toContain('data-layout-runtime-section-key="children_enrollment"');
        expect(html).toContain('data-layout-runtime-section-key="household_contact"');
        expect(html).toContain("adminv2-drawer-overview-shell-grid");
        expect(html).toContain("adminv2-drawer-overview-main-zone-flow");
        expect(html).not.toContain('data-lead-overview-slot="household_contact"');
        expect(html).not.toContain('data-lead-overview-slot="children_enrollment"');
    });
});
