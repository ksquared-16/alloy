import { describe, expect, it } from "vitest";

import {
    operationalStripReminderCount,
    operationalStripShowEmptyState,
} from "@/lib/admin/drawer/opportunityOperationalStripPresentation";

describe("opportunityOperationalStripPresentation", () => {
    it("counts scheduled sends plus optional next follow-up as reminders", () => {
        expect(operationalStripReminderCount(2, true)).toBe(3);
        expect(operationalStripReminderCount(0, false)).toBe(0);
    });

    it("shows calm empty state when no tasks or reminders and not loading", () => {
        expect(
            operationalStripShowEmptyState({
                loading: false,
                openTaskCount: 0,
                stripSendCount: 0,
                showNextFollowUp: false,
                hasError: false,
            })
        ).toBe(true);
        expect(
            operationalStripShowEmptyState({
                loading: true,
                openTaskCount: 0,
                stripSendCount: 0,
                showNextFollowUp: false,
                hasError: false,
            })
        ).toBe(false);
        expect(
            operationalStripShowEmptyState({
                loading: false,
                openTaskCount: 1,
                stripSendCount: 0,
                showNextFollowUp: false,
                hasError: false,
            })
        ).toBe(false);
    });
});
