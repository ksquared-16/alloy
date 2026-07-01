/**
 * Patch 12 — Lead command header (not proof shell).
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadDrawerCommandHeader from "@/components/layout/lead/LeadDrawerCommandHeader";

describe("LeadDrawerCommandHeader", () => {
    it("renders dedicated lead command header root and identity block", () => {
        const html = renderToStaticMarkup(
            <LeadDrawerCommandHeader
                title="Mitchell Household"
                record={{
                    "person.primary_contact_name": "Jamie Mitchell",
                    _customer_name: "Mitchell Household",
                }}
                locationLabel="South Campus"
                tabs={[{ key: "overview", label: "Overview" }]}
                activeTab="overview"
                onTabSelect={() => {}}
                lifecycleRail={<nav data-test-lifecycle="true">Rail</nav>}
                actionsControl={<span data-test-actions="true">Actions</span>}
                closeButton={<button type="button">Close</button>}
            />,
        );
        expect(html).toContain('data-lead-drawer-command-header-root="true"');
        expect(html).toContain('data-lead-drawer-command-header="true"');
        expect(html).toContain('data-lead-drawer-header-meta-row="true"');
        expect(html).toContain('data-lead-drawer-header-campus-chip="true"');
        expect(html).not.toContain('data-proof-layout-header-variant="opportunity-drawer-runtime"');
        expect(html).toContain("Jamie Mitchell");
        expect(html).toContain("Mitchell Household");
        expect(html).toContain("South Campus");
        expect(html).not.toContain("ProofRecordModalHeaderShell");
    });
});
