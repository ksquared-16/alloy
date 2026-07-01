import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChildOverviewRuntimeComposition from "@/components/layout/child/ChildOverviewRuntimeComposition";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";

const mockFlag = vi.fn();
vi.mock("@/lib/childcareOperational/featureFlag", () => ({
    isChildcareOperationalEnrollmentV1EnabledClient: () => mockFlag(),
}));

vi.mock("@/components/childcareOperational/ChildOperationalEnrollmentPanel", () => ({
    default: () => <div data-testid="operational-panel">panel</div>,
    ChildOperationalEnrollmentPanelShell: () => <div data-testid="operational-panel-shell">panel</div>,
}));

describe("ChildOverviewRuntimeComposition schedule flag gate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not mount schedule_attendance slot when flag is off", () => {
        mockFlag.mockReturnValue(false);
        const html = renderToStaticMarkup(
            <ChildOverviewRuntimeComposition
                doc={buildChildDrawerDefaultDoc()}
                record={{ customer_member_id: "cm-1" }}
                entityId="person-1"
            />
        );
        expect(html).not.toContain("data-child-overview-slot=\"schedule_attendance\"");
    });

    it("mounts schedule_attendance slot when flag is on", () => {
        mockFlag.mockReturnValue(true);
        const html = renderToStaticMarkup(
            <ChildOverviewRuntimeComposition
                doc={buildChildDrawerDefaultDoc()}
                record={{
                    customer_member_id: "cm-1",
                    "inquiry_child.location_id": "11111111-1111-4111-8111-111111111111",
                }}
                entityId="person-1"
            />
        );
        expect(html).toContain("data-child-overview-slot=\"schedule_attendance\"");
    });
});
