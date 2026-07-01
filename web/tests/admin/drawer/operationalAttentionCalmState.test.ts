import { describe, expect, it } from "vitest";

import {
    isFutureTourScheduledInMetadata,
    resolveOperationalAttentionCalmState,
} from "@/lib/admin/drawer/operationalAttentionCalmState";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

describe("operationalAttentionCalmState", () => {
    const nowMs = Date.parse("2026-05-27T18:00:00.000Z");

    it("shows tour-specific calm copy when future tour is scheduled and attention cleared", () => {
        const row = {
            status_key: "tour_scheduled",
            metadata: {
                tour_date: "2026-06-01",
                tour_time: "09:00",
                tour_timezone: "America/Los_Angeles",
            },
        };
        const payload = {
            needs_attention: false,
            reasons: [],
            primary_reason: null,
        } as unknown as OpportunityAttentionResult;

        expect(isFutureTourScheduledInMetadata(row, nowMs)).toBe(true);
        expect(resolveOperationalAttentionCalmState(row, payload, nowMs)).toEqual({
            headline: "No urgent follow-up needed",
            subline: "Tour is scheduled. Next step: prepare for the upcoming tour.",
        });
    });

    it("returns null calm state when attention is still active", () => {
        const row = {
            status_key: "tour_scheduled",
            metadata: { tour_date: "2026-06-01", tour_time: "09:00", tour_timezone: "America/Los_Angeles" },
        };
        const payload = {
            needs_attention: true,
            primary_reason: { code: "tour_date_passed", label: "Tour date passed" },
            reasons: [{ code: "tour_date_passed", label: "Tour date passed" }],
        } as unknown as OpportunityAttentionResult;

        expect(resolveOperationalAttentionCalmState(row, payload, nowMs)).toBeNull();
    });
});
