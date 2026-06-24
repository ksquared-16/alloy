import { describe, expect, it } from "vitest";
import {
    formatOperationalEnrollmentAgreementStatus,
    formatWeekdaySelection,
    OPERATIONAL_ENROLLMENT_WARNING_LABELS,
    resolveOperationalEnrollmentFetchParams,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";

describe("fetchOperationalEnrollment helpers", () => {
    const siteId = "11111111-1111-4111-8111-111111111111";
    const siteNine = "22222222-2222-4222-8222-222222222222";

    it("resolves customer member and site ids from child runtime record", () => {
        const params = resolveOperationalEnrollmentFetchParams({
            customer_member_id: "cm-1",
            "inquiry_child.location_id": siteId,
        });
        expect(params.customerMemberId).toBe("cm-1");
        expect(params.siteLocationId).toBe(siteId);
    });

    it("falls back to enrollment mirror site when child site missing", () => {
        const params = resolveOperationalEnrollmentFetchParams({
            "child.customer_member_id": "cm-2",
            _enrollment_mirror: [{ location_id: siteNine }],
        });
        expect(params.customerMemberId).toBe("cm-2");
        expect(params.siteLocationId).toBe(siteNine);
    });

    it("formats agreement status and weekday labels", () => {
        expect(formatOperationalEnrollmentAgreementStatus("pending_start")).toBe("pending start");
        expect(formatWeekdaySelection([1, 3, 5])).toBe("Mon, Wed, Fri");
        expect(OPERATIONAL_ENROLLMENT_WARNING_LABELS.missing_placement).toBe("Missing placement");
    });
});
