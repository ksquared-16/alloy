/**
 * Runtime disclosure wiring — Household + Children cards and shared components.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    setNestedGroupEnabled,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    buildChildIdentityRecordVM,
    buildHouseholdIdentityCardVM,
} from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { identityRowsForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityDisclosureVM";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

function readSrc(relativePath: string): string {
    return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function ctx(truth: Record<string, unknown>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: String(truth.id ?? "opp"), label: "Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: {
            work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

function householdRecord() {
    return {
        id: "opp-1",
        customer_id: "cust-1",
        "person.primary_contact_name": "Sarah Johnson",
        "person.primary_phone": "555-123-4567",
        "person.primary_email": "sarah@example.com",
        "opportunity.primary_person_id": "p-sarah",
        _opportunity_persons: [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson", phone: "555-123-4567", email: "sarah@example.com" },
            { person_id: "p-mike", role_type: "parent", name: "Michael Johnson", phone: "555-111-2222", email: "mike@example.com" },
        ],
        _inquiry_children: [{ id: "c1", display_name: "Emma Johnson", age: "6" }],
    };
}

beforeEach(() => {
    ensureRuntimeSurfacesRegistered();
});

describe("shared runtime components", () => {
    it("Household and Children use canonical disclosure state hook", () => {
        const household = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
        const children = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(household).toContain("useIdentityDisclosureState");
        expect(children).toContain("useIdentityDisclosureState");
        expect(household).toContain("IdentityDisclosureSurface");
        expect(children).toContain("IdentityDisclosureBackAction");
    });

    it("cards do not merge summary and context facts locally", () => {
        const household = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
        const children = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(household).not.toContain("composeSummaryAndContextFacts");
        expect(children).not.toContain("composeSummaryAndContextFacts");
    });
});

describe("household runtime disclosure", () => {
    it("summary shows both parents with configured summary fields", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.phone");
        config = addFieldToNestedGroup(config, "other_parent_guardian", "person.phone");
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        const other = card.sections.find((section) => section.key === "other_parent_guardian")?.items[0]!;
        expect(primary.summaryRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).toContain("person.phone");
        expect(other.summaryRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).toContain("person.phone");
    });

    it("context rows equal contextFactRows without summary merge", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.phone");
        config = addFieldToNestedGroup(config, "primary_contact", "person.address_line", { tier: "context" });
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        expect(primary.contextRows).toEqual(primary.contextFactRows);
        expect(primary.summaryRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).toContain("person.phone");
        expect(primary.contextRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).not.toContain("person.phone");
    });

    it("address in details is absent from summary and context", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.address_line", { tier: "expanded" });
        const record = {
            ...householdRecord(),
            "person.address_line1": "142 Oak Street",
            "opportunity.primary_person_id": "p-sarah",
        };
        const evidence = buildHouseholdCardEvidence(ctx(record), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        const other = card.sections.find((section) => section.key === "other_parent_guardian")?.items[0]!;
        const contextView = identityRowsForDisclosureDepth(primary, "context");
        const detailRefs = primary.detailRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        expect(contextView.visibleRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).not.toContain("person.address_line1");
        expect(detailRefs).toContain("person.address_line1");
        expect(detailRefs).not.toContain("person.address_line");
        expect(primary.canShowDetails).toBe(true);
        expect(primary.detailRows.flatMap((row) => row.cells).find((cell) => cell.fieldRef === "person.address_line1")?.value).toBe(
            "142 Oak Street",
        );
        expect(other?.detailRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).toContain("person.address_line1");
    });

    it("details depth shows context facts in visible rows plus detail-only fields", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.address_line", { tier: "expanded" });
        config = addFieldToNestedGroup(config, "contact_edit", "person.phone", { tier: "context_fact" });
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        const detailsView = identityRowsForDisclosureDepth(primary, "details");
        const visibleRefs = detailsView.visibleRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        const detailRefs = detailsView.detailRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        expect(visibleRefs).toContain("person.phone");
        expect(detailRefs).toContain("person.address_line1");
        expect(detailRefs).not.toContain("person.phone");
    });

    it("card source wires selection into IdentityDisclosureSurface", () => {
        const household = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
        expect(household).toContain('depth="summary"');
        expect(household).toContain('depth="context"');
        expect(household).toContain("selectIdentity(personId, sectionKey)");
        expect(household).toContain("IdentityDisclosureSurface");
        expect(household).toContain("enterEvidence");
    });
});

describe("children runtime disclosure", () => {
    const child = {
        id: "c1",
        name: "Emma Johnson",
        initial: "E",
        imageUrl: null,
        dobAge: "Age 4",
        program: "Preschool",
        room: "Room A",
        schedule: "Full time",
        teacher: "Ms. Lee",
        startDate: "2026-09-01",
        status: "Active",
        statusTone: "neutral" as const,
        needsAttention: false,
        detailLine: null,
        missingLine: null,
        flags: [],
    };

    it("summary renders configured name/DOB/schedule", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.display_name");
        config = addFieldToNestedGroup(config, "roster", "child.date_of_birth");
        config = addFieldToNestedGroup(config, "roster", "inquiry_child.schedule_type");
        const vm = buildChildIdentityRecordVM({ config, child, groupKey: "roster" });
        const refs = vm.summaryRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        expect(refs).toEqual(expect.arrayContaining(["child.display_name", "child.date_of_birth", "inquiry_child.schedule_type"]));
    });

    it("teacher/program/rate context facts appear in context only", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.display_name");
        config = addFieldToNestedGroup(config, "roster", "inquiry_child.program", { tier: "context" });
        const vm = buildChildIdentityRecordVM({ config, child, groupKey: "roster" });
        expect(vm.contextFactRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).toContain("inquiry_child.program");
        expect(vm.summaryRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).not.toContain("inquiry_child.program");
    });

    it("evidence collections derive from enabled archive sections", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setNestedGroupEnabled(config, "medical", true);
        config = setNestedGroupEnabled(config, "documents", true);
        const vm = buildChildIdentityRecordVM({ config, child, groupKey: "roster" });
        expect(vm.evidenceCollections?.map((collection) => collection.key)).toEqual(
            expect.arrayContaining(["medical", "documents"]),
        );
    });

    it("card source routes evidence depth through ChildExpandedEvidence", () => {
        const children = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(children).toContain('disclosure.depth === "evidence"');
        expect(children).toContain("ChildExpandedEvidence");
        expect(children).toContain('data-children-evidence-trigger');
        expect(children).toContain("enterEvidence");
    });
});
describe("identity inline edit wiring", () => {
    it("IdentityDisclosureSurface delegates details through summary depth with personId", () => {
        const surface = readSrc("components/admin/focusPanel/identity/IdentityDisclosureSurface.tsx");
        const summary = readSrc("components/admin/focusPanel/identity/IdentityRecordSummary.tsx");
        expect(surface).toContain("depth={depth}");
        expect(surface).not.toMatch(/<IdentityRecordDetails[^>]*onSaveField/);
        expect(summary).toContain("personId={record.id}");
    });

    it("collection summary has no Schedule → / Details → footer action", () => {
        const summary = readSrc("components/admin/focusPanel/identity/IdentityRecordSummary.tsx");
        expect(summary).not.toContain("Details →");
        expect(summary).not.toContain("Schedule →");
        expect(summary).not.toContain("resolveIdentityContextualActivateAction");
        expect(summary).not.toContain("identity-record-summary__open-details");
        expect(summary).not.toContain("data-identity-open-details");
    });

    it("ChildrenCard wires onSaveField when mutation is available", () => {
        const children = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(children).toContain("saveChildIdentityField");
        expect(children).toContain("onSaveField={saveChildIdentityField}");
        expect(children).toContain("saveInquiryChild");
    });
});

