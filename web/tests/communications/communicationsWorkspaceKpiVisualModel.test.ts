import { describe, expect, it } from "vitest";
import {
    commsAnnouncementKpiVisual,
    commsInboxKpiVisual,
    commsTemplateKpiVisual,
} from "@/lib/communications/v2/communicationsWorkspaceKpiVisualModel";

describe("communicationsWorkspaceKpiVisualModel", () => {
    it("assigns distinct inbox icons and accents", () => {
        const needsReply = commsInboxKpiVisual("Needs reply");
        const overdue = commsInboxKpiVisual("Overdue");
        const unread = commsInboxKpiVisual("Unread");
        expect(needsReply.iconKey).toBe("message-square");
        expect(overdue.iconKey).toBe("clock-3");
        expect(unread.iconKey).toBe("inbox");
        expect(new Set([needsReply.accent, overdue.accent, unread.accent]).size).toBeGreaterThan(1);
    });

    it("assigns template and announcement visual specs", () => {
        expect(commsTemplateKpiVisual("Draft Templates").iconKey).toBe("pencil");
        expect(commsAnnouncementKpiVisual("Scheduled").iconKey).toBe("calendar");
    });
});
