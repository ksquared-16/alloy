import { describe, expect, it } from "vitest";
import { humanizeOperatorSlug } from "@/lib/forms/operatorDisplayLabels";
import { distributionLinkLabel } from "@/lib/forms/distributionPresentation";

describe("operatorDisplayLabels", () => {
    it("humanizeOperatorSlug converts keys to title case", () => {
        expect(humanizeOperatorSlug("new_enrollment_lead")).toBe("New Enrollment Lead");
    });

    it("distributionLinkLabel humanizes form key fallback", () => {
        expect(
            distributionLinkLabel(
                { id: "x", is_active: true, created_at: "", metadata: {} },
                "new_enrollment_lead"
            )
        ).toBe("New Enrollment Lead");
    });
});
