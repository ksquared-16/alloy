import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FUTURE_MODULE_METADATA_KEY } from "@/lib/layout/runtime/proofLayoutHelpers";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { sliceLayoutDocSections } from "@/lib/layout/runtime/childOverviewComposition";
import { collectLayoutItems } from "@/lib/layout/runtime/classifyLayoutItemBinding";
import { resolveLayoutRuntimeWidgetKey } from "@/lib/layout/runtime/resolveLayoutRuntimeWidgetKey";
import { isChildcareOperationalEnrollmentV1EnabledClient } from "@/lib/childcareOperational/featureFlag";

vi.mock("@/components/childcareOperational/ChildOperationalEnrollmentPanel", () => ({
    __esModule: true,
    default: () => <div data-testid="operational-panel">panel</div>,
    ChildOperationalEnrollmentPanelShell: () => <div data-testid="operational-panel-shell">panel</div>,
}));

function expandScheduleSection(doc: ReturnType<typeof sliceLayoutDocSections>) {
    return {
        ...doc,
        sections: doc.sections.map((section) => ({
            ...section,
            defaultExpanded: true,
            rows: section.rows.map((row) => ({
                ...row,
                columns: row.columns.map((col) => ({
                    ...col,
                    items: col.items.map((item) => ({ ...item })),
                })),
            })),
        })),
    };
}

describe("child schedule_attendance published layout compatibility", () => {
    const scheduleDoc = expandScheduleSection(
        sliceLayoutDocSections(buildChildDrawerDefaultDoc(), ["schedule_attendance"]),
    );
    const legacyFutureDoc = {
        ...scheduleDoc,
        sections: scheduleDoc.sections.map((section) => ({
            ...section,
            rows: section.rows.map((row) => ({
                ...row,
                columns: row.columns.map((col) => ({
                    ...col,
                    items: col.items.map((item) => ({
                        ...item,
                        refKey: "schedule_attendance",
                        metadata: { ...item.metadata, [FUTURE_MODULE_METADATA_KEY]: true },
                        widget: { widgetKey: "child.schedule_attendance", displayMode: "summary" },
                    })),
                })),
            })),
        })),
    };

    beforeEach(() => {
        vi.unstubAllEnvs();
    });

    it("renders operational panel for legacy schedule_attendance widget when flag on", async () => {
        vi.stubEnv("NEXT_PUBLIC_CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED", "true");
        expect(isChildcareOperationalEnrollmentV1EnabledClient()).toBe(true);
        const widgetItem = collectLayoutItems(legacyFutureDoc)[0];
        expect(widgetItem?.kind).toBe("widget_placeholder");
        expect(resolveLayoutRuntimeWidgetKey(widgetItem!)).toBe("schedule_attendance");
        const { default: LayoutRuntimePlanView } = await import("@/components/layout/LayoutRuntimePlanView");
        const html = renderToStaticMarkup(
            <LayoutRuntimePlanView
                doc={legacyFutureDoc}
                record={{
                    customer_member_id: "cm-1",
                    "inquiry_child.location_id": "11111111-1111-4111-8111-111111111111",
                }}
                entityId="person-1"
                variant="production"
                useSectionFlow={false}
            />
        );
        expect(html).toContain("data-testid=\"operational-panel\"");
    });

    it("renders nothing for legacy future widget when flag off", async () => {
        vi.stubEnv("NEXT_PUBLIC_CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED", "false");
        const { default: LayoutRuntimePlanView } = await import("@/components/layout/LayoutRuntimePlanView");
        const html = renderToStaticMarkup(
            <LayoutRuntimePlanView
                doc={legacyFutureDoc}
                record={{ customer_member_id: "cm-1" }}
                entityId="person-1"
                variant="production"
                useSectionFlow={false}
            />
        );
        expect(html).not.toContain("data-testid=\"operational-panel\"");
        expect(html).not.toContain("Future module");
    });

    it("does not crash when widget key is missing", async () => {
        vi.stubEnv("NEXT_PUBLIC_CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED", "true");
        const { default: LayoutRuntimePlanView } = await import("@/components/layout/LayoutRuntimePlanView");
        const brokenDoc = {
            ...scheduleDoc,
            sections: scheduleDoc.sections.map((section) => ({
                ...section,
                rows: section.rows.map((row) => ({
                    ...row,
                    columns: row.columns.map((col) => ({
                        ...col,
                        items: col.items.map((item) => ({
                            ...item,
                            refKey: "unknown_future_widget",
                            widget: { widgetKey: "child.schedule_attendance", displayMode: "summary" },
                        })),
                    })),
                })),
            })),
        };
        const html = renderToStaticMarkup(
            <LayoutRuntimePlanView
                doc={brokenDoc}
                record={{ customer_member_id: "cm-1" }}
                entityId="person-1"
                variant="production"
                useSectionFlow={false}
            />
        );
        expect(html).toContain("Enrollment &amp; schedule");
        expect(html).not.toContain("data-testid=\"operational-panel\"");
    });
});
