import { describe, expect, it } from "vitest";
import {
    audienceSpecToRule,
    legacyTargetsToSpec,
    parseAudienceSpecFromRule,
    validateAudienceFilter,
    validateAudienceSpec,
} from "@/lib/communications/v2/audienceSpec";

/** Comms V2 Phase 1 / B8A — Announcement Audience Spec validation (pure). */

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

describe("validateAudienceSpec — grain", () => {
    it("accepts families and children grains", () => {
        expect(validateAudienceSpec({ grain: "families", filters: [] }).ok).toBe(true);
        expect(validateAudienceSpec({ grain: "children", filters: [] }).ok).toBe(true);
    });
    it("rejects a bad grain", () => {
        expect(validateAudienceSpec({ grain: "people", filters: [] }).ok).toBe(false);
        expect(validateAudienceSpec({ filters: [] }).ok).toBe(false);
    });
    it("treats empty/absent filters as all families (valid)", () => {
        const r = validateAudienceSpec({ grain: "families" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.filters).toEqual([]);
    });
});

describe("validateAudienceFilter — status filters use concrete status_keys", () => {
    it("accepts non-empty status_keys for family/child status", () => {
        expect(validateAudienceFilter({ kind: "family_status", status_keys: ["open"] }).ok).toBe(true);
        expect(validateAudienceFilter({ kind: "child_enrollment_status", status_keys: ["enrolled", "waitlisted"] }).ok).toBe(true);
    });
    it("rejects empty status_keys arrays", () => {
        expect(validateAudienceFilter({ kind: "family_status", status_keys: [] }).ok).toBe(false);
        expect(validateAudienceFilter({ kind: "child_enrollment_status", status_keys: [""] }).ok).toBe(false);
    });
});

describe("validateAudienceFilter — id filters", () => {
    it("accepts uuid arrays for location and program", () => {
        expect(validateAudienceFilter({ kind: "location", location_ids: [UUID] }).ok).toBe(true);
        expect(validateAudienceFilter({ kind: "program", program_category_ids: [UUID, UUID2] }).ok).toBe(true);
    });
    it("rejects malformed uuid arrays", () => {
        expect(validateAudienceFilter({ kind: "location", location_ids: ["nope"] }).ok).toBe(false);
        expect(validateAudienceFilter({ kind: "program", program_category_ids: [] }).ok).toBe(false);
    });
});

describe("validateAudienceFilter — room requires location + program scope", () => {
    it("accepts a room filter scoped by location_id + program_category_id", () => {
        const r = validateAudienceFilter({
            kind: "room",
            room_cohort_keys: ["zebra"],
            location_id: UUID,
            program_category_id: UUID2,
        });
        expect(r.ok).toBe(true);
    });
    it("rejects a room filter missing the location/program scope", () => {
        expect(validateAudienceFilter({ kind: "room", room_cohort_keys: ["zebra"] }).ok).toBe(false);
        expect(validateAudienceFilter({ kind: "room", room_cohort_keys: ["zebra"], location_id: UUID }).ok).toBe(false);
        expect(validateAudienceFilter({ kind: "room", room_cohort_keys: [], location_id: UUID, program_category_id: UUID2 }).ok).toBe(false);
    });
});

describe("validateAudienceFilter — unknown kind", () => {
    it("rejects an invalid filter kind", () => {
        expect(validateAudienceFilter({ kind: "household_income" }).ok).toBe(false);
    });
});

describe("spec round-trip + legacy adapter", () => {
    it("round-trips through rule.audience_spec", () => {
        const spec = { grain: "children" as const, filters: [{ kind: "child_enrollment_status" as const, status_keys: ["enrolled"] }] };
        const rule = audienceSpecToRule(spec);
        expect(parseAudienceSpecFromRule(rule)).toEqual(spec);
        expect(parseAudienceSpecFromRule({})).toBeNull();
        expect(parseAudienceSpecFromRule({ audience_spec: { grain: "bad" } })).toBeNull();
    });

    it("maps a legacy custom row to its embedded spec", () => {
        const spec = { grain: "families" as const, filters: [{ kind: "location" as const, location_ids: [UUID] }] };
        const out = legacyTargetsToSpec([{ target_type: "custom", target_ref: null, rule: audienceSpecToRule(spec) }]);
        expect(out).toEqual(spec);
    });

    it("maps legacy location/program targets to filters and DROPS buckets", () => {
        const out = legacyTargetsToSpec([
            { target_type: "location", target_ref: UUID },
            { target_type: "program", target_ref: UUID2 },
            { target_type: "waitlist", target_ref: null }, // bucket → dropped
            { target_type: "all_families", target_ref: null }, // → no filter
        ]);
        expect(out.grain).toBe("families");
        expect(out.filters).toEqual([
            { kind: "location", location_ids: [UUID] },
            { kind: "program", program_category_ids: [UUID2] },
        ]);
    });
});
