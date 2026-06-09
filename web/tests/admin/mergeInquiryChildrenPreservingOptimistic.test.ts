import { describe, expect, it } from "vitest";
import { mergeInquiryChildrenPreservingOptimistic } from "@/lib/admin/mergeInquiryChildrenPreservingOptimistic";

describe("mergeInquiryChildrenPreservingOptimistic", () => {
    it("returns server rows when previous is empty", () => {
        const server = [{ id: "ocm-1", customer_member_id: "cm-1" }];
        expect(mergeInquiryChildrenPreservingOptimistic([], server)).toEqual(server);
    });

    it("keeps optimistic rows missing from server until hydration", () => {
        const optimistic = [{ id: "ocm-new", customer_member_id: "cm-new", display_name: "New Child" }];
        const server = [{ id: "ocm-1", customer_member_id: "cm-1" }];
        expect(mergeInquiryChildrenPreservingOptimistic(optimistic, server)).toEqual([
            ...server,
            ...optimistic,
        ]);
    });

    it("drops optimistic row once server includes matching ocm id", () => {
        const optimistic = [{ id: "ocm-1", customer_member_id: "cm-1", display_name: "Stale" }];
        const server = [{ id: "ocm-1", customer_member_id: "cm-1", display_name: "Authoritative" }];
        expect(mergeInquiryChildrenPreservingOptimistic(optimistic, server)).toEqual(server);
    });

    it("matches by customer_member_id when ocm id differs", () => {
        const optimistic = [{ id: "temp", customer_member_id: "cm-1" }];
        const server = [{ id: "ocm-1", customer_member_id: "cm-1" }];
        expect(mergeInquiryChildrenPreservingOptimistic(optimistic, server)).toEqual(server);
    });
});
