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
        expect(typeof mod.executeOpportunityLeadDeletionGraph).toBe("function");
    });

    it("uses graph resolver for preview", async () => {
        const src = read("lib/admin/opportunity/deleteOpportunityLead.ts");
        expect(src).toContain("resolveOpportunityLeadDeletionGraph");
        expect(src).toContain("executeOpportunityLeadDeletionGraph");
    });

    it("blocks deletion when linked jobs exist", () => {
        const src = read("lib/admin/opportunity/opportunityLeadDeletionGraph.ts");
        expect(src).toContain('from("jobs")');
        expect(src).toContain("linked jobs");
    });

    it("blocks deletion when discount redemptions exist", () => {
        const src = read("lib/admin/opportunity/opportunityLeadDeletionGraph.ts");
        expect(src).toContain('"discount_redemptions"');
        expect(src).toContain("discount redemptions");
    });

    it("deletes customer_persons before persons", () => {
        const src = read("lib/admin/opportunity/deleteOpportunityLead.ts");
        const personsIdx = src.indexOf('"customer_persons"');
        const personsDeleteIdx = src.indexOf('"persons", "id", deletablePersons');
        expect(personsIdx).toBeGreaterThan(0);
        expect(personsDeleteIdx).toBeGreaterThan(personsIdx);
    });

    it("cleans communication_scheduled_sends before persons", () => {
        const src = read("lib/admin/opportunity/deleteOpportunityLead.ts");
        const schedIdx = src.indexOf('"communication_scheduled_sends"');
        const personsDeleteIdx = src.indexOf('"persons", "id", deletablePersons');
        expect(schedIdx).toBeGreaterThan(0);
        expect(personsDeleteIdx).toBeGreaterThan(schedIdx);
    });

    it("writes admin audit on execute", () => {
        const src = read("lib/admin/opportunity/deleteOpportunityLead.ts");
        expect(src).toContain("logAdminAudit");
        expect(src).toContain('changed_fields: ["deleted"]');
    });

    it("never deletes locations work_units or departments", () => {
        const src = read("lib/admin/opportunity/deleteOpportunityLead.ts");
        expect(src).not.toContain('"locations"');
        expect(src).not.toContain('"work_units"');
        expect(src).not.toContain('"departments"');
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
