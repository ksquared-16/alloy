import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OperationalEnrollmentOpportunityReadout from "@/components/childcareOperational/OperationalEnrollmentOpportunityReadout";

const mockFlag = vi.fn();
vi.mock("@/lib/childcareOperational/featureFlag", () => ({
    isChildcareOperationalEnrollmentV1EnabledClient: () => mockFlag(),
}));

describe("OperationalEnrollmentOpportunityReadout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders nothing when feature flag is off", () => {
        mockFlag.mockReturnValue(false);
        const html = renderToStaticMarkup(
            <OperationalEnrollmentOpportunityReadout
                opportunityId="opp-1"
                opportunityStatusKey="enrolled"
                rows={[{ id: "ocm-1", display_name: "Kid", customer_member_id: "cm-1" }]}
            />
        );
        expect(html).toBe("");
    });

    it("renders nothing when opportunity is not enrolled", () => {
        mockFlag.mockReturnValue(true);
        const html = renderToStaticMarkup(
            <OperationalEnrollmentOpportunityReadout
                opportunityId="opp-1"
                opportunityStatusKey="waitlisted"
                rows={[{ id: "ocm-1", display_name: "Kid", customer_member_id: "cm-1" }]}
            />
        );
        expect(html).toBe("");
    });
});
