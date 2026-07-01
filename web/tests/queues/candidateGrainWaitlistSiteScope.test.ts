import { describe, expect, it } from "vitest";
import { __testing } from "@/lib/queues/candidateGrainWaitlistQueue";

const { passesWaitlistCandidateLocationScope } = __testing;

describe("passesWaitlistCandidateLocationScope", () => {
    const north = "north-site-id";
    const south = "south-site-id";

    it("matches candidate site_id when set", () => {
        const row = {
            site_id: north,
            opportunities: { id: "opp-1", location_id: south },
        } as Parameters<typeof passesWaitlistCandidateLocationScope>[0];
        expect(passesWaitlistCandidateLocationScope(row, { workUnitIds: null, locationIds: [north], impossible: false })).toBe(true);
        expect(passesWaitlistCandidateLocationScope(row, { workUnitIds: null, locationIds: [south], impossible: false })).toBe(false);
    });

    it("falls back to opportunity location_id when candidate site missing", () => {
        const row = {
            site_id: null,
            opportunities: { id: "opp-2", location_id: south },
        } as Parameters<typeof passesWaitlistCandidateLocationScope>[0];
        expect(passesWaitlistCandidateLocationScope(row, { workUnitIds: null, locationIds: [south], impossible: false })).toBe(true);
        expect(passesWaitlistCandidateLocationScope(row, { workUnitIds: null, locationIds: [north], impossible: false })).toBe(false);
    });

    it("passes all rows when location scope unrestricted", () => {
        const row = {
            site_id: null,
            opportunities: { id: "opp-3", location_id: null },
        } as Parameters<typeof passesWaitlistCandidateLocationScope>[0];
        expect(passesWaitlistCandidateLocationScope(row, null)).toBe(true);
    });
});
