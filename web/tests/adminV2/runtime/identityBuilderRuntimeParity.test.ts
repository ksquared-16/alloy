/**
 * Builder/runtime parity — configuration purposes map to disclosure depths.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
    addFieldToNestedGroup,
    addEvidenceCollectionToGroup,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    identityConfigurationFieldKeys,
    setNestedGroupEnabled,
    applyNestedSurfaceFieldDrop,
    fieldLayoutWidthForNestedGroup,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { serializeIdentityNestedSurfacesForPublish } from "@/lib/adminV2/runtime/focusPanel/identity/resolvePublishedIdentitySurfaceConfig";
import { readHouseholdNestedConfigFromDoc } from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";
import { withHouseholdRoleMergedGroups } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import {
    buildChildIdentityRecordVM,
    buildHouseholdIdentityCardVM,
} from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { identityRowsForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityDisclosureVM";
import { composeContextCollectionRows } from "@/lib/adminV2/runtime/focusPanel/identity/composeIdentityContextRows";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
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
        "opportunity.primary_person_id": "p-sarah",
        _opportunity_persons: [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson", phone: "555-123-4567", email: "sarah@example.com" },
        ],
        _inquiry_children: [],
    };
}

function builderContextPreviewRows(
    config: ReturnType<typeof defaultNestedSurfaceConfig>,
    groupKey: string,
) {
    const summaryKeys = identityConfigurationFieldKeys(config, groupKey, "summary");
    const factKeys = identityConfigurationFieldKeys(config, groupKey, "context_facts");
    const summaryRows = summaryKeys.map((fieldRef, index) => ({
        row: index + 1,
        cells: [{
            fieldRef,
            label: fieldRef,
            value: fieldRef,
            labelMode: "visible" as const,
            policy: "read-only" as const,
            editable: false,
            hideWhenEmpty: false,
            width: "full" as const,
        }],
    }));
    const factRows = factKeys.map((fieldRef, index) => ({
        row: summaryRows.length + index + 1,
        cells: [{
            fieldRef,
            label: fieldRef,
            value: fieldRef,
            labelMode: "visible" as const,
            policy: "read-only" as const,
            editable: false,
            hideWhenEmpty: false,
            width: "full" as const,
        }],
    }));
    return composeContextCollectionRows(factRows);
}

beforeEach(() => {
    ensureRuntimeSurfacesRegistered();
});

describe("identity builder/runtime parity fixture", () => {
    it("Builder Summary configuration equals runtime Summary", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.phone");
        config = addFieldToNestedGroup(config, "contact_edit", "person.email");
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        const builderSummaryKeys = identityConfigurationFieldKeys(
            withHouseholdRoleMergedGroups(config),
            "primary_contact",
            "summary",
        );
        const runtimeSummaryKeys = primary.summaryRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        expect(runtimeSummaryKeys).toEqual(builderSummaryKeys);
    });

    it("Builder Context preview equals runtime contextFactRows", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.phone");
        config = addFieldToNestedGroup(config, "contact_edit", "person.role_label", { tier: "context" });
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        const builderPreview = builderContextPreviewRows(withHouseholdRoleMergedGroups(config), "primary_contact");
        expect(primary.contextRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).toEqual(
            builderPreview.flatMap((row) => row.cells).map((cell) => cell.fieldRef),
        );
    });

    it("Builder Detail configuration equals runtime Details", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.address_line1", { tier: "expanded" });
        config = addFieldToNestedGroup(config, "contact_edit", "person.address_line2", { tier: "expanded" });
        // Seed pollution on the runtime section must not leak once contact_edit Details is explicit.
        config = {
            ...config,
            groups: config.groups.map((group) =>
                group.key === "primary_contact"
                    ? {
                          ...group,
                          expandedFieldKeys: [
                              "person.date_of_birth",
                              "person.address_line",
                              "person.address_line1",
                              "person.address_line2",
                          ],
                      }
                    : group,
            ),
        };
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        const builderDetailKeys = identityConfigurationFieldKeys(
            withHouseholdRoleMergedGroups(config),
            "primary_contact",
            "details",
        );
        const runtimeDetailKeys = identityRowsForDisclosureDepth(primary, "details").detailRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        expect(runtimeDetailKeys).toEqual(builderDetailKeys);
        expect(runtimeDetailKeys).toEqual(["person.address_line1", "person.address_line2"]);
        expect(runtimeDetailKeys).not.toContain("person.date_of_birth");
        expect(runtimeDetailKeys).not.toContain("person.address_line");
    });

    it("Builder Evidence collection order equals runtime Evidence", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addEvidenceCollectionToGroup(config, "primary_contact", "emergency_medical");
        config = addEvidenceCollectionToGroup(config, "primary_contact", "custom_notes");
        const evidence = buildHouseholdCardEvidence(ctx(householdRecord()), { nestedConfig: config });
        const card = buildHouseholdIdentityCardVM({ config, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        const builderOrder = config.groups.find((group) => group.key === "primary_contact")?.evidenceCollections?.map((entry) => entry.key);
        const runtimeOrder = primary.evidenceCollections?.map((entry) => entry.key);
        expect(runtimeOrder).toEqual(builderOrder);
    });

    it("children roster builder parity for summary + context facts", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "roster", "child.display_name");
        config = addFieldToNestedGroup(config, "roster", "inquiry_child.program", { tier: "context" });
        config = setNestedGroupEnabled(config, "medical", true);
        const vm = buildChildIdentityRecordVM({
            config,
            child: {
                id: "c1",
                name: "Emma",
                initial: "E",
                imageUrl: null,
                dobAge: "Age 4",
                program: "Preschool",
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
        const builderPreview = builderContextPreviewRows(config, "roster");
        expect(vm.contextRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef)).toEqual(
            builderPreview.flatMap((row) => row.cells).map((cell) => cell.fieldRef),
        );
        expect(vm.evidenceCollections?.[0]?.key).toBe("medical");
    });
    it("Builder and runtime layout match for every tier after drop + reconcile", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "primary_contact", "person.employer", { tier: "context_fact" });
        config = addFieldToNestedGroup(config, "primary_contact", "person.role_label", { tier: "context_fact" });
        config = applyNestedSurfaceFieldDrop(
            config,
            "primary_contact",
            "person.role_label",
            "person.employer",
            "beside",
            { tier: "context_fact" },
        );
        config = addFieldToNestedGroup(config, "primary_contact", "person.notes", { tier: "details" });
        config = addFieldToNestedGroup(config, "primary_contact", "person.address_line1", { tier: "details" });
        config = applyNestedSurfaceFieldDrop(
            config,
            "primary_contact",
            "person.address_line1",
            "person.notes",
            "beside",
            { tier: "details" },
        );

        const serialized = serializeIdentityNestedSurfacesForPublish({ [HOUSEHOLD_SURFACE_ID]: config });
        const published = readHouseholdNestedConfigFromDoc({
            surfaces: {},
            metadata: { nestedSurfaces: serialized },
        } as unknown as import("@/lib/layout/layoutV2").LayoutDoc)!;
        for (const purpose of ["summary", "context_facts", "details"] as const) {
            expect(identityConfigurationFieldKeys(published, "primary_contact", purpose)).toEqual(
                identityConfigurationFieldKeys(config, "primary_contact", purpose),
            );
        }
        expect(fieldLayoutWidthForNestedGroup(published, "primary_contact", "person.employer")).toBe(
            fieldLayoutWidthForNestedGroup(config, "primary_contact", "person.employer"),
        );
        expect(fieldLayoutWidthForNestedGroup(published, "primary_contact", "person.notes")).toBe(
            fieldLayoutWidthForNestedGroup(config, "primary_contact", "person.notes"),
        );
    });
});
