import { describe, expect, it } from "vitest";

import { parseWorkUnitBootstrapOwnershipFromHref } from "@/lib/adminV2/workUnitBootstrapPrefetchFromDept";

describe("parseWorkUnitBootstrapOwnershipFromHref", () => {
    it("includes focus queue and attention bucket from dept oper href", () => {
        expect(
            parseWorkUnitBootstrapOwnershipFromHref(
                "/adminV2/workspace/dept/dept-1/work-unit/wu-2?queue=needs_attention&attention_bucket=stale",
                "dept-1",
                "site-1"
            )
        ).toEqual({
            departmentId: "dept-1",
            workUnitId: "wu-2",
            selectedSiteId: "site-1",
            focusQueue: "needs_attention",
            attentionBucket: "stale",
        });
    });
});
