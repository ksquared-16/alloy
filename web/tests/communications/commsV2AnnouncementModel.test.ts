import { describe, expect, it } from "vitest";
import {
    resolveAudience,
    planAnnouncementDeliveries,
    aggregateAnnouncementTracking,
    type AudienceCandidate,
} from "@/lib/communications/v2/announcementModel";

const CAND: AudienceCandidate[] = [
    { personId: "p1", locationId: "L1", status: "enrolled", program: "preschool" },
    { personId: "p2", locationId: "L1", status: "lead", program: "preschool" },
    { personId: "p3", locationId: "L2", status: "enrolled", program: "infant" },
];

describe("audience targeting", () => {
    it("ANDs the provided constraints", () => {
        expect(resolveAudience({ locationId: "L1" }, CAND).personIds).toEqual(["p1", "p2"]);
        expect(resolveAudience({ status: "enrolled", program: "preschool" }, CAND).personIds).toEqual(["p1"]);
        expect(resolveAudience({}, CAND).count).toBe(3);
    });
});

describe("delivery planning (consent-gated via injection)", () => {
    it("skips recipients the consent decision blocks", () => {
        const r = planAnnouncementDeliveries({
            orgId: "o", announcementId: "a1", personIds: ["p1", "p2", "p3"], allow: (id) => id !== "p2",
        });
        expect(r.deliveries.map((d) => d.person_id)).toEqual(["p1", "p3"]);
        expect(r.skipped).toEqual(["p2"]);
        expect(r.deliveries[0]).toMatchObject({ org_id: "o", announcement_id: "a1", status: "queued" });
    });
});

describe("tracking aggregation", () => {
    it("counts delivered/opened/clicked", () => {
        const t = aggregateAnnouncementTracking([
            { delivered_at: "x", opened_at: "x", clicked_at: "x" },
            { delivered_at: "x", opened_at: "x" },
            { delivered_at: "x" },
            {},
        ]);
        expect(t).toEqual({ total: 4, delivered: 3, opened: 2, clicked: 1 });
    });
});
