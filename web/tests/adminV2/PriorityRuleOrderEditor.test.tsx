import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriorityRuleOrderEditor } from "@/components/adminV2/settings/PriorityRuleOrderEditor";
import { CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1 } from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

const fb = CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key;
const all = new Set(CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1);

describe("PriorityRuleOrderEditor", () => {
    it("renders operator factor labels, source mapping, and move controls", () => {
        const html = renderToStaticMarkup(
            <PriorityRuleOrderEditor
                order={[...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1]}
                enabledKeys={all}
                fallbackBucketKey={fb}
                onOrderChange={() => {}}
                onEnabledKeysChange={() => {}}
            />
        );
        expect(html).toContain("Employee families");
        expect(html).toContain("Person → Employee = Yes");
        expect(html).toContain("persons.is_employee");
        expect(html).toContain("Outcome = Enrolled");
        expect(html).toContain("same location");
        expect(html).toContain("different location");
        expect(html).toContain("Move up");
        expect(html).toContain("Move down");
        expect(html).toContain("(always on · last)");
        expect(html).not.toContain("Priority rule order");
    });

    it("renders selectable active and available factor catalogs with drag and keyboard controls", () => {
        const enabled = new Set(all);
        enabled.delete("tier_sister_center");
        const html = renderToStaticMarkup(
            <PriorityRuleOrderEditor
                order={[...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1]}
                enabledKeys={enabled}
                fallbackBucketKey={fb}
                selectableCatalog
                onOrderChange={() => {}}
                onEnabledKeysChange={() => {}}
            />
        );

        expect(html).toContain("Active ranking");
        expect(html).toContain("Available factors");
        expect(html).toContain("Drag to reorder");
        expect(html).toContain("draggable");
        expect(html).toContain("Add Siblings enrolled at another location to ranking");
        expect(html).toContain("Remove");
        expect(html).toContain("Move Employee families up");
        expect(html).toContain("Move Employee families down");
        expect(html).toContain("(always on · last)");
    });
});
