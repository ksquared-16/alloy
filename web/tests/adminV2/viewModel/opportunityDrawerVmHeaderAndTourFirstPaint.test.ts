import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { buildOpportunityDrawerHeaderMenuActions } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerHeaderMenuActions";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("buildOpportunityDrawerHeaderMenuActions", () => {
    it("flattens primary and header slots for command rail menu", () => {
        const menu = buildOpportunityDrawerHeaderMenuActions(
            {
                ...emptyResolvedActionsBySlot(),
                primary: [
                    {
                        key: "send_form",
                        label: "Send form",
                        description: null,
                        action_type: "ui_intent",
                        icon: null,
                        style: null,
                        display_style: "button",
                        payload: { intent: "send_form" },
                        workflow_id: null,
                    },
                ],
                header: [
                    {
                        key: "schedule_tour",
                        label: "Schedule tour",
                        description: null,
                        action_type: "workflow",
                        icon: null,
                        style: null,
                        display_style: "button",
                        payload: {},
                        workflow_id: null,
                    },
                ],
            },
            false
        );
        expect(menu.map((a) => a.key)).toEqual(["send_form", "schedule_tour"]);
    });

    it("relabels schedule_tour when an active booking exists", () => {
        const menu = buildOpportunityDrawerHeaderMenuActions(
            {
                ...emptyResolvedActionsBySlot(),
                header: [
                    {
                        key: "schedule_tour",
                        label: "Schedule tour",
                        description: null,
                        action_type: "workflow",
                        icon: null,
                        style: null,
                        display_style: "button",
                        payload: {},
                        workflow_id: null,
                    },
                ],
            },
            true
        );
        expect(menu[0]?.label).toBe("Reschedule tour");
    });
});

describe("Opportunity VM tour first paint", () => {
    it("compose stores active_tour_bookings on summaries", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("active_tour_bookings");
        expect(compose).toContain("buildOpportunityDrawerHeaderMenuActions");
    });

});
