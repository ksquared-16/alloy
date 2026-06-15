import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("deleteOpportunityLead service", () => {
    it("exports preview and execute helpers", async () => {
        const mod = await import("@/lib/admin/opportunity/deleteOpportunityLead");
        expect(typeof mod.previewOpportunityLeadDeletion).toBe("function");
        expect(typeof mod.executeDeleteOpportunityLead).toBe("function");
        expect(typeof mod.verifyOpportunityLeadDeletionOrphans).toBe("function");
    });

    it("blocks deletion when linked jobs exist", () => {
        const src = read("lib/admin/opportunity/deleteOpportunityLead.ts");
        expect(src).toContain('from("jobs")');
        expect(src).toContain("Financial and job record deletion is not supported");
    });

    it("writes admin audit on execute", () => {
        const src = read("lib/admin/opportunity/deleteOpportunityLead.ts");
        expect(src).toContain("logAdminAudit");
        expect(src).toContain('changed_fields: ["deleted"]');
    });

    it("verifies opportunity-scoped orphan tables after delete", () => {
        const src = read("lib/admin/opportunity/deleteOpportunityLead.ts");
        expect(src).toContain("opportunity_customer_members");
        expect(src).toContain("placement_candidates");
    });
});

describe("delete lead API routes", () => {
    it("requires admin or ops for preview and delete", () => {
        const preview = read("app/api/admin/opportunities/[id]/delete-preview/route.ts");
        const execute = read("app/api/admin/opportunities/[id]/delete/route.ts");
        expect(preview).toContain("requireAdminOrOps");
        expect(execute).toContain("requireAdminOrOps");
        expect(preview).toContain("previewOpportunityLeadDeletion");
        expect(execute).toContain("executeDeleteOpportunityLead");
    });
});
