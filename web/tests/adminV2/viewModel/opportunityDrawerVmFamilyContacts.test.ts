import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpportunityFamilyContactRows } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("Opportunity VM family contacts", () => {
    it("renders primary plus one additional contact from VM record payload", () => {
        const record = {
            primary_person_id: "person-primary",
            customer_id: "cust-1",
            _opportunity_persons: [
                {
                    id: "op-1",
                    person_id: "person-primary",
                    role_type: "primary_contact",
                    name: "Alex Primary",
                },
                {
                    id: "op-2",
                    person_id: "person-secondary",
                    role_type: "guardian",
                    name: "Blair Guardian",
                },
            ],
            _customer_persons: [
                {
                    customer_id: "cust-1",
                    person_id: "person-secondary",
                    role_type: "guardian",
                    name: "Blair Guardian",
                },
            ],
            _additional_contacts_shell_count: 1,
        };
        const rows = buildOpportunityFamilyContactRows(record);
        const sorted = rows.filter((r) => r.person_id !== "person-primary");
        expect(sorted).toHaveLength(1);
        expect(sorted[0]?.name).toBe("Blair Guardian");
    });

    it("OpportunityDrawerInquiryWorkflowOverview treats VM first paint as family contacts ready", () => {
        const overview = read("components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx");
        expect(overview).toContain("vmFamilyContactsReady");
        expect(overview).toContain("opportunityFullHydrateApplied={vmFamilyContactsReady}");
        expect(overview).not.toContain('_record_surface ?? "").trim() === "full"');
    });

    it("shared canonical deps attach household customer persons + resolve the queue definition", () => {
        // S4.2 — the household attach + queue-definition resolution live in the shared-canonical-deps
        // module (Module C); the composer delegates to it via `resolveSharedCanonicalDeps`.
        const shared = read("lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts");
        expect(shared).toContain("attachOpportunityHouseholdCustomerPersonsForDrawer");
        expect(shared).toContain("resolveWorkUnitQueueDefinitionForDrawer");
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("resolveSharedCanonicalDeps");
    });
});

describe("Opportunity VM progressive status options", () => {
    it("header status VM includes deferred options on readonly_pill", () => {
        const header = read("lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelHeader.ts");
        expect(header).toContain('renderAs: "readonly_pill"');
        expect(header).toContain("options");
        expect(header).not.toContain('renderAs: "dropdown"');
    });

});
