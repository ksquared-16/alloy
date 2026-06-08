import { describe, expect, it } from "vitest";

import { detectOperationalAnomalies } from "@/lib/agent/taskAssist/taskAssistOperationalAnomalies";

describe("detectOperationalAnomalies", () => {
    it("warns on similar open task", () => {
        const w = detectOperationalAnomalies({
            intent: "create_reminder",
            title: "Follow up with Mitchell",
            dueAtIso: "2026-05-18T13:00:00.000Z",
            openTasks: [
                {
                    id: "t1",
                    title: "Follow up Mitchell",
                    due_at: "2026-05-18T14:00:00.000Z",
                    status: "open",
                },
            ],
            pendingScheduledSends: [],
        });
        expect(w?.kind).toBe("similar_open_task");
        expect(w?.message).toMatch(/already/i);
    });

    it("warns on nearby scheduled send", () => {
        const w = detectOperationalAnomalies({
            intent: "schedule_message",
            scheduledForIso: "2026-05-18T13:00:00.000Z",
            openTasks: [],
            pendingScheduledSends: [
                { id: "s1", scheduled_for: "2026-05-18T13:30:00.000Z", status: "pending" },
            ],
        });
        expect(w?.kind).toBe("similar_scheduled_send");
    });
});
