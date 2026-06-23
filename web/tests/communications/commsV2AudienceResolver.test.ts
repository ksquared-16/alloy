import { describe, expect, it } from "vitest";
import {
    aggregateChannelCounts,
    buildRecipientPreview,
    intersectDistinct,
    unionDistinct,
    type TargetResolution,
} from "@/lib/communications/v2/audienceResolver";

/** Comms V2 Phase 1 / B8A — pure resolver helpers (no fixed buckets). */

describe("aggregateChannelCounts", () => {
    it("counts reachability, drops archived + contactless + duplicates", () => {
        const c = aggregateChannelCounts([
            { id: "p1", email: "a@x.com", phone: "555" },
            { id: "p1", email: "a@x.com", phone: "555" }, // dup
            { id: "p2", email: "b@x.com", phone: null },
            { id: "p3", email: null, phone: "777" },
            { id: "p4", email: null, phone: null }, // child / no contact
            { id: "p5", email: "z@x.com", phone: "1", archived: true }, // archived
        ]);
        expect(c).toEqual({ email: 2, sms: 2, in_app: 3, messageable: 3 });
    });
});

describe("unionDistinct / intersectDistinct (filter set algebra)", () => {
    it("unions and de-dupes preserving order", () => {
        expect(unionDistinct([["a", "b"], ["b", "c"], ["a"]])).toEqual(["a", "b", "c"]);
    });
    it("intersects (AND across filters), order-preserving on the first set", () => {
        expect(intersectDistinct(["a", "b", "c"], ["c", "a"])).toEqual(["a", "c"]);
        expect(intersectDistinct(["a"], ["b"])).toEqual([]);
        expect(intersectDistinct([], ["a"])).toEqual([]);
    });
});

describe("buildRecipientPreview (legacy back-compat shape)", () => {
    it("assembles totals, splits out unresolved, caps the sample at 5", () => {
        const perTarget: TargetResolution[] = [
            { target_type: "family_status", target_ref: null, status: "resolved", family_count: 10, detail: "ok" },
            { target_type: "room", target_ref: null, status: "unresolved", family_count: 0, detail: "needs option source" },
        ];
        const p = buildRecipientPreview({
            perTarget,
            totalFamilies: 10,
            channelCounts: { email: 8, sms: 6, in_app: 9, messageable: 9 },
            optedOut: 1,
            sampleFamilies: ["A", "B", "C", "D", "E", "F"],
            capped: false,
        });
        expect(p.total_count).toBe(10);
        expect(p.unresolved).toHaveLength(1);
        expect(p.unresolved[0].target_type).toBe("room");
        expect(p.sample_recipients).toHaveLength(5);
    });
});
