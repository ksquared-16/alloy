import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOptimisticInquiryChildBlock } from "@/lib/admin/buildOptimisticInquiryChildBlock";
import { assertAddInquiryChildCreationResult } from "@/lib/admin/actions/addInquiryChildActionContract";
import { hydrateQueueRowInquiryChildrenPersonIds } from "@/lib/layout/runtime/hydrateQueueRowInquiryChildrenPersonIds";
import { extractQueueRowRelatedDrawerTargets } from "@/lib/workspace/viewModels/queueRowRelatedDrawerTargets";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("child identity creation paths", () => {
    it("Create Lead path links person_id on customer_members insert", () => {
        const src = read("lib/admin/actions/createLeadChildOcmPersistence.ts");
        expect(src).toContain("findOrCreateChildPersonInOrg");
        expect(src).toContain("person_id: childPerson.person_id");
    });

    it("Add Child customer-members POST links person_id for children", () => {
        const route = read("app/api/admin/customer-members/route.ts");
        const submit = read("lib/admin/actions/submitAddInquiryChildFromDrawer.ts");
        expect(route).toContain("findOrCreateChildPersonInOrg");
        expect(route).toContain('relationship === "child"');
        expect(submit).toContain("assertAddInquiryChildCreationResult");
        expect(submit).toContain("Child was saved but is missing a linked person identity");
    });

    it("Add Child submit result includes linkable person_id", () => {
        const result = assertAddInquiryChildCreationResult({
            person_id: "person-1",
            customer_member_id: "cm-1",
            ocm_id: "ocm-1",
        });
        expect(result.person_id).toBe("person-1");

        const block = buildOptimisticInquiryChildBlock(result, {
            first_name: "Sam",
            last_name: "Lee",
            date_of_birth: "2020-01-15",
        });
        expect(block.person_id).toBe("person-1");

        const hydrated = hydrateQueueRowInquiryChildrenPersonIds(
            [{ display_name: "Sam Lee", customer_member_id: "cm-1" }],
            [{ personId: "person-1", customerMemberId: "cm-1", displayName: "Sam Lee", dob: "2020-01-15" }],
        );
        const targets = extractQueueRowRelatedDrawerTargets(
            { id: "opp-1", _inquiry_children: hydrated },
            "opp-1",
        );
        expect(targets.childPersonId).toBe("person-1");
    });

});
