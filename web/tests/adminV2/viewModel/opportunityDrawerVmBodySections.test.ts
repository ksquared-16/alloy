import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("Opportunity VM drawer body — production parity sections", () => {
    it("OpportunityDrawerVmRuntime delegates overview to inquiry workflow (not placeholder card)", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("OpportunityDrawerInquiryWorkflowOverview");
        expect(runtime).not.toContain("VmInquiryRightColumn");
        expect(runtime).not.toContain('String(record.name ?? record.title ?? "Inquiry")');
        expect(runtime).toContain("OpportunityDrawerVmTabPanes");
    });

    it("OpportunityDrawerVmRuntime uses production inquiry drawer title formatter", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("formatOpportunityInquiryDrawerTitle");
        expect(runtime).not.toContain('title={displayVm?.header.title ?? "Opportunity"}');
    });

    it("does not render Family inquiry placeholder title pattern from raw record name", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                name: "Family inquiry — Smith",
                _identity: {
                    primary_person: { label: "Smith Family" },
                },
            },
            "Enrollment"
        );
        expect(title).not.toMatch(/Family inquiry/i);
        expect(title).toContain("Smith");
    });

    it("FamilyContactsPanel supports multiple contacts via shell reserved count", () => {
        const overview = read("components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx");
        expect(overview).toContain("shellReservedAdditionalCount");
        expect(overview).toContain("_additional_contacts_shell_count");
    });

    it("OpportunityDrawerInquiryWorkflowOverview renders required production sections", () => {
        const overview = read("components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx");
        expect(overview).toContain("FamilyContactsPanel");
        expect(overview).toContain("OpportunityInquiryTourDateBlock");
        expect(overview).toContain("OpportunityInquirySummaryRightColumn");
        expect(overview).toContain("OpportunityInquiryChildrenSection");
        expect(overview).toContain('data-opportunity-lead-summary="true"');
        expect(overview).toContain('data-opportunity-tour-block="true"');
        expect(overview).toContain('data-opportunity-inquiry-children-section="true"');
        expect(overview).toContain('data-opportunity-inquiry-right-column="true"');
        expect(overview).toContain('data-opportunity-inquiry-summary="true"');
        expect(overview).not.toContain("VmInquiryRightColumn");
    });

    it("OpportunityDrawerVmRuntime renders lifecycle rail from VM queue definition", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("postTabStrip={displayVm ? lifecycleRail : undefined}");
        expect(runtime).toContain("RecordLifecycleRail");
        expect(runtime).toContain('data-testid="opportunity-lifecycle-rail"');
        expect(runtime).toContain("resolveRecordLifecycleRailModel");
    });

    it("OpportunityDrawerVmTabPanes covers full workflow tab strip", () => {
        const panes = read("components/admin/vmDrawer/OpportunityDrawerVmTabPanes.tsx");
        expect(panes).toContain('drawerTab === "notes"');
        expect(panes).toContain('drawerTab === "documents"');
        expect(panes).toContain('drawerTab === "activity"');
        expect(panes).toContain('drawerTab === "communications"');
    });

    it("OpportunityDrawerVmRuntime uses workflow tab strip fallback", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP");
        expect(runtime).toContain("data-opportunity-drawer-tab={tab}");
    });

    it("Phase A status is readonly from VM — no status-options fetch in VM runtime", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("statusControlReadonlyForFirstPaint");
        expect(runtime).not.toContain("status-options");
        expect(runtime).not.toContain("statusDefsForDrawer");
    });

    it("VM payload hook does not call legacy bootstrap or drawer_primary", () => {
        const hook = read("lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload.ts");
        expect(hook).toContain("loadOpportunityDrawerViaViewModel");
        expect(hook).not.toContain("fetchOpportunityDrawerOperationalBootstrap");
        expect(hook).not.toContain("drawer_primary");
        expect(hook).not.toContain("runLegacyEntityFetch");
    });

    it("overview pairs runtime marker with production inquiry summary shell", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const overview = read("components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx");
        expect(runtime).toContain("data-drawer-vm-runtime-overview");
        expect(overview).toContain("oppInqLeadSummaryShellClassName");
        expect(overview).toContain('data-opportunity-inquiry-summary="true"');
    });
});

describe("Opportunity VM body regression guard", () => {
    it("must not revert to slim VmInquiryRightColumn-only overview", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).not.toContain("VmInquiryRightColumn");
        expect(runtime).toContain("data-adminv2-opportunity-drawer-body");
    });
});
