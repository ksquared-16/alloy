import { describe, it, expect } from "vitest";
import { resolveCustomerIdFromWorkspaceEntry } from "@/lib/communications/v2/familyWorkspace/resolveCustomerIdFromWorkspaceEntry";

describe("resolveCustomerIdFromWorkspaceEntry", () => {
    it("prefers explicit customerId", () => {
        expect(resolveCustomerIdFromWorkspaceEntry({ customerId: "c1", threadPrimaryEntity: { type: "customer", id: "c2" } })).toBe("c1");
    });
    it("falls back to thread primaryEntity customer", () => {
        expect(resolveCustomerIdFromWorkspaceEntry({ threadPrimaryEntity: { type: "customer", id: "c2" } })).toBe("c2");
    });
    it("falls back to opportunity customer id", () => {
        expect(resolveCustomerIdFromWorkspaceEntry({ threadPrimaryEntity: { type: "person", id: "p1" }, opportunityCustomerId: "c3" })).toBe("c3");
    });
    it("returns null when nothing resolvable", () => {
        expect(resolveCustomerIdFromWorkspaceEntry({ threadPrimaryEntity: { type: "person", id: "p1" } })).toBeNull();
    });
});
