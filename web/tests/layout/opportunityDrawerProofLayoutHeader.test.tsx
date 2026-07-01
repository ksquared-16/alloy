/**
 * Proof-layout header shell + contact/person binding tests.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProofRecordModalHeaderShell from "@/components/layout/proofShell/ProofRecordModalHeaderShell";
import { buildLayoutRuntimeDrawerBodyItemEvidence } from "@/lib/layout/runtime/buildLayoutRuntimeDrawerBodyItemEvidence";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildOpportunityLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";
import {
    buildPrimaryContactPersonRelation,
    resolveOpportunityPrimaryContactPerson,
} from "@/lib/layout/runtime/resolveOpportunityPrimaryContactPerson";

describe("ProofRecordModalHeaderShell", () => {
    it("renders proof-order rows: title-actions, tabs, lifecycle", () => {
        const html = renderToStaticMarkup(
            <ProofRecordModalHeaderShell
                title="Mitchell Household"
                locationLabel="Main Campus"
                statusControl={<span data-test-status="true">Status</span>}
                actionsControl={<span data-test-actions="true">Actions</span>}
                closeButton={<button type="button">Close</button>}
                attention={<p>Follow up on tour</p>}
                tabs={[{ key: "overview", label: "Overview" }]}
                activeTab="overview"
                onTabSelect={() => {}}
                lifecycleRail={<nav data-test-lifecycle="true">Rail</nav>}
            />,
        );
        expect(html.indexOf('data-proof-layout-header-row="title-actions"')).toBeLessThan(
            html.indexOf('data-proof-layout-header-row="attention"'),
        );
        expect(html.indexOf('data-proof-layout-header-row="attention"')).toBeLessThan(
            html.indexOf('data-proof-layout-header-row="tabs"'),
        );
        expect(html.indexOf('data-proof-layout-header-row="tabs"')).toBeLessThan(
            html.indexOf('data-proof-layout-header-row="lifecycle"'),
        );
        expect(html).toContain("Mitchell Household");
        expect(html).toContain("Main Campus");
        expect(html).toContain('data-test-status="true"');
        expect(html).toContain('data-test-actions="true"');
    });

    it("renders queue navigation in title-actions band above tabs when provided", () => {
        const html = renderToStaticMarkup(
            <ProofRecordModalHeaderShell
                title="Mitchell Household"
                actionsControl={<span>Actions</span>}
                closeButton={<button type="button">Close</button>}
                queueNavigation={<div data-test-queue-nav="true">Nav</div>}
                tabs={[{ key: "overview", label: "Overview" }]}
                activeTab="overview"
                onTabSelect={() => {}}
            />,
        );
        expect(html.indexOf('data-proof-layout-header-row="title-actions"')).toBeLessThan(
            html.indexOf('data-proof-layout-header-queue-navigation="true"'),
        );
        expect(html.indexOf('data-proof-layout-header-queue-navigation="true"')).toBeLessThan(
            html.indexOf('data-proof-layout-header-row="tabs"'),
        );
        expect(html).toContain('data-test-queue-nav="true"');
    });
});

describe("resolveOpportunityPrimaryContactPerson", () => {
    it("resolves contact from person fields only, not household name", () => {
        const contact = resolveOpportunityPrimaryContactPerson({
            name: "Mitchell Household",
            _customer_name: "Mitchell Household",
            "person.primary_contact_name": "Jamie Mitchell",
            "person.primary_phone": "(555) 111-2222",
        });
        expect(contact.displayName).toBe("Jamie Mitchell");
        expect(contact.phone).toBe("(555) 111-2222");
        expect(contact.hasPersonBinding).toBe(true);

        const withoutPerson = resolveOpportunityPrimaryContactPerson({
            name: "Mitchell Household",
            _customer_name: "Mitchell Household",
        });
        expect(withoutPerson.displayName).toBeNull();
        expect(withoutPerson.hasPersonBinding).toBe(false);
    });

    it("builds person entity relation for layout binding", () => {
        const contact = resolveOpportunityPrimaryContactPerson({
            "person.primary_contact_name": "Jamie Mitchell",
            "person.primary_email": "jamie@example.com",
        });
        const rel = buildPrimaryContactPersonRelation(contact);
        expect(rel?.entityType).toBe("person");
        expect(rel?.handle).toBe("Jamie Mitchell");
        expect(rel?.fields.primary_email).toBe("jamie@example.com");
    });
});

describe("buildLayoutRuntimeDrawerBodyItemEvidence", () => {
    it("marks configured fields as rendered even when values are blank", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-evidence",
            vmRecord: { name: "Test Household" },
        });
        const items = buildLayoutRuntimeDrawerBodyItemEvidence(doc, record);
        expect(items.length).toBeGreaterThan(0);
        const contactField = items.find((i) => i.refKey === "person.primary_contact_name");
        expect(contactField?.supported).toBe(true);
        expect(contactField?.rendered).toBe(true);
        expect(contactField?.valueFound).toBe(false);
    });
});

describe("buildOpportunityLayoutRuntimeRecordFromVm contact binding", () => {
    it("does not use household name as primary contact", () => {
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: {
                name: "Mitchell Household",
                _customer_name: "Mitchell Household",
            },
        });
        expect(record["person.primary_contact_name"]).toBe("");
        expect(record._relations?.primary_contact).toBeUndefined();
    });

    it("binds primary contact through person relation when person data exists", () => {
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-2",
            vmRecord: {
                name: "Mitchell Household",
                "person.primary_contact_name": "Jamie Mitchell",
                "person.primary_phone": "(555) 234-8901",
            },
        });
        expect(record["person.primary_contact_name"]).toBe("Jamie Mitchell");
        expect(record._relations?.primary_contact?.entityType).toBe("person");
        expect(record._relations?.primary_contact?.handle).toBe("Jamie Mitchell");
    });
});
