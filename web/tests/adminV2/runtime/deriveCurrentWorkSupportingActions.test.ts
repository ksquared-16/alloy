import { describe, expect, it } from "vitest";

import { deriveCurrentWorkSupportingActions } from "@/lib/adminV2/runtime/focusPanel/currentWork/deriveCurrentWorkSupportingActions";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";

function slots(partial: Partial<ResolvedActionsBySlot>): ResolvedActionsBySlot {
    return {
        primary: [],
        secondary: [],
        overflow: [],
        right_rail: [],
        row_inline: [],
        header: [],
        ...partial,
    };
}

describe("deriveCurrentWorkSupportingActions", () => {
    it("includes registry secondary actions and excludes Manage overflow", () => {
        const actions = deriveCurrentWorkSupportingActions({
            recordHeaderSlots: slots({
                secondary: [{ key: "schedule_tour", label: "Schedule Tour", description: null, action_type: "registry", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null }],
                overflow: [{ key: "archive_lead", label: "Archive Lead", description: null, action_type: "registry", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null }],
            }),
            showOutcomeCompletion: false,
            primaryActionLabel: null,
        });
        expect(actions.map((a) => a.key)).toEqual(["schedule_tour"]);
    });

    it("excludes completion duplicates when Current Work owns completion", () => {
        const actions = deriveCurrentWorkSupportingActions({
            recordHeaderSlots: slots({
                secondary: [
                    { key: "quick_message", label: "Message", description: null, action_type: "registry", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null },
                    { key: "close_lead", label: "Close Lead", description: null, action_type: "registry", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null },
                    { key: "schedule_tour", label: "Schedule Tour", description: null, action_type: "registry", icon: null, style: null, display_style: "outline", payload: {}, workflow_id: null },
                ],
            }),
            showOutcomeCompletion: true,
            primaryActionLabel: "Record outcome",
        });
        expect(actions.map((a) => a.key)).toEqual(["schedule_tour"]);
    });
});
