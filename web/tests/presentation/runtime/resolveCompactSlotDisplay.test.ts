/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { resolveCompactSlotDisplay } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { QueueRecordColumnConfig } from "@/lib/layout/queueRecordLayoutV3";

function familyContext(over: Partial<QueueRowContext> = {}): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Jordan Lee" },
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "opp-1",
            display_name: "Jordan Lee",
            case_type_label: "Enrollment",
            case_status_key: "open",
            case_status_label: "Open",
        },
        primary_contact: { display_name: "Casey Lee" },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-1",
                display_name: "Avery Lee",
                status_label: "Lead",
            },
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Rowan Lee",
                status_label: "Lead",
            },
        ],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
        ...over,
    };
}

function childContext(): QueueRowContext {
    return familyContext({
        row_subject: { subject_type: "child", subject_id: "child-1", display_name: "Avery Lee" },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Rowan Lee",
                status_label: "Lead",
            },
        ],
    });
}

function statusColumn(fieldKey: string, label: string): QueueRecordColumnConfig {
    return {
        id: `col-${fieldKey.replace(/\./g, "-")}`,
        label: "",
        width: "status_band",
        scope: { type: "lifecycle_context" },
        builderSlot: "status",
        blocks: [
            {
                type: "field_group",
                id: `grp-${fieldKey}`,
                fields: [{ id: `f-${fieldKey}`, fieldKey, label, display: "pill" }],
            },
        ],
    };
}

describe("resolveCompactSlotDisplay", () => {
    it("renders configured Stage field as process stage label, not row status", () => {
        const config = mapQueueRowSurfaceToCompactConfig({
            variant: "operational-row",
            version: 3,
            columns: [statusColumn("queue_row.stage_label", "Stage")],
            fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
        });
        const display = resolveCompactSlotDisplay("status", familyContext(), config.slots.status, null);
        expect(display).toBe("New Leads");
        expect(display).not.toBe("Open");
        expect(display).not.toBe("Stage");
    });

    it("renders configured Status field as record status such as Open", () => {
        const config = mapQueueRowSurfaceToCompactConfig({
            variant: "operational-row",
            version: 3,
            columns: [statusColumn("opportunity.status_label", "Status")],
            fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
        });
        const display = resolveCompactSlotDisplay("status", familyContext(), config.slots.status, null);
        expect(display).toBe("Open");
    });

    it("renders both Stage and Status when configured on the same slot", () => {
        const slots = {
            visible: true,
            label: "Stage · Status",
            fieldKeys: ["queue_row.stage_label", "opportunity.status_label"],
        } as const;
        expect(resolveCompactSlotDisplay("status", familyContext(), slots, null)).toBe("New Leads · Open");
    });

    it("renders child name on child-grain rows", () => {
        const slots = {
            visible: true,
            label: "Child name",
            fieldKeys: ["child.name"],
        } as const;
        expect(resolveCompactSlotDisplay("groupCount", childContext(), slots, null)).toBe("Avery Lee");
    });

    it("renders children collection field with configured presentation", () => {
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children"],
            collectionPresentationByFieldKey: {
                children: {
                    displayMode: "list" as const,
                    includedFields: ["first_name", "last_name"] as const,
                    listFormat: "comma" as const,
                    maxDisplayed: "all" as const,
                    overflowBehavior: "plus_n_more" as const,
                },
            },
        };
        expect(resolveCompactSlotDisplay("groupCount", familyContext(), slots, null)).toBe(
            "Avery Lee, Rowan Lee",
        );
    });

    it("legacy children.names still resolves for published configs", () => {
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children.names"],
        } as const;
        expect(resolveCompactSlotDisplay("groupCount", familyContext(), slots, null)).toBe(
            "Avery Lee, Rowan Lee",
        );
    });

    it("configured children field stays visible at runtime when related subjects exist", () => {
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children.names"],
        } as const;
        const family = familyContext();
        expect(resolveCompactSlotDisplay("groupCount", family, slots, null)).not.toBeNull();
    });

    it("renders children count and summary on family rows", () => {
        const count = resolveCompactSlotDisplay(
            "groupCount",
            familyContext(),
            { visible: true, label: null, fieldKeys: ["children.count"] },
            null,
        );
        expect(count).toBe("2 children");

        const summary = resolveCompactSlotDisplay(
            "groupCount",
            familyContext(),
            { visible: true, label: null, fieldKeys: ["children.summary"] },
            null,
        );
        expect(summary).toBe("2 children: Avery Lee, Rowan Lee");
    });

    it("renders child.name as first name when nameDisplay is first_name", () => {
        const slots = {
            visible: true,
            label: "Child name",
            fieldKeys: ["child.name"],
            nameDisplayByFieldKey: { "child.name": "first_name" as const },
        };
        expect(resolveCompactSlotDisplay("groupCount", childContext(), slots, null)).toBe("Avery");
    });

    it("legacy children.names first_name maps via collection included fields", () => {
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children.names"],
            nameDisplayByFieldKey: { "children.names": "first_name" as const },
        };
        expect(resolveCompactSlotDisplay("groupCount", familyContext(), slots, null)).toBe("Avery, Rowan");
    });
});
