import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriorityRuleOrderEditor } from "@/components/adminV2/settings/PriorityRuleOrderEditor";
import { CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1 } from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

describe("PriorityRuleOrderEditor", () => {
    it("renders rule labels and move controls", () => {
        const html = renderToStaticMarkup(
            <PriorityRuleOrderEditor
                order={[...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1]}
                fallbackBucketKey={CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key}
                onChange={() => {}}
            />
        );
        expect(html).toContain("Priority rule order");
        expect(html).toContain("Move up");
        expect(html).toContain("Move down");
        expect(html).toContain("Sibling enrolled at center");
        expect(html).toContain("(always last)");
    });
});
