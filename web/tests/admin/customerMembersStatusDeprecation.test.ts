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

    it("legacy drawer no longer renders customer_members status control", () => {
        const src = read("components/admin/AdminEntityDrawerLegacy.tsx");
        expect(src).not.toMatch(
            /drawer\.type === "customer_members"[\s\S]{0,2000}formData\.status_key/
        );
        const statusEntityMatch = src.match(/const STATUS_ENTITY_TYPES = \[([\s\S]*?)\];/);
        expect(statusEntityMatch).not.toBeNull();
        expect(statusEntityMatch![1]).not.toContain("customer_members");
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

    it("global search does not fetch customer_members status definitions", () => {
        const src = read("lib/admin/globalSearch/globalRecordSearchService.ts");
        expect(src).not.toMatch(/fetchEffectiveStatusDefinitions\([^)]*["']customer_members["']/);
        expect(src).toContain("resolveChildPersonStatusKeyByPersonId");
        expect(src).not.toContain("memberStatusLabels");
    });
});
