import { describe, expect, it } from "vitest";

import {
    buildOpportunityDrawerViewModelRightColumn,
    settledDrawerEnrichmentState,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelAboveFold";
import { parseInquirySummaryTasksFromRecord } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelSummaries";

describe("buildOpportunityDrawerViewModelRightColumn", () => {
    it("returns settled tasks ready state from inquiry summary task preview", () => {
        const record = {
            _inquiry_summary_tasks: {
                state: "loaded",
                open_count: 1,
                open_tasks: [
                    {
                        id: "task-1",
                        title: "Call back",
                        due_at: "2026-06-04T12:00:00.000Z",
                        status: "open",
                        source: "task_assist",
                    },
                ],
            },
        };
        const column = buildOpportunityDrawerViewModelRightColumn({
            record,
            reminders: {
                state: "empty",
                next_follow_up_iso: null,
                scheduled_send_count: 0,
                scheduled_sends: [],
            },
            task_assist_enabled: true,
        });
        expect(column.tasks.state).toBe("ready");
        expect(column.tasks.open_count).toBe(1);
        expect(column.reminders.state).toBe("empty");
    });

    it("returns settled reminders ready when scheduled sends exist", () => {
        const column = buildOpportunityDrawerViewModelRightColumn({
            record: {},
            reminders: {
                state: "ready",
                next_follow_up_iso: null,
                scheduled_send_count: 1,
                scheduled_sends: [
                    {
                        id: "send-1",
                        scheduled_for: "2026-06-05T09:00:00.000Z",
                        status: "pending",
                        channel: "sms",
                    },
                ],
            },
            task_assist_enabled: true,
        });
        expect(column.reminders.state).toBe("ready");
        expect(column.reminders.next_follow_up_iso).toBeNull();
    });

    it("hides task/reminder slots when task assist disabled", () => {
        const column = buildOpportunityDrawerViewModelRightColumn({
            record: {},
            reminders: {
                state: "empty",
                next_follow_up_iso: null,
                scheduled_send_count: 0,
                scheduled_sends: [],
            },
            task_assist_enabled: false,
        });
        expect(column.tasks.visible).toBe(false);
        expect(column.reminders.visible).toBe(false);
    });
});

describe("parseInquirySummaryTasksFromRecord", () => {
    it("defaults to empty loaded payload when preview missing", () => {
        expect(parseInquirySummaryTasksFromRecord({})).toEqual({
            state: "loaded",
            open_tasks: [],
            open_count: 0,
        });
    });
});

describe("settledDrawerEnrichmentState", () => {
    it("marks full compose as complete", () => {
        expect(settledDrawerEnrichmentState({ id: "opp-1" })).toMatchObject({
            primary_loaded: true,
            full_complete: true,
            full_pending: false,
        });
    });
});
