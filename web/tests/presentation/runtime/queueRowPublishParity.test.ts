/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    mapQueueRowSurfaceToCompactConfig,
    isCompactRowEffectiveFieldKey,
} from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { nextQueueRecordBlockId } from "@/lib/layout/queueRecordLayoutIds";
import { resolveQueueRowFieldValueFromContext } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import {
    navigateFocusPanelCardLink,
    resolveFocusPanelCardLinkForField,
    pushFocusPanelCardLinkHistory,
    peekFocusPanelCardLinkBack,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinks";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

function layoutWithFields(fieldKeys: string[]): QueueRecordLayoutConfigV3 {
    const base = emptyQueueRowLayoutV3();
    return {
        ...base,
        columns: [
            {
                id: "col-1",
                label: "Primary",
                width: "small",
                blocks: [
                    {
                        id: nextQueueRecordBlockId("fg"),
                        type: "field_group",
                        title: null,
                        fields: fieldKeys.map((fieldKey) => ({
                            id: nextQueueRecordBlockId("f"),
                            fieldKey,
                            label: fieldKey,
                        })),
                    },
                ],
            },
        ],
    };
}

describe("published queue row config is authoritative", () => {
    it("hides contact when email/contact fields are removed from published config", () => {
        const mapped = mapQueueRowSurfaceToCompactConfig(
            layoutWithFields(["customer.display_name", "children.names"]),
        );
        expect(mapped.slots.contact.visible).toBe(false);
        expect(mapped.slots.groupCount.visible).toBe(true);
        expect(mapped.slots.groupCount.fieldKeys).toContain("children.names");
        expect(mapped.fallbackSlots).toEqual([]);
    });

    it("keeps generic contact fallback only when config is unpublished", () => {
        const mapped = mapQueueRowSurfaceToCompactConfig(null);
        expect(mapped.slots.contact.visible).toBe(true);
        expect(mapped.fallbackSlots).toContain("contact");
    });
});

describe("restored compact providers", () => {
    const ctx = {
        contract_version: 1,
        row_subject: { subject_type: "case", subject_id: "c1", display_name: "Kurzman" },
        row_stage: "waitlist",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "c1",
            display_name: "Kurzman",
            case_type_label: "",
            case_status_key: "",
            case_status_label: "Open",
        },
        primary_contact: null,
        related_subjects_summary: [],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: { label: "Schedule tour", source: "none" },
        drawer_open: { entity_type: "opportunities", entity_id: "o1", stage_focus_key: "waitlist" },
        waitlist_context: { position_label: "#3", wait_since: "12d" },
        placement_context: { location_id: null, room_label: "Nest", program_label: "Infant", schedule_label: "FT" },
    } as QueueRowContext;

    it("resolves waitlist position, wait since, next step, and room", () => {
        expect(isCompactRowEffectiveFieldKey("waitlist.positionLabel")).toBe(true);
        expect(resolveQueueRowFieldValueFromContext("waitlist.positionLabel", ctx)).toBe("#3");
        expect(resolveQueueRowFieldValueFromContext("waitlist.waitSince", ctx)).toBe("12d");
        expect(resolveQueueRowFieldValueFromContext("opportunity.next_step", ctx)).toBe("Schedule tour");
        expect(resolveQueueRowFieldValueFromContext("child.room", ctx)).toBe("Nest");
    });
});

describe("Focus Panel card links", () => {
    it("resolves and navigates through coordination.requestFocus", () => {
        const calls: Array<{ card: string; focus: string | null }> = [];
        const coordination = {
            focusTargets: new Set(["children", "scheduling"]),
            request: null,
            requestFocus: (card, focus) => {
                calls.push({ card, focus });
            },
        } as FocusPanelCoordination;

        const link = {
            id: "children-to-schedule",
            fromCard: "children" as const,
            toCard: "scheduling" as const,
            fromFieldKey: "inquiry_child.schedule_type",
            label: "Open schedule",
        };
        expect(resolveFocusPanelCardLinkForField([link], "children", "inquiry_child.schedule_type")).toEqual(
            link,
        );
        expect(navigateFocusPanelCardLink(coordination, link)).toBe(true);
        expect(calls).toEqual([{ card: "scheduling", focus: null }]);
    });

    it("supports back history helpers", () => {
        const history = pushFocusPanelCardLinkHistory(
            [{ card: "household", focus: null, at: 1 }],
            { card: "children", focus: "child-1", at: 2 },
        );
        expect(peekFocusPanelCardLinkBack(history)?.card).toBe("household");
    });
});
