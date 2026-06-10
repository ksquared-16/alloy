import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerOverviewPanelShell from "@/components/layout/DrawerOverviewPanelShell";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_PANEL_SURFACE,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
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
