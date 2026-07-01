import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChildOperationalEnrollmentPanel from "@/components/childcareOperational/ChildOperationalEnrollmentPanel";

const mockFlag = vi.fn();
vi.mock("@/lib/childcareOperational/featureFlag", () => ({
    isChildcareOperationalEnrollmentV1EnabledClient: () => mockFlag(),
}));

vi.mock("@/components/childcareOperational/OperationalEnrollmentEditActions", () => ({
    default: () => <div data-testid="edit-actions">actions</div>,
}));

describe("ChildOperationalEnrollmentPanel edit gate", () => {
    beforeEach(() => {
        mockFlag.mockReset();
    });

    it("hides panel when feature flag is off", () => {
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
});
