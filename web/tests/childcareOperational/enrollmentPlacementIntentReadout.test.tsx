import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EnrollmentPlacementIntentReadout from "@/components/childcareOperational/EnrollmentPlacementIntentReadout";

const mockFlag = vi.fn();
vi.mock("@/lib/childcareOperational/featureFlag", () => ({
    isChildcareOperationalEnrollmentV1EnabledClient: () => mockFlag(),
}));

describe("EnrollmentPlacementIntentReadout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders nothing when feature flag is off", () => {
        mockFlag.mockReturnValue(false);
        const html = renderToStaticMarkup(
            <EnrollmentPlacementIntentReadout
                rows={[
                    {
                        id: "ocm-1",
                        display_name: "Kid",
                        desired_schedule_label: "Full time",
                    },
                ]}
            />
        );
        expect(html).toBe("");
    });

    it("shows proposed schedule intent when flag is on", () => {
        mockFlag.mockReturnValue(true);
        const html = renderToStaticMarkup(
            <EnrollmentPlacementIntentReadout
                rows={[
                    {
                        id: "ocm-1",
                        display_name: "Kid",
                        desired_schedule_label: "Full time",
                        desired_program_label: "Infant",
                    },
                ]}
            />
        );
        expect(html).toContain("data-enrollment-placement-intent-readout");
        expect(html).toContain("Proposed schedule");
        expect(html).toContain("Full time");
        expect(html).toContain("before tour");
    });
});
