import { describe, expect, it } from "vitest";

import { buildChildIdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import {
    addFieldToNestedGroup,
    CHILDREN_SURFACE_ID,
    defaultNestedSurfaceConfig,
    removeFieldFromNestedGroup,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import { identityRowsForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityDisclosureVM";

function sampleChild(overrides: Partial<ChildrenEvidenceChild> = {}): ChildrenEvidenceChild {
    return {
        id: "child-1",
        name: "Lennon Kurzman",
        customerMemberId: "member-1",
        personId: "person-1",
        firstName: "Lennon",
        lastName: "Kurzman",
        preferredName: null,
        nickname: null,
        dob: "2024-04-02",
        age: "2y",
        gender: "Female",
        ageBand: null,
        initial: "L",
        imageUrl: null,
        dobAge: "Apr 2, 2024 · 2y",
        program: "Pre-K",
        location: null,
        room: "Pre-K",
        schedule: "Pre-K · Mon–Fri · Aug 24, 2026 · 8:30 AM–4:00 PM",
        teacher: null,
        startDate: "Aug 4, 2026",
        status: null,
        needsAttention: false,
        missingLine: null,
        detailLine: null,
        hasCommittedPrimaryAssignment: true,
        ...overrides,
    };
}

function flatCells(vm: ReturnType<typeof buildChildIdentityRecordVM>) {
    const { visibleRows, detailRows } = identityRowsForDisclosureDepth(vm, "details");
    return [...visibleRows, ...detailRows].flatMap((row) => row.cells);
}

describe("children identity published config parity", () => {
    it("does not inject child_edit Start date into identity Details when not authored", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        // Ensure start_date is on child_edit (default seed) but removed from identity layers.
        config = removeFieldFromNestedGroup(config, "identity", "child.start_date");
        const identity = config.groups.find((g) => g.key === "identity")!;
        expect(identity.selectedFieldKeys).not.toContain("child.start_date");
        expect(identity.contextFieldKeys ?? []).not.toContain("child.start_date");
        expect(identity.expandedFieldKeys ?? []).not.toContain("child.start_date");

        const vm = buildChildIdentityRecordVM({
            config,
            child: sampleChild(),
            groupKey: "identity",
        });
        const refs = flatCells(vm).map((c) => c.fieldRef);
        expect(refs).not.toContain("child.start_date");
    });

    it("preserves authored Program then Schedule order on identity", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.program", { tier: "context_fact" });
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.schedule_type", {
            tier: "context_fact",
        });
        // Force order: Program then Schedule in context facts.
        config = {
            ...config,
            groups: config.groups.map((g) =>
                g.key === "identity"
                    ? {
                          ...g,
                          contextFieldKeys: ["inquiry_child.program", "inquiry_child.schedule_type"],
                          fieldPlacements: undefined,
                      }
                    : g,
            ),
        };

        const vm = buildChildIdentityRecordVM({
            config,
            child: sampleChild(),
            groupKey: "identity",
        });
        const refs = flatCells(vm)
            .map((c) => c.fieldRef)
            .filter((r) => r === "inquiry_child.program" || r === "inquiry_child.schedule_type");
        expect(refs.indexOf("inquiry_child.program")).toBeLessThan(refs.indexOf("inquiry_child.schedule_type"));
    });

    it("makes Program editable when no primary assignment exists", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.program", { tier: "context_fact" });
        const vm = buildChildIdentityRecordVM({
            config,
            child: sampleChild({
                hasCommittedPrimaryAssignment: false,
                program: null,
                room: null,
                schedule: null,
            }),
            groupKey: "identity",
            canMutate: true,
        });
        const program = flatCells(vm).find((c) => c.fieldRef === "inquiry_child.program");
        expect(program?.editable).toBe(true);
        expect(program?.linked).toBe(false);
        expect(program?.editControl?.kind).toBe("placement_select");
    });

    it("fills Program from evidence and links Change in Assignments when primary exists", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.program", { tier: "context_fact" });
        const vm = buildChildIdentityRecordVM({
            config,
            child: sampleChild({
                hasCommittedPrimaryAssignment: true,
                program: "Pre-K",
                room: "Pre-K",
            }),
            groupKey: "identity",
            canMutate: true,
        });
        const program = flatCells(vm).find((c) => c.fieldRef === "inquiry_child.program");
        expect(program?.value).toBe("Pre-K");
        expect(program?.linked).toBe(true);
        expect(program?.linkLabel).toMatch(/Change in Assignments/i);
        expect(program?.derivedSourceLabel).toBeNull();
    });

    it("displays Location as the site label, never the location_id UUID", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.location_id", {
            tier: "context_fact",
        });
        const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        const vm = buildChildIdentityRecordVM({
            config,
            child: sampleChild({
                location: "North Campus",
                hasCommittedPrimaryAssignment: false,
            }),
            groupKey: "identity",
            canMutate: true,
        });
        const location = flatCells(vm).find((c) => c.fieldRef === "inquiry_child.location_id");
        expect(location?.value).toBe("North Campus");
        expect(location?.value).not.toBe(uuid);
        expect(String(location?.value ?? "")).not.toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });

    it("treats Location as Editable (not Linked), including legacy Linked policies", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.location_id", {
            tier: "context_fact",
        });
        const group = config.groups.find((g) => g.key === "identity");
        if (group) {
            group.fieldPolicies = {
                ...(group.fieldPolicies ?? {}),
                "inquiry_child.location_id": "linked",
            };
        }
        const vm = buildChildIdentityRecordVM({
            config,
            child: sampleChild({
                location: "North Campus",
                locationId: "site-north",
                locationInherited: false,
                hasCommittedPrimaryAssignment: false,
            }),
            groupKey: "identity",
            canMutate: true,
        });
        const location = flatCells(vm).find((c) => c.fieldRef === "inquiry_child.location_id");
        expect(location?.editable).toBe(true);
        expect(location?.linked).toBe(false);
        expect(location?.editControl).toMatchObject({ kind: "placement_select", placement: "site" });
    });

    it("annotates Location when display inherits the lead site", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.location_id", {
            tier: "context_fact",
        });
        const vm = buildChildIdentityRecordVM({
            config,
            child: sampleChild({
                location: "North Campus",
                locationId: "site-north",
                locationOwnedId: null,
                locationInherited: true,
                hasCommittedPrimaryAssignment: false,
            }),
            groupKey: "identity",
            canMutate: true,
        });
        const location = flatCells(vm).find((c) => c.fieldRef === "inquiry_child.location_id");
        expect(location?.derivedSourceLabel).toMatch(/Inherited from lead/i);
        expect(location?.editable).toBe(true);
    });
});
