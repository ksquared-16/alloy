/**
 * Context projection + configuration compatibility tests.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
    composeSummaryAndContextFacts,
    sanitizeContextFactKeys,
} from "@/lib/adminV2/runtime/focusPanel/identity/composeIdentityContextRows";
import {
    buildChildIdentityRecordVM,
    buildEmployeeIdentityRecordVM,
    buildHouseholdIdentityCardVM,
} from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { identityRowsForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityDisclosureVM";
import {
    migrateIdentityDisclosureGroup,
    identitySectionFromNestedGroup,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import type { IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import {
    addFieldToNestedGroup,
    removeFieldFromNestedGroup,
    moveFieldToIdentityTierInNestedGroup,
    identityTierContainingField,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    identityConfigurationFieldKeys,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    fieldKeysForConfigurationPurpose,
    identityLayerFieldKeysFromGroup,
    normalizeIdentityStorageTier,
    storageTierMatchesPurpose,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

function row(fieldRef: string, label: string, row = 1): IdentityFieldRowVM {
    return {
        row,
        cells: [{
            fieldRef,
            label,
            value: label,
            labelMode: "visible",
            policy: "read-only",
            editable: false,
            hideWhenEmpty: false,
            width: "full",
        }],
    };
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
            tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
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

describe("configuration / compatibility", () => {
    it("selectedFieldKeys map to Summary", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const keys = identityConfigurationFieldKeys(config, "primary_contact", "summary");
        expect(keys).toContain("person.phone");
    });

    it("existing contextFieldKeys map to Context Facts", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "inquiry_child.program", { tier: "context" });
        expect(identityConfigurationFieldKeys(config, "roster", "context_facts")).toContain("inquiry_child.program");
    });

    it("expanded fields map to Details", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.address_line", { tier: "expanded" });
        expect(identityConfigurationFieldKeys(config, "primary_contact", "details")).toContain("person.address_line");
    });

    it("legacy placement tier context adapts to context_fact", () => {
        expect(normalizeIdentityStorageTier("context")).toBe("context_fact");
        expect(storageTierMatchesPurpose("context", "context_facts")).toBe(true);
    });

    it("explicit empty Context Facts persist", () => {
        const group = migrateIdentityDisclosureGroup({
            key: "primary_contact",
            selectedFieldKeys: ["person.phone"],
            contextFieldKeys: [],
        });
        expect(group.contextFieldKeys).toEqual([]);
    });

    it("strips summary duplicates from legacy contextFieldKeys on migrate", () => {
        const group = migrateIdentityDisclosureGroup({
            key: "primary_contact",
            selectedFieldKeys: ["person.phone", "person.email"],
            contextFieldKeys: ["person.phone", "person.address_line"],
        });
        expect(group.contextFieldKeys).toEqual(["person.address_line"]);
    });
});

describe("context projection", () => {
    it("context contains all summary rows", () => {
        const merged = composeSummaryAndContextFacts(
            [row("person.phone", "Phone"), row("person.email", "Email", 2)],
            [],
        );
        expect(merged.flatMap((r) => r.cells).map((c) => c.fieldRef)).toEqual(["person.phone", "person.email"]);
    });

    it("context appends context facts", () => {
        const merged = composeSummaryAndContextFacts(
            [row("child.display_name", "Name")],
            [row("inquiry_child.program", "Program", 2)],
        );
        expect(merged.flatMap((r) => r.cells).map((c) => c.fieldRef)).toEqual([
            "child.display_name",
            "inquiry_child.program",
        ]);
    });

    it("duplicate field refs render once with context facts winning", () => {
        const summaryRow: IdentityFieldRowVM = {
            row: 1,
            cells: [{
                fieldRef: "person.phone",
                label: "Summary Phone",
                value: "111",
                labelMode: "visible",
                policy: "read-only",
                editable: false,
                hideWhenEmpty: false,
                width: "full",
            }],
        };
        const factRow: IdentityFieldRowVM = {
            row: 1,
            cells: [{
                fieldRef: "person.phone",
                label: "Fact Phone",
                value: "222",
                labelMode: "visible",
                policy: "editable",
                editable: true,
                hideWhenEmpty: false,
                width: "full",
            }],
        };
        const merged = composeSummaryAndContextFacts([summaryRow], [factRow]);
        expect(merged).toHaveLength(1);
        expect(merged[0]!.cells[0]!.label).toBe("Fact Phone");
        expect(merged[0]!.cells[0]!.editable).toBe(true);
    });

    it("empty context facts result in context equal to summary", () => {
        const summary = [row("person.phone", "Phone")];
        expect(composeSummaryAndContextFacts(summary, [])).toEqual(summary);
    });

    it("sanitizeContextFactKeys removes summary overlap", () => {
        expect(sanitizeContextFactKeys(["a", "b"], ["a", "c"])).toEqual(["c"]);
    });
});

describe("household", () => {
    it("parent summaries appear and context reuses them with incremental facts", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.address_line", { tier: "expanded" });
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((s) => s.key === "primary_contact")?.items[0]!;
        const summaryRefs = primary.summaryRows.flatMap((r) => r.cells).map((c) => c.fieldRef);
        const contextRefs = primary.contextRows.flatMap((r) => r.cells).map((c) => c.fieldRef);
        expect(summaryRefs).toContain("person.phone");
        expect(contextRefs).toContain("person.phone");
        expect(contextRefs.filter((r) => r === "person.phone")).toHaveLength(1);
        expect(contextRefs).not.toContain("person.address_line");
    });

    it("detail fields hidden until details depth", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.address_line", { tier: "expanded" });
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((s) => s.key === "primary_contact")?.items[0]!;
        const contextView = identityRowsForDisclosureDepth(primary, "context");
        expect(contextView.detailRows).toEqual([]);
        expect(contextView.visibleRows.flatMap((r) => r.cells).map((c) => c.fieldRef)).not.toContain("person.address_line");
    });
});

describe("children", () => {
    it("summary appears in context automatically; facts only in contextFactRows", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.display_name", { tier: "summary" });
        config = addFieldToNestedGroup(config, "roster", "inquiry_child.program", { tier: "context" });
        const vm = buildChildIdentityRecordVM({
            config,
            child: {
                id: "c1",
                name: "Lennon",
                initial: "L",
                imageUrl: null,
                dobAge: "Age 4",
                program: "Preschool",
                room: null,
                schedule: "Full time",
                teacher: null,
                startDate: null,
                status: null,
                statusTone: "neutral",
                needsAttention: false,
                detailLine: null,
                missingLine: null,
                flags: [],
            },
            groupKey: "roster",
        });
        expect(vm.summaryRows.flatMap((r) => r.cells).map((c) => c.fieldRef)).toContain("child.display_name");
        expect(vm.contextFactRows.flatMap((r) => r.cells).map((c) => c.fieldRef)).toContain("inquiry_child.program");
        expect(vm.contextFactRows.flatMap((r) => r.cells).map((c) => c.fieldRef)).not.toContain("child.display_name");
        expect(vm.contextRows.flatMap((r) => r.cells).map((c) => c.fieldRef)).toEqual([
            "child.display_name",
            "inquiry_child.program",
        ]);
    });

    it("detail fields do not appear in context", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.notes_summary", { tier: "expanded" });
        const vm = buildChildIdentityRecordVM({
            config,
            child: {
                id: "c1",
                name: "Lennon",
                initial: "L",
                imageUrl: null,
                dobAge: "Age 4",
                program: null,
                room: null,
                schedule: null,
                teacher: null,
                startDate: null,
                status: null,
                statusTone: "neutral",
                needsAttention: false,
                detailLine: null,
                missingLine: null,
                flags: [],
            },
            groupKey: "roster",
        });
        expect(vm.contextRows.flatMap((r) => r.cells).map((c) => c.fieldRef)).not.toContain("child.notes_summary");
    });
});

describe("employee / person proof", () => {
    it("uses shared summary + context facts composition", () => {
        let config = defaultNestedSurfaceConfig("employee_surface");
        config = addFieldToNestedGroup(config, "identity", "person.phone", { tier: "summary" });
        config = addFieldToNestedGroup(config, "identity", "person.role_label", { tier: "context" });
        const vm = buildEmployeeIdentityRecordVM({
            config,
            employee: {
                id: "e1",
                name: "Alex Rivera",
                title: "Teacher",
                phone: "555-0000",
            },
        });
        expect(vm.contextRows.flatMap((r) => r.cells).map((c) => c.fieldRef)).toContain("person.phone");
        expect(vm.contextFactRows.flatMap((r) => r.cells).map((c) => c.fieldRef)).not.toContain("person.phone");
    });
});

describe("section config shape", () => {
    it("projects context.facts separately from summary.fields", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "inquiry_child.program", { tier: "context" });
        const group = config.groups.find((g) => g.key === "roster")!;
        const section = identitySectionFromNestedGroup(CHILDREN_SURFACE_ID, group, "Roster");
        expect(section.summary.fields.length + section.context.facts.length).toBeGreaterThan(0);
        expect(section.context.facts.some((f) => f.fieldRef === "inquiry_child.program")).toBe(true);
        expect(section.context.facts.some((f) => f.tier === "context_fact" || normalizeIdentityStorageTier(f.tier) === "context_fact")).toBe(true);
    });
});

describe("identityLayerFieldKeysFromGroup", () => {
    it("maps persisted keys into summary, contextFacts, details buckets", () => {
        const layers = identityLayerFieldKeysFromGroup({
            selectedFieldKeys: ["a"],
            contextFieldKeys: ["b"],
            expandedFieldKeys: ["c"],
        });
        expect(layers.summary).toEqual(["a"]);
        expect(layers.contextFacts).toEqual(["b"]);
        expect(layers.details).toEqual(["c"]);
    });

    it("fieldKeysForConfigurationPurpose returns explicit contextFieldKeys (no Summary strip)", () => {
        // Builder Context purpose is a complete authored list — not Summary inheritance minus overlap.
        expect(
            fieldKeysForConfigurationPurpose(
                { selectedFieldKeys: ["a"], contextFieldKeys: ["a", "b"] },
                "context_facts",
            ),
        ).toEqual(["a", "b"]);
    });

    it("removeFieldFromNestedGroup removes from the active configuration tier only", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.secondary_phone", { tier: "summary" });
        config = addFieldToNestedGroup(config, "primary_contact", "person.employer", { tier: "context_fact" });
        config = addFieldToNestedGroup(config, "primary_contact", "person.notes", { tier: "details" });

        const afterSummary = removeFieldFromNestedGroup(config, "primary_contact", "person.secondary_phone", { tier: "summary" });
        expect(identityConfigurationFieldKeys(afterSummary, "primary_contact", "summary")).not.toContain("person.secondary_phone");
        expect(identityConfigurationFieldKeys(afterSummary, "primary_contact", "context_facts")).toContain("person.employer");
        expect(identityConfigurationFieldKeys(afterSummary, "primary_contact", "details")).toContain("person.notes");

        const afterContext = removeFieldFromNestedGroup(afterSummary, "primary_contact", "person.employer", { tier: "context_fact" });
        expect(identityConfigurationFieldKeys(afterContext, "primary_contact", "context_facts")).not.toContain("person.employer");
        expect(identityConfigurationFieldKeys(afterContext, "primary_contact", "summary")).not.toContain("person.secondary_phone");
    });

    it("moveFieldToIdentityTierInNestedGroup moves fields between disclosure tiers", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = moveFieldToIdentityTierInNestedGroup(config, "primary_contact", "person.phone", "details");
        expect(identityTierContainingField(config, "primary_contact", "person.phone")).toBe("details");
        expect(identityConfigurationFieldKeys(config, "primary_contact", "summary")).not.toContain("person.phone");
        expect(identityConfigurationFieldKeys(config, "primary_contact", "details")).toContain("person.phone");
    });
});
