/**
 * End-to-end identity save → truth refresh → VM recompose proofs (Phase 4 convergence).
 */
import { describe, expect, it } from "vitest";

import {
    buildChildIdentityRecordVM,
    buildHouseholdContactEditFieldRows,
    buildHouseholdIdentityCardVM,
} from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import {
    mergeInquiryChildIntoFocusPanelTruth,
    mergePersonContactIntoFocusPanelTruth,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import { mergeOpportunityDrawerDisplayRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import {
    isChildFocusFieldSaveSupported,
    type ChildFocusFieldKey,
} from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";
import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    setFieldVisibilityInNestedGroup,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

function childFieldSaveSupported(fieldRef: string): boolean {
    return isChildFocusFieldSaveSupported(fieldRef as ChildFocusFieldKey);
}

function householdCtx(truth: Record<string, unknown>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: String(truth.id ?? "opp-1"), label: "Household" },
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

const HOUSEHOLD_TRUTH = {
    id: "opp-1",
    "person.primary_contact_name": "Sarah Johnson",
    "person.primary_email": "sarah@example.com",
    "person.primary_phone": "555-123-4567",
    "opportunity.primary_person_id": "p-sarah",
    _opportunity_persons: [
        {
            person_id: "p-sarah",
            role_type: "primary_contact",
            name: "Sarah Johnson",
            phone: "555-123-4567",
            email: "sarah@example.com",
        },
    ],
};

const CHILD_TRUTH = {
    id: "opp-1",
    _inquiry_children: [
        {
            id: "child-1",
            person_id: "p-emma",
            customer_member_id: "cm-emma",
            display_name: "Emma Johnson",
            desired_program_label: "Preschool",
            program_room_cohort_label: "North Room",
            desired_schedule_label: "M–F",
            start_date: "2026-08-01",
            program_category_id: "prog-a",
            schedule_type: "full_time",
        },
    ],
};

describe("household contact save refresh", () => {
    it("rebuilt identity VM contains saved email after truth merge", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "contact.email", "editable");
        const ctx = householdCtx(HOUSEHOLD_TRUTH);
        const before = buildHouseholdIdentityCardVM({
            config,
            groups: buildHouseholdCardEvidence(ctx, { nestedConfig: config }).groups,
            canMutate: true,
        });
        const beforeEmail = before.sections
            .find((s) => s.key === "primary_contact")
            ?.items[0]
            ?.summaryRows.flatMap((r) => r.cells)
            .find((c) => c.fieldRef === "person.email")?.value;
        expect(beforeEmail).toBe("sarah@example.com");

        const merged = mergePersonContactIntoFocusPanelTruth(HOUSEHOLD_TRUTH, "p-sarah", {
            first_name: "Sarah",
            last_name: "Johnson",
            full_name: "Sarah Johnson",
            email: "sarah.updated@example.com",
            phone: "555-123-4567",
        });
        const afterCtx = householdCtx(merged);
        const after = buildHouseholdIdentityCardVM({
            config,
            groups: buildHouseholdCardEvidence(afterCtx, { nestedConfig: config }).groups,
            canMutate: true,
        });
        const afterEmail = after.sections
            .find((s) => s.key === "primary_contact")
            ?.items[0]
            ?.summaryRows.flatMap((r) => r.cells)
            .find((c) => c.fieldRef === "person.email")?.value;
        expect(afterEmail).toBe("sarah.updated@example.com");
        expect(HOUSEHOLD_TRUTH["person.primary_email"]).toBe("sarah@example.com");
    });

    it("contact edit rows honor configured order and editable policy", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "contact.phone");
        config = addFieldToNestedGroup(config, "contact_edit", "contact.email");
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "contact.phone", "read-only");
        const rows = buildHouseholdContactEditFieldRows({
            config,
            values: {
                first_name: "Sarah",
                last_name: "Johnson",
                email: "sarah@example.com",
                phone: "555-123-4567",
            },
            canMutate: true,
        });
        const cells = rows.flatMap((row) => row.cells);
        expect(cells.map((c) => c.fieldRef)).toEqual(
            expect.arrayContaining(["contact.phone", "contact.email"]),
        );
        const phone = cells.find((c) => c.fieldRef === "contact.phone")!;
        const email = cells.find((c) => c.fieldRef === "contact.email")!;
        expect(phone.editable).toBe(false);
        expect(email.editable).toBe(true);
    });
});

describe("child save refresh", () => {
    it("rebuilt child identity VM contains saved start date after truth merge", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "placement", "child.start_date");
        config = setFieldVisibilityInNestedGroup(config, "child_edit", "child.start_date", "editable");
        const ctx = householdCtx(CHILD_TRUTH);
        const child = buildChildrenCardEvidence(ctx).children[0]!;
        const before = buildChildIdentityRecordVM({
            config,
            child,
            groupKey: "placement",
            canMutate: true,
            isFieldSaveSupported: childFieldSaveSupported,
        });
        const beforeStart = before.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "child.start_date")?.value;
        expect(beforeStart).toContain("2026");

        const merged = mergeInquiryChildIntoFocusPanelTruth(CHILD_TRUTH, {
            childId: "child-1",
            row: { person_id: null },
            patch: {
                ocmPatch: { start_date: "2026-09-15" },
                identityPatch: {},
            },
            savedPerson: null,
        });
        const afterChild = buildChildrenCardEvidence(householdCtx(merged)).children[0]!;
        const after = buildChildIdentityRecordVM({
            config,
            child: afterChild,
            groupKey: "placement",
            canMutate: true,
            isFieldSaveSupported: childFieldSaveSupported,
        });
        const afterStart = after.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "child.start_date")?.value;
        expect(afterStart).toContain("Sep");
        expect(afterStart).toContain("2026");
    });

    it("rebuilt children evidence shows Male after gender profilePatch merge", () => {
        const merged = mergeInquiryChildIntoFocusPanelTruth(CHILD_TRUTH, {
            childId: "child-1",
            row: { person_id: null },
            patch: {
                identityPatch: {},
                ocmPatch: {},
                profilePatch: { gender: "male" },
            },
            savedPerson: null,
        });
        const afterChild = buildChildrenCardEvidence(householdCtx(merged)).children[0]!;
        expect(afterChild.gender).toBe("Male");
    });

    it("rebuilt children evidence keeps Program label after program_category_id save", () => {
        const merged = mergeInquiryChildIntoFocusPanelTruth(CHILD_TRUTH, {
            childId: "child-1",
            row: { person_id: null },
            patch: {
                identityPatch: {},
                ocmPatch: { program_category_id: "cat-toddler" },
                displayPatch: { desired_program_label: "Toddler" },
            },
            savedPerson: null,
        });
        const afterChild = buildChildrenCardEvidence(householdCtx(merged)).children[0]!;
        expect(afterChild.programCategoryId).toBe("cat-toddler");
        expect(afterChild.program).toBe("Toddler");
    });

    it("rebuilt children evidence shows photo after resolved_photo_url merge", () => {
        const merged = mergeInquiryChildIntoFocusPanelTruth(CHILD_TRUTH, {
            childId: "child-1",
            row: { person_id: "p-emma" },
            patch: {
                identityPatch: {},
                ocmPatch: {},
                // Session merge writes resolved_photo_url (signed photo_url alone is dropped).
                profilePatch: { resolved_photo_url: "https://cdn.example/emma.jpg" },
            },
            savedPerson: null,
        });
        const afterChild = buildChildrenCardEvidence(householdCtx(merged)).children[0]!;
        expect(afterChild.imageUrl).toBe("https://cdn.example/emma.jpg");
        expect(afterChild.personId).toBe("p-emma");
    });

    it("photo merge falls back to unique person_id when childId is synthetic", () => {
        const merged = mergeInquiryChildIntoFocusPanelTruth(CHILD_TRUTH, {
            childId: "child-0",
            row: { person_id: "p-emma" },
            patch: {
                identityPatch: {},
                ocmPatch: {},
                profilePatch: { resolved_photo_url: "https://cdn.example/fallback.jpg" },
            },
            savedPerson: null,
        });
        const afterChild = buildChildrenCardEvidence(householdCtx(merged)).children[0]!;
        expect(afterChild.imageUrl).toBe("https://cdn.example/fallback.jpg");
    });

    it("unsupported expanded field does not expose edit affordance", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "readiness", "child.readiness_summary");
        const child = buildChildrenCardEvidence(householdCtx(CHILD_TRUTH)).children[0]!;
        const record = buildChildIdentityRecordVM({
            config,
            child,
            groupKey: "readiness",
            canMutate: true,
            isFieldSaveSupported: childFieldSaveSupported,
        });
        const readiness = record.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "child.readiness_summary");
        expect(readiness?.editable).toBe(false);
    });
});

describe("address save refresh", () => {
    it("address_line1 and city/state/postal survive save refresh when _person_address_by_id is present", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.address_line1", { tier: "expanded" });
        config = addFieldToNestedGroup(config, "contact_edit", "person.city", { tier: "expanded" });
        config = addFieldToNestedGroup(config, "contact_edit", "person.state", { tier: "expanded" });
        config = addFieldToNestedGroup(config, "contact_edit", "person.postal_code", { tier: "expanded" });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.address_line1", "editable", {
            tier: "expanded",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.city", "editable", {
            tier: "expanded",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.state", "editable", {
            tier: "expanded",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.postal_code", "editable", {
            tier: "expanded",
        });

        const truth = {
            ...HOUSEHOLD_TRUTH,
            _person_address_by_id: {
                "p-sarah": {
                    address_line1: "Old Street",
                    city: "Old City",
                },
            },
            "person.primary_address_line1": "Old Street",
            "person.primary_address_city": "Old City",
        };
        const ctx = householdCtx(truth);
        const before = buildHouseholdIdentityCardVM({
            config,
            groups: buildHouseholdCardEvidence(ctx, { nestedConfig: config }).groups,
            canMutate: true,
        });
        const beforeCells = before.sections.find((s) => s.key === "primary_contact")?.items[0]?.detailRows.flatMap((r) => r.cells) ?? [];
        expect(beforeCells.find((c) => c.fieldRef === "person.address_line1")?.value).toBe("Old Street");

        const merged = mergePersonContactIntoFocusPanelTruth(truth, "p-sarah", {
            address_line1: "742 Evergreen Terrace",
            city: "Springfield",
            state: "OR",
            postal_code: "97403",
        });
        const after = buildHouseholdIdentityCardVM({
            config,
            groups: buildHouseholdCardEvidence(householdCtx(merged), { nestedConfig: config }).groups,
            canMutate: true,
        });
        const afterCells = after.sections.find((s) => s.key === "primary_contact")?.items[0]?.detailRows.flatMap((r) => r.cells) ?? [];
        expect(afterCells.find((c) => c.fieldRef === "person.address_line1")?.value).toBe("742 Evergreen Terrace");
        expect(afterCells.find((c) => c.fieldRef === "person.city")?.value).toBe("Springfield");
        expect(afterCells.find((c) => c.fieldRef === "person.state")?.value).toBe("OR");
        expect(afterCells.find((c) => c.fieldRef === "person.postal_code")?.value).toBe("97403");
        const snapshot = (merged._person_address_by_id as Record<string, Record<string, unknown>>)["p-sarah"];
        expect(snapshot?.address_line1).toBe("742 Evergreen Terrace");
        expect(snapshot?.city).toBe("Springfield");
    });
});

describe("expanded field save refresh", () => {
    it("expanded tier VM reflects saved contact value after merge", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.email", { tier: "expanded" });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "contact.email", "editable");
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.email", "editable");
        const merged = mergePersonContactIntoFocusPanelTruth(HOUSEHOLD_TRUTH, "p-sarah", {
            first_name: "Sarah",
            last_name: "Johnson",
            full_name: "Sarah Johnson",
            email: "expanded.saved@example.com",
            phone: "555-123-4567",
        });
        const vm = buildHouseholdIdentityCardVM({
            config,
            groups: buildHouseholdCardEvidence(householdCtx(merged), { nestedConfig: config }).groups,
            canMutate: true,
        });
        const expandedEmail = vm.sections
            .find((s) => s.key === "primary_contact")
            ?.items[0]
            ?.expandedRows.flatMap((r) => r.cells)
            .find((c) => c.fieldRef === "person.email");
        expect(expandedEmail?.value).toBe("expanded.saved@example.com");
        expect(expandedEmail?.editable).toBe(true);
    });
});

describe("drawer record patch photo preservation", () => {
    it("post-save detail cells keep address when merge uses stale truth but patch overlay has values", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.address_line1", { tier: "expanded" });
        config = addFieldToNestedGroup(config, "contact_edit", "person.city", { tier: "expanded" });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.address_line1", "editable", {
            tier: "expanded",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.city", "editable", {
            tier: "expanded",
        });

        const staleTruth = {
            ...HOUSEHOLD_TRUTH,
            "person.primary_address_line1": "742 Evergreen Terrace",
            "person.primary_address_city": "Springfield",
        };
        const currentTruth = {
            ...staleTruth,
            _person_address_by_id: {
                "p-sarah": {
                    address_line1: "742 Evergreen Terrace",
                    city: "Springfield",
                },
            },
            extra_runtime_field: "must-survive-patch",
        };

        const mergedFromStale = mergePersonContactIntoFocusPanelTruth(staleTruth, "p-sarah", {
            address_line1: "742 Evergreen Terrace",
            city: "Portland",
            state: "OR",
            postal_code: "97201",
        });

        const authoritative = mergeOpportunityDrawerDisplayRecordPatch(currentTruth, mergedFromStale);
        expect(authoritative.extra_runtime_field).toBe("must-survive-patch");

        const vm = buildHouseholdIdentityCardVM({
            config,
            groups: buildHouseholdCardEvidence(householdCtx(authoritative), { nestedConfig: config }).groups,
            canMutate: true,
        });
        const cells =
            vm.sections.find((s) => s.key === "primary_contact")?.items[0]?.detailRows.flatMap((r) => r.cells) ?? [];
        expect(cells.find((c) => c.fieldRef === "person.address_line1")?.value).toBe("742 Evergreen Terrace");
        expect(cells.find((c) => c.fieldRef === "person.city")?.value).toBe("Portland");
    });

    it("preserves child photo_url when a later inquiry_children patch omits photos", () => {
        const withPhoto = mergeInquiryChildIntoFocusPanelTruth(CHILD_TRUTH, {
            childId: "child-1",
            row: { person_id: "p-emma" },
            patch: {
                identityPatch: {},
                ocmPatch: {},
                profilePatch: { photo_url: "https://cdn.example/emma.jpg" },
            },
            savedPerson: null,
        });
        const strippedReload = {
            ...withPhoto,
            _inquiry_children: [
                {
                    id: "child-1",
                    person_id: "p-emma",
                    customer_member_id: "cm-emma",
                    display_name: "Emma Johnson",
                },
            ],
        };
        const merged = mergeOpportunityDrawerDisplayRecordPatch(withPhoto, strippedReload);
        const child = (merged._inquiry_children as Record<string, unknown>[])[0]!;
        expect(child.photo_url).toBe("https://cdn.example/emma.jpg");
        expect(buildChildrenCardEvidence(householdCtx(merged)).children[0]!.imageUrl).toBe(
            "https://cdn.example/emma.jpg",
        );
    });
});

describe("save failure semantics", () => {
    it("failed save does not mutate authoritative truth used for VM recompose", () => {
        const baseline = { ...HOUSEHOLD_TRUTH };
        const optimisticDraft = mergePersonContactIntoFocusPanelTruth(baseline, "p-sarah", {
            first_name: "Sarah",
            last_name: "Johnson",
            full_name: "Sarah Johnson",
            email: "should-not-persist@example.com",
            phone: "555-123-4567",
        });
        // Simulate failed save: authoritative truth unchanged; draft is not applied.
        const authoritative = baseline;
        expect(authoritative["person.primary_email"]).toBe("sarah@example.com");
        expect(optimisticDraft["person.primary_email"]).toBe("should-not-persist@example.com");
        const vm = buildHouseholdIdentityCardVM({
            config: defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID),
            groups: buildHouseholdCardEvidence(householdCtx(authoritative)).groups,
        });
        const email = vm.sections
            .find((s) => s.key === "primary_contact")
            ?.items[0]
            ?.summaryRows.flatMap((r) => r.cells)
            .find((c) => c.fieldRef === "person.email")?.value;
        expect(email).toBe("sarah@example.com");
    });
});
