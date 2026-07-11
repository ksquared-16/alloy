/**
 * Shared identity surface composition — Phase 4 tests.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    reconcileNestedSurfaceConfig,
    setFieldLayoutWidthInNestedGroup,
    setFieldPresentationLabel,
    setFieldVisibilityInNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    adaptChildSurfaceToChildrenSurface,
    adaptHouseholdContactSurfaceToHouseholdSurface,
    generateDefaultPlacementsForGroup,
    reconcileFieldModesToPolicies,
    reconcileIdentityNestedConfig,
    resolveIdentityFieldPolicy,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { resolveIdentityFieldRows } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows";
import { resolveIdentityFieldIcon } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldIcon";
import {
    buildChildIdentityRecordVM,
    buildEmployeeIdentityRecordVM,
    buildHouseholdIdentityCardVM,
} from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import { isChildFocusFieldSaveSupported } from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { getSurface } from "@/lib/platform/surfaceComposition/surfaceRegistry";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

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
            { person_id: "p-gran", role_type: "emergency_contact", name: "Grandma Mary", phone: "555-333-4444" },
        ],
        _inquiry_children: [{ id: "c1", display_name: "Emma Johnson", age: "6" }],
    };
}

beforeEach(() => {
    ensureRuntimeSurfacesRegistered();
});

describe("identity config persistence", () => {
    const householdGroups = [
        "primary_contact",
        "other_parent_guardian",
        "household_members",
        "children",
    ] as const;

    for (const groupKey of householdGroups) {
        it(`Add Field persists in ${groupKey}`, () => {
            let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
            config = addFieldToNestedGroup(config, groupKey, "person.email");
            const group = config.groups.find((g) => g.key === groupKey)!;
            expect(group.selectedFieldKeys).toContain("person.email");
            expect(group.fieldPlacements?.some((p) => p.fieldRef === "person.email" && p.tier === "summary")).toBe(true);
            expect(group.fieldPolicies?.["person.email"]).toBeDefined();
            expect(group.fieldLayoutWidths?.["person.email"]).toBe("full");
        });
    }

    it("summary and expanded placements persist through reconcile", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.address_line", { tier: "expanded" });
        const reloaded = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, config);
        const group = reloaded.groups.find((g) => g.key === "primary_contact")!;
        expect(group.expandedFieldKeys).toContain("person.address_line");
        expect(group.fieldPlacements?.some((p) => p.fieldRef === "person.address_line" && p.tier === "expanded")).toBe(true);
    });

    it("width row/column and icon persist", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.phone");
        config = addFieldToNestedGroup(config, "primary_contact", "person.email");
        config = setFieldLayoutWidthInNestedGroup(config, "primary_contact", "person.phone", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "primary_contact", "person.email", "half");
        const group = config.groups.find((g) => g.key === "primary_contact")!;
        const withIcon = {
            ...group,
            fieldIcons: { ...(group.fieldIcons ?? {}), "person.phone": "phone-custom" },
        };
        const placements = generateDefaultPlacementsForGroup(withIcon);
        expect(placements.find((p) => p.fieldRef === "person.phone")?.width).toBe("half");
        expect(withIcon.fieldIcons?.["person.phone"]).toBe("phone-custom");
    });

    it("editable policy persists", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "child_edit", "inquiry_child.program", "editable");
        expect(resolveIdentityFieldPolicy({
            config,
            groupKey: "placement",
            fieldRef: "inquiry_child.program",
            editGroupKey: "child_edit",
        })).toBe("editable");
    });

    it("explicit empty field list remains empty", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const group = config.groups.find((g) => g.key === "other_parent_guardian")!;
        const empty = { ...group, selectedFieldKeys: [], fieldPlacements: [] };
        config = {
            ...config,
            groups: config.groups.map((g) => (g.key === "other_parent_guardian" ? empty : g)),
        };
        const reloaded = reconcileIdentityNestedConfig(HOUSEHOLD_SURFACE_ID, config);
        expect(reloaded.groups.find((g) => g.key === "other_parent_guardian")?.selectedFieldKeys).toEqual([]);
    });
});

describe("identity layout + icons", () => {
    it("two fields on one row render as two columns", () => {
        const rows = resolveIdentityFieldRows([
            {
                placement: { fieldRef: "person.phone", tier: "summary", row: 1, column: 1, width: "half" },
                label: "Phone",
                value: "(555) 555-1212",
                policy: "read-only",
                editable: false,
            },
            {
                placement: { fieldRef: "person.email", tier: "summary", row: 1, column: 2, width: "half" },
                label: "Email",
                value: "jordan@example.com",
                policy: "read-only",
                editable: false,
            },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.cells).toHaveLength(2);
    });

    it("full-width field spans the row", () => {
        const rows = resolveIdentityFieldRows([
            {
                placement: { fieldRef: "person.address_line", tier: "expanded", row: 1, column: 1, width: "full" },
                label: "Address",
                value: "123 Main Street",
                policy: "read-only",
                editable: false,
            },
        ]);
        expect(rows[0]!.cells[0]!.width).toBe("full");
    });

    it("explicit icon wins over catalog icon", () => {
        const group = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID).groups.find((g) => g.key === "primary_contact")!;
        const withOverride = { ...group, fieldIcons: { "person.phone": "custom-phone" } };
        expect(resolveIdentityFieldIcon({ group: withOverride, fieldRef: "person.phone" })).toBe("custom-phone");
    });

    it("catalog icon applies when no override exists", () => {
        const group = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID).groups.find((g) => g.key === "primary_contact")!;
        expect(resolveIdentityFieldIcon({ group, fieldRef: "person.phone" })).toBe("phone");
    });
});

describe("household identity VM", () => {
    it("builder and runtime produce same item counts for production-shaped fixture", () => {
        const config = reconcileIdentityNestedConfig(HOUSEHOLD_SURFACE_ID, defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID));
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const vm = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: true });
        const primary = vm.sections.find((s) => s.key === "primary_contact");
        const secondary = vm.sections.find((s) => s.key === "other_parent_guardian");
        expect(primary?.items).toHaveLength(1);
        expect(secondary?.items).toHaveLength(1);
        expect(secondary?.items[0]?.title).toBe("Michael Johnson");
    });

    it("secondary parent/guardian renders and distinct adults are not deduplicated", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const vm = buildHouseholdIdentityCardVM({ config, groups: evidence.groups });
        const secondary = vm.sections.find((s) => s.key === "other_parent_guardian");
        expect(secondary?.items.map((item) => item.title)).toEqual(["Michael Johnson"]);
        const members = vm.sections.find((s) => s.key === "household_members");
        expect(members?.items.some((item) => item.title === "Sarah Johnson")).toBe(false);
    });

    it("children section renders configured child rows", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const vm = buildHouseholdIdentityCardVM({ config, groups: evidence.groups });
        const children = vm.sections.find((s) => s.key === "children");
        expect(children?.items[0]?.title).toBe("Emma Johnson");
    });
});

describe("children identity VM", () => {
    it("children_surface policies drive runtime editability through child_edit inheritance", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "child_edit", "inquiry_child.program", "editable");
        const vm = buildChildIdentityRecordVM({
            config,
            child: {
                id: "c1",
                name: "Emma",
                program: "Preschool",
                room: null,
                schedule: null,
                startDate: null,
                dobAge: "Age 4",
                needsAttention: false,
                missingLine: null,
            },
            groupKey: "placement",
            canMutate: true,
            isFieldSaveSupported: isChildFocusFieldSaveSupported,
        });
        const editable = vm.summaryRows.flatMap((row) => row.cells).some((cell) => cell.fieldRef === "inquiry_child.program" && cell.editable);
        expect(editable).toBe(true);
    });

    it("legacy child_surface adapts onto children_surface", () => {
        const childSurface: NestedSurfaceConfig = {
            surfaceId: "child_surface",
            groups: [
                {
                    key: "placement",
                    selectedFieldKeys: ["inquiry_child.program", "child.start_date"],
                    fieldModes: { "child.start_date": { displayed: true, editable: true } },
                },
            ],
        };
        const adapted = adaptChildSurfaceToChildrenSurface(childSurface, defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID));
        const placement = adapted.groups.find((g) => g.key === "placement")!;
        expect(placement.selectedFieldKeys).toContain("child.start_date");
        expect(placement.fieldPolicies?.["child.start_date"]).toBe("editable");
    });
});

describe("shared model proof", () => {
    it("employee fixture uses shared renderer VM without enrollment field keys", () => {
        const config = defaultNestedSurfaceConfig("employee_surface");
        const vm = buildEmployeeIdentityRecordVM({
            employee: {
                id: "e1",
                name: "Alex Rivera",
                title: "Director",
                department: "Operations",
                email: "alex@example.com",
                phone: "555-000-1111",
                badge: "Employee",
            },
            config,
            canMutate: true,
        });
        expect(vm.title).toBe("Alex Rivera");
        expect(vm.badge).toBe("Employee");
        expect(vm.summaryRows.length).toBeGreaterThan(0);
        expect(JSON.stringify(vm)).not.toContain("inquiry_child");
        expect(JSON.stringify(vm)).not.toContain("enrollment");
    });

    it("registers child_surface for compatibility", () => {
        expect(getSurface("child_surface")?.label).toBe("Child Drill-in");
    });

    it("fieldModes reconcile to fieldPolicies", () => {
        const group = {
            key: "contact_fields",
            selectedFieldKeys: ["person.email"],
            fieldModes: { "person.email": { displayed: true, editable: true } },
        };
        const reconciled = reconcileFieldModesToPolicies(group);
        expect(reconciled.fieldPolicies?.["person.email"]).toBe("editable");
    });

    it("legacy household_contact_surface adapts to household_surface.contact_edit", () => {
        const legacy = {
            surfaceId: "household_contact_surface",
            groups: [{
                key: "contact_fields",
                selectedFieldKeys: ["person.email", "person.phone"],
                fieldModes: {
                    "person.email": { displayed: false, editable: true },
                    "person.phone": { displayed: true, editable: false },
                },
            }],
        } satisfies NestedSurfaceConfig;
        const adapted = adaptHouseholdContactSurfaceToHouseholdSurface(legacy, null);
        const contactEdit = adapted.groups.find((g) => g.key === "contact_edit")!;
        expect(contactEdit.selectedFieldKeys).toEqual(["contact.email", "contact.phone"]);
        expect(contactEdit.fieldPolicies?.["contact.email"]).toBe("hidden");
        expect(contactEdit.fieldPolicies?.["contact.phone"]).toBe("read-only");
    });
});

describe("identity editability matrix", () => {
    it("editable + permitted → editable in VM", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "primary_contact", "person.email", "editable");
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "contact.email", "editable");
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const vm = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: true });
        const primary = vm.sections.find((s) => s.key === "primary_contact")?.items[0];
        const email = primary?.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.email");
        expect(email?.editable).toBe(true);
    });

    it("editable + not permitted → read-only in VM", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "contact.email", "editable");
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const vm = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = vm.sections.find((s) => s.key === "primary_contact")?.items[0];
        const email = primary?.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.email");
        expect(email?.editable).toBe(false);
    });

    it("read-only policy stays read-only", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "primary_contact", "person.phone", "read-only");
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const vm = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: true });
        const primary = vm.sections.find((s) => s.key === "primary_contact")?.items[0];
        const phone = primary?.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.phone");
        expect(phone?.editable).toBe(false);
    });

    it("hidden policy is not rendered", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "primary_contact", "person.email", "hidden");
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const vm = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: true });
        const primary = vm.sections.find((s) => s.key === "primary_contact")?.items[0];
        const email = primary?.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.email");
        expect(email).toBeUndefined();
    });

    it("unsupported child save target stays non-editable", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "readiness", "child.readiness_summary");
        config = setFieldVisibilityInNestedGroup(config, "child_edit", "child.readiness_summary", "editable");
        const vm = buildChildIdentityRecordVM({
            config,
            child: {
                id: "c1",
                name: "Emma",
                program: null,
                room: null,
                schedule: null,
                startDate: null,
                dobAge: null,
                needsAttention: true,
                missingLine: "Needs program",
            },
            groupKey: "readiness",
            canMutate: true,
            isFieldSaveSupported: isChildFocusFieldSaveSupported,
        });
        const readiness = vm.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "child.readiness_summary");
        expect(readiness?.editable).toBe(false);
    });

    it("expanded tier honors the same policy as summary", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.address_line", { tier: "expanded" });
        config = setFieldVisibilityInNestedGroup(config, "primary_contact", "person.address_line", "editable");
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const vm = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: true });
        const primary = vm.sections.find((s) => s.key === "primary_contact")?.items[0];
        const address = primary?.expandedRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.address_line");
        expect(address?.editable).toBe(true);
        expect(primary?.canExpand).toBe(true);
    });
});
