import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("customer_members status deprecation — Phase 2", () => {
    it("customer-members list route does not filter or decorate roster status", () => {
        const src = read("app/api/admin/customer-members/route.ts");
        expect(src).not.toContain("status_key");
        expect(src).not.toContain("fetchEffectiveStatusDefinitions");
        expect(src).not.toContain("_status_display");
    });

    it("customer-members PATCH route ignores roster status writes", () => {
        const src = read("app/api/admin/customer-members/[id]/route.ts");
        expect(src).not.toContain("status_key");
        expect(src).not.toContain("emitStatusChangedEvent");
    });

    it("legacy customer members list has no status filter UI", () => {
        const src = read("app/legacy-admin/customer-members/CustomerMembersClient.tsx");
        expect(src).not.toContain("statusKeyFilter");
        expect(src).not.toContain("status-definitions?entity_type=customer_members");
        expect(src).not.toContain("status_key");
    });

    it("unified drawer status excludes customer_members", () => {
        const src = read("lib/admin/unifiedDrawerStatus.ts");
        expect(src).not.toContain("customer_members");
    });

    it("customer member field registry excludes status_key native column", () => {
        const src = read("lib/fields/customerMemberFieldRegistry.ts");
        expect(src).not.toContain('"status_key"');
    });

    it("entity presentation excludes customer_members status fields", () => {
        const src = read("lib/entityPresentation.ts");
        const block = src.slice(src.indexOf("customer_members: {"), src.indexOf("contacts: {"));
        expect(block).not.toContain("_status_display");
        expect(block).not.toContain('"status_key"');
    });

    it("search does not fetch customer_members status definitions", () => {
        // Re-pointed when the V1 service was retired. The invariant is about
        // SEARCH, not about a particular file existing: a child's status must
        // never be read from a customer_members status vocabulary. Asserting it
        // against the live Search V2 modules keeps the guard meaningful instead
        // of tying it to a deleted implementation.
        for (const file of ["lib/search/searchEnrichment.ts", "lib/search/searchRetrieval.ts", "lib/search/runSearch.ts"]) {
            const src = read(file);
            expect(src).not.toMatch(/fetchEffectiveStatusDefinitions\([^)]*["']customer_members["']/);
            expect(src).not.toContain("memberStatusLabels");
        }
    });
});
