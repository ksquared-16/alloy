import { describe, expect, it } from "vitest";
import {
    computeAnnouncementOperationalHealth,
    computeInboxOperationalHealth,
    computeTemplateOperationalHealth,
} from "@/lib/communications/v2/communicationsOperationalHealthModel";

describe("communicationsOperationalHealthModel", () => {
    it("computes inbox operational health without inventory counts", () => {
        const health = computeInboxOperationalHealth(
            { requiresResponse: 2, slaAtRisk: 1, unread: 5, unclassified: 3 },
            4,
        );
        expect(health).toEqual({
            needsReply: 2,
            unread: 5,
            scheduled: 4,
            needsReview: 3,
        });
    });

    it("computes announcement health with sent today and failed rollup", () => {
        const today = new Date().toISOString();
        const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const health = computeAnnouncementOperationalHealth([
            { status: "draft", updated_at: today },
            { status: "scheduled", updated_at: today },
            { status: "sent", updated_at: today },
            { status: "sent", updated_at: old, failed_recipient_count: 2 },
        ]);
        expect(health.draft).toBe(1);
        expect(health.scheduled).toBe(1);
        expect(health.sentToday).toBe(1);
        expect(health.failed).toBe(2);
    });

    it("computes template health with needs review and recently updated", () => {
        const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const health = computeTemplateOperationalHealth([
            { status: "active", updated_at: recent },
            { status: "draft", updated_at: recent, has_version: true },
            { status: "draft", updated_at: old, has_version: false },
            { status: "archived", updated_at: old },
        ]);
        expect(health.active).toBe(1);
        expect(health.draft).toBe(2);
        expect(health.needsReview).toBe(1);
        expect(health.recentlyUpdated).toBe(2);
    });
});
