/**
 * Published identity surface parity — Builder publish path and /work-unit runtime
 * must project through the same canonical resolver.
 */
import { describe, expect, it, beforeEach } from "vitest";

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    addFieldToNestedGroup,
    applyNestedSurfaceFieldDrop,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    CHILDREN_SURFACE_ID,
    identityConfigurationFieldKeys,
    fieldLayoutWidthForNestedGroup,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    CHILD_SURFACE_COMPAT_ID,
    HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID,
    reconcileIdentityNestedConfigFromDocMetadata,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    resolvePublishedIdentitySurfaceConfigFromDoc,
    serializeIdentityNestedSurfacesForPublish,
} from "@/lib/adminV2/runtime/focusPanel/identity/resolvePublishedIdentitySurfaceConfig";
import { readHouseholdNestedConfigFromDoc } from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";
import { readChildrenNestedConfigFromDoc } from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import { buildHouseholdIdentityCardVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";


function groupWithSummaryFields(
    config: ReturnType<typeof defaultNestedSurfaceConfig>,
    groupKey: string,
    summaryKeys: string[],
) {
    return {
        ...config,
        groups: config.groups.map((group) =>
            group.key === groupKey
                ? { ...group, selectedFieldKeys: summaryKeys, fieldPlacements: [] }
                : group,
        ),
    };
}

function docWithNestedSurfaces(nestedSurfaces: Record<string, unknown>): LayoutDoc {
    return { surfaces: {}, metadata: { nestedSurfaces } } as unknown as LayoutDoc;
}

function householdCtx(): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Household" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth: {
            id: "opp-1",
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
            _inquiry_children: [],
        },
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

function publishRoundTrip(surfaceId: string, draft: ReturnType<typeof defaultNestedSurfaceConfig>) {
    const serialized = serializeIdentityNestedSurfacesForPublish({ [surfaceId]: draft });
    const doc = docWithNestedSurfaces(serialized);
    return {
        publishedDoc: serialized,
        builderResolved: reconcileIdentityNestedConfigFromDocMetadata(surfaceId, { nestedSurfaces: serialized }),
        runtimeResolved:
            surfaceId === HOUSEHOLD_SURFACE_ID
                ? readHouseholdNestedConfigFromDoc(doc)
                : readChildrenNestedConfigFromDoc(doc),
        docResolved: resolvePublishedIdentitySurfaceConfigFromDoc(surfaceId, doc),
    };
}

beforeEach(() => {
    ensureRuntimeSurfacesRegistered();
});

describe("published identity surface parity", () => {
    it("publish round-trip preserves Phone | Email summary pairing for Primary Contact", () => {
        let draft = groupWithSummaryFields(defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID), "primary_contact", []);
        draft = addFieldToNestedGroup(draft, "primary_contact", "person.phone");
        draft = addFieldToNestedGroup(draft, "primary_contact", "person.email");
        draft = applyNestedSurfaceFieldDrop(
            draft,
            "primary_contact",
            "person.email",
            "person.phone",
            "beside",
            { tier: "summary" },
        );

        const { publishedDoc, builderResolved, runtimeResolved, docResolved } = publishRoundTrip(HOUSEHOLD_SURFACE_ID, draft);
        const group = publishedDoc[HOUSEHOLD_SURFACE_ID]?.groups.find((g) => g.key === "primary_contact");
        expect(group?.selectedFieldKeys).toEqual(["person.phone", "person.email"]);
        expect(group?.fieldPlacements?.map((p) => ({ fieldRef: p.fieldRef, row: p.row, column: p.column, width: p.width }))).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ fieldRef: "person.phone", width: "half" }),
                expect.objectContaining({ fieldRef: "person.email", width: "half" }),
            ]),
        );

        expect(builderResolved).toEqual(runtimeResolved);
        expect(runtimeResolved).toEqual(docResolved);
        expect(fieldLayoutWidthForNestedGroup(runtimeResolved!, "primary_contact", "person.phone")).toBe("half");
        expect(fieldLayoutWidthForNestedGroup(runtimeResolved!, "primary_contact", "person.email")).toBe("half");
    });

    it("publish omits legacy surface keys and canonical config wins over legacy child_surface", () => {
        let canonical = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        canonical = addFieldToNestedGroup(canonical, "roster", "child.display_name");

        const legacy = defaultNestedSurfaceConfig(CHILD_SURFACE_COMPAT_ID);
        const legacyWithFields = {
            ...legacy,
            groups: legacy.groups.map((group) =>
                group.key === "child_edit"
                    ? { ...group, selectedFieldKeys: ["child.legacy_field"] }
                    : group,
            ),
        };

        const serialized = serializeIdentityNestedSurfacesForPublish({
            [CHILDREN_SURFACE_ID]: canonical,
            [CHILD_SURFACE_COMPAT_ID]: legacyWithFields,
        });

        expect(serialized[CHILD_SURFACE_COMPAT_ID]).toBeUndefined();
        expect(identityConfigurationFieldKeys(serialized[CHILDREN_SURFACE_ID], "roster", "summary")).toEqual(["child.display_name"]);
        expect(identityConfigurationFieldKeys(serialized[CHILDREN_SURFACE_ID], "child_edit", "summary")).not.toContain("child.legacy_field");
    });

    it("canonical household_surface wins over legacy household_contact_surface at runtime", () => {
        const canonicalWithPhone = groupWithSummaryFields(
            defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID),
            "primary_contact",
            ["person.phone"],
        );

        const legacy = defaultNestedSurfaceConfig(HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID);
        const legacyWithEmail = addFieldToNestedGroup(legacy, "contact_fields", "person.email");

        const metadata = {
            nestedSurfaces: {
                [HOUSEHOLD_SURFACE_ID]: canonicalWithPhone,
                [HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID]: legacyWithEmail,
            },
        };
        const resolved = reconcileIdentityNestedConfigFromDocMetadata(HOUSEHOLD_SURFACE_ID, metadata);
        expect(identityConfigurationFieldKeys(resolved!, "primary_contact", "summary")).toEqual(["person.phone"]);
        expect(identityConfigurationFieldKeys(resolved!, "primary_contact", "summary")).not.toContain("contact.email");
    });

    it("explicit empty summary does not fall back to platform defaults", () => {
        let draft = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        draft = {
            ...draft,
            groups: draft.groups.map((group) =>
                group.key === "primary_contact"
                    ? { ...group, selectedFieldKeys: [], fieldPlacements: [] }
                    : group,
            ),
        };

        const { runtimeResolved } = publishRoundTrip(HOUSEHOLD_SURFACE_ID, draft);
        expect(identityConfigurationFieldKeys(runtimeResolved!, "primary_contact", "summary")).toEqual([]);
    });

    it("Builder live-preview projector equals work-unit runtime projector", () => {
        let draft = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        draft = addFieldToNestedGroup(draft, "primary_contact", "person.phone");
        draft = addFieldToNestedGroup(draft, "primary_contact", "person.email");
        draft = addFieldToNestedGroup(draft, "primary_contact", "person.address_line", { tier: "expanded" });
        draft = applyNestedSurfaceFieldDrop(
            draft,
            "primary_contact",
            "person.email",
            "person.phone",
            "beside",
            { tier: "summary" },
        );

        const { builderResolved, runtimeResolved } = publishRoundTrip(HOUSEHOLD_SURFACE_ID, draft);
        expect(builderResolved).toEqual(runtimeResolved);

        const evidence = buildHouseholdCardEvidence(householdCtx(), { nestedConfig: runtimeResolved });
        const card = buildHouseholdIdentityCardVM({ config: runtimeResolved!, groups: evidence.groups, canMutate: false });
        const primary = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;

        const builderSummary = identityConfigurationFieldKeys(builderResolved!, "primary_contact", "summary");
        const runtimeSummary = primary.summaryRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        expect(runtimeSummary).toEqual(builderSummary);
        expect(runtimeSummary).not.toContain("person.address_line");

        const builderDetails = identityConfigurationFieldKeys(builderResolved!, "primary_contact", "details");
        const runtimeDetails = primary.detailRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        expect(runtimeDetails).toEqual(builderDetails);
    });

    it("children publish round-trip preserves summary and context fact tiers", () => {
        let draft = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        draft = addFieldToNestedGroup(draft, "roster", "child.display_name");
        draft = addFieldToNestedGroup(draft, "roster", "inquiry_child.program", { tier: "context" });

        const { builderResolved, runtimeResolved } = publishRoundTrip(CHILDREN_SURFACE_ID, draft);
        expect(builderResolved).toEqual(runtimeResolved);
        expect(identityConfigurationFieldKeys(runtimeResolved!, "roster", "summary")).toEqual(["child.display_name"]);
        expect(identityConfigurationFieldKeys(runtimeResolved!, "roster", "context_facts")).toEqual(["inquiry_child.program"]);
    });
});
