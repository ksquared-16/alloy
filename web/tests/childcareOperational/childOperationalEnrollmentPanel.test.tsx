import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChildOperationalEnrollmentPanel from "@/components/childcareOperational/ChildOperationalEnrollmentPanel";

const mockFlag = vi.fn();
vi.mock("@/lib/childcareOperational/featureFlag", () => ({
    isChildcareOperationalEnrollmentV1EnabledClient: () => mockFlag(),
}));

describe("ChildOperationalEnrollmentPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders nothing when feature flag is off", () => {
        mockFlag.mockReturnValue(false);
        const html = renderToStaticMarkup(
            <ChildOperationalEnrollmentPanel
                record={{
                    customer_member_id: "cm-1",
                    "inquiry_child.location_id": "11111111-1111-4111-8111-111111111111",
                }}
            />
        );
        expect(html).toBe("");
    });

    it("shows empty state shell when flag on before fetch resolves", () => {
        mockFlag.mockReturnValue(true);
        const html = renderToStaticMarkup(
            <ChildOperationalEnrollmentPanel
                record={{
                    customer_member_id: "cm-1",
                    "inquiry_child.location_id": "11111111-1111-4111-8111-111111111111",
                }}
            />
        );
        expect(html).toContain("data-child-operational-enrollment-panel");
        expect(html).toContain("No enrollment schedule or placement proposal yet");
    });
});
