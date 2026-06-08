import { describe, expect, it } from "vitest";

import { flattenOpportunityRecordHeaderActionsForMenu } from "@/lib/admin/actions/flattenOpportunityRecordHeaderActionsForMenu";
import { emptyResolvedActionsBySlot, type ResolvedActionForClient } from "@/lib/admin/actions/types";

function act(key: string): ResolvedActionForClient {
    return {
        key,
        label: key,
        description: null,
        action_type: "ui_intent",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    };
}

describe("flattenOpportunityRecordHeaderActionsForMenu", () => {
    it("merges primary, secondary, and overflow into menu order", () => {
        const menu = flattenOpportunityRecordHeaderActionsForMenu({
            ...emptyResolvedActionsBySlot(),
            primary: [act("move_to_qualification")],
            secondary: [act("schedule_tour"), act("send_enrollment_packet")],
            overflow: [act("mark_lost")],
        });
        expect(menu.map((a) => a.key)).toEqual([
            "move_to_qualification",
            "schedule_tour",
            "send_enrollment_packet",
            "mark_lost",
        ]);
    });

    it("dedupes by action key (first slot wins)", () => {
        const duplicate = act("schedule_tour");
        const menu = flattenOpportunityRecordHeaderActionsForMenu({
            ...emptyResolvedActionsBySlot(),
            primary: [duplicate],
            secondary: [act("schedule_tour")],
        });
        expect(menu).toHaveLength(1);
        expect(menu[0]?.key).toBe("schedule_tour");
    });

    it("returns empty array when no actions resolved", () => {
        expect(flattenOpportunityRecordHeaderActionsForMenu(emptyResolvedActionsBySlot())).toEqual([]);
    });
});
