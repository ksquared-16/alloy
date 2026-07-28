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
        room: "Pre-K",
        schedule: "Pre-K · Mon–Fri · Aug 24, 2026 · 8:30 AM–4:00 PM",
        teacher: null,
        startDate: "Aug 4, 2026",
        status: null,
        statusKey: null,
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
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.program", { tier: "context_facts" });
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.schedule_type", {
            tier: "context_facts",
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

    it("links Program to Assignments when no primary assignment exists", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.program", { tier: "context_facts" });
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
        expect(program?.linked).toBe(true);
        expect(program?.linkLabel).toMatch(/Set up in Assignments/i);
        expect(program?.editable).toBe(false);
    });

    it("fills Program from evidence and links Change in Assignments when primary exists", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = addFieldToNestedGroup(config, "identity", "inquiry_child.program", { tier: "context_facts" });
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
        expect(program?.derivedSourceLabel).toMatch(/primary classroom/i);
    });
});
