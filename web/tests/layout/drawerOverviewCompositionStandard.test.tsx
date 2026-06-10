import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerOverviewPanelShell from "@/components/layout/DrawerOverviewPanelShell";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_PANEL_SURFACE,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { resolveLeadDrawerHouseholdProfile } from "@/lib/layout/runtime/resolveDrawerHouseholdProfile";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import {
    drawerOverviewSectionIsCenterpiece,
    resolveDrawerOverviewSectionEyebrow,
} from "@/lib/layout/runtime/drawerOverviewSectionPresentation";
import { buildLeadEnrollmentCardMetaPresentation } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";

describe("drawerOverviewCompositionStandard", () => {
    it("uses white drawer overview canvas", () => {
        expect(LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS).toContain("bg-white");
        expect(DRAWER_OVERVIEW_CANVAS_CLASS).toContain("bg-white");
    });

    it("panel surface includes pine left accent", () => {
        expect(DRAWER_OVERVIEW_PANEL_SURFACE).toContain("border-l-alloy-juniper");
    });
});

describe("drawerOverviewSectionPresentation", () => {
    it("resolves shared eyebrows across drawer types", () => {
        expect(resolveDrawerOverviewSectionEyebrow("household_contact")).toBe("Household");
        expect(resolveDrawerOverviewSectionEyebrow("family_relationships")).toBe("Family");
        expect(resolveDrawerOverviewSectionEyebrow("recent_activity")).toBe("Activity");
    });

    it("marks enrollment sections as centerpiece panels", () => {
        expect(drawerOverviewSectionIsCenterpiece("children_enrollment")).toBe(true);
        expect(drawerOverviewSectionIsCenterpiece("program_enrollment")).toBe(true);
        expect(drawerOverviewSectionIsCenterpiece("household_contact")).toBe(false);
    });
});

describe("DrawerOverviewPanelShell", () => {
    it("renders premium section chrome markers", () => {
        const html = renderToStaticMarkup(
            <DrawerOverviewPanelShell
                sectionKey="household_contact"
                eyebrow="Household"
                title="Household & Primary Contact"
            >
                <p>Body</p>
            </DrawerOverviewPanelShell>,
        );
        expect(html).toContain('data-drawer-overview-panel="true"');
        expect(html).toContain('data-drawer-overview-panel-section="household_contact"');
        expect(html).toContain("Household &amp; Primary Contact");
    });
});

describe("DrawerOverviewEmptyState", () => {
    it("renders premium empty marker without disabling section chrome", () => {
        const html = renderToStaticMarkup(
            <DrawerOverviewEmptyState message="No activity yet" hint="The first note will appear here." />,
        );
        expect(html).toContain('data-drawer-overview-empty-state="true"');
        expect(html).not.toContain("opacity-");
    });
});

describe("resolveLayoutRuntimeSectionVisibility premium empty sections", () => {
    it("keeps activity visible in composition shell when empty", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const activity = doc.sections.find((s) => s.key === "activity");
        expect(activity).toBeTruthy();
        expect(
            shouldRenderLayoutRuntimeSection(activity!, buildProofOpportunityRecord({ follow_up_notes: "" }), {
                compositionShell: true,
            }),
        ).toBe(true);
    });
});

describe("resolveLeadDrawerHouseholdProfile", () => {
    it("projects household name and primary contact channels", () => {
        const profile = resolveLeadDrawerHouseholdProfile(
            buildProofOpportunityRecord({
                last_name: "Patterson",
                "opportunity.location": "North Campus",
                "person.primary_contact_name": "Jimmy Patterson",
                "person.primary_email": "jimmy@patterson.com",
                "person.primary_phone": "7899877897",
            }),
        );
        expect(profile.householdName).toBe("Patterson Household");
        expect(profile.location).toBe("North Campus");
        expect(profile.primaryName).toBe("Jimmy Patterson");
    });
});

describe("BOS drawer header consistency", () => {
    it("uses juniper Work with BOS on person and lead drawer headers", () => {
        const personHeader = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerHeaderControls.tsx"),
            "utf8",
        );
        const leadHeader = readFileSync(
            join(process.cwd(), "components/admin/vmDrawer/OpportunityDrawerProofLayoutHeader.tsx"),
            "utf8",
        );
        expect(personHeader).toContain('actionVariant="juniper"');
        expect(leadHeader).toContain('bosActionVariant="juniper"');
    });
});

describe("buildLeadEnrollmentCardMetaPresentation", () => {
    it("structures birth line and labeled detail segments", () => {
        const presentation = buildLeadEnrollmentCardMetaPresentation(
            {
                "child.dob_age": "Jan 1, 2026 · 5m",
                "child.program": "Infant Full Day",
                "child.desired_start_date": "Aug 8, 2026",
                "child.schedule": "",
                "child.room": "",
                "child.location": "North Campus",
                "child.status": "",
            },
            [
                { label: "DOB / Age", refKey: "child.dob_age", width: "medium" },
                { label: "Program", refKey: "child.program", width: "medium" },
                { label: "Desired start", refKey: "child.desired_start_date", width: "medium" },
                { label: "Schedule", refKey: "child.schedule", width: "medium" },
                { label: "Classroom", refKey: "child.room", width: "medium" },
                { label: "Location", refKey: "child.location", width: "medium" },
                { label: "Status", refKey: "child.status", width: "medium" },
            ],
        );

        expect(presentation.birthLine).toBe("Born Jan 1, 2026 · 5m");
        expect(presentation.segments.find((s) => s.refKey === "child.program")?.display).toBe("Infant Full Day");
        expect(presentation.segments.find((s) => s.refKey === "child.schedule")?.isPlaceholder).toBe(true);
        expect(presentation.segments.find((s) => s.refKey === "child.desired_start_date")?.prefixLabel).toBe("Start");
    });
});
