import { describe, expect, it } from "vitest";
import {
    computeAnnouncementWorkspaceKpis,
    computeTemplateWorkspaceKpis,
    inboxKpiStatusLine,
} from "@/lib/communications/v2/communicationsWorkspaceKpiModel";

describe("communicationsWorkspaceKpiModel", () => {
    it("counts template KPIs from warmed list rows", () => {
        const k = computeTemplateWorkspaceKpis([
            { status: "active", category: "Enrollment", updated_at: "2026-06-20T12:00:00.000Z" },
            { status: "draft", category: "Enrollment", updated_at: "2026-06-23T08:00:00.000Z" },
            { status: "active", category: "Billing", updated_at: "2026-06-01T08:00:00.000Z" },
        ]);
        expect(k.active).toBe(2);
        expect(k.draft).toBe(1);
        expect(k.categories).toBe(2);
        expect(k.lastUpdatedLabel).not.toBe("—");
    });

    it("counts announcement KPIs including sent recently", () => {
        const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const k = computeAnnouncementWorkspaceKpis([
            { status: "draft", updated_at: recent },
            { status: "scheduled", updated_at: recent },
            { status: "sent", updated_at: recent },
            { status: "sent", updated_at: old },
        ]);
        expect(k.draft).toBe(1);
        expect(k.scheduled).toBe(1);
        expect(k.active).toBe(2);
        expect(k.sentRecently).toBe(1);
    });

    it("returns inbox KPI status lines for orientation", () => {
        expect(inboxKpiStatusLine("Needs reply", 2)).toBe("awaiting response");
        expect(inboxKpiStatusLine("Needs reply", 0)).toBe("all caught up");
        expect(inboxKpiStatusLine("Unknown", 1)).toBeNull();
    });
});
