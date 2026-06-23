import { describe, expect, it } from "vitest";
import { validateAnnouncementTargets } from "@/lib/communications/v2/announcementService";

/** Comms V2 Phase 1 / B5 — announcement target CONFIG validation (no recipients/send). */

const UUID = "11111111-1111-4111-8111-111111111111";

describe("validateAnnouncementTargets — custom audience spec (B8A)", () => {
    it("accepts a custom target carrying a valid rule.audience_spec", () => {
        const r = validateAnnouncementTargets([
            {
                target_type: "custom",
                rule: {
                    audience_spec: {
                        grain: "children",
                        filters: [{ kind: "child_enrollment_status", status_keys: ["enrolled"] }],
                    },
                },
            },
        ]);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value[0].target_type).toBe("custom");
            expect(r.value[0].target_ref).toBeNull();
            expect((r.value[0].rule as { audience_spec: { grain: string } }).audience_spec.grain).toBe("children");
        }
    });
    it("rejects a custom target with an invalid spec", () => {
        expect(validateAnnouncementTargets([{ target_type: "custom", rule: { audience_spec: { grain: "people" } } }]).ok).toBe(false);
        expect(validateAnnouncementTargets([{ target_type: "custom", rule: {} }]).ok).toBe(false);
    });
    it("rejects a custom target carrying a target_ref", () => {
        expect(
            validateAnnouncementTargets([{ target_type: "custom", target_ref: UUID, rule: { audience_spec: { grain: "families", filters: [] } } }]).ok
        ).toBe(false);
    });
});

describe("validateAnnouncementTargets", () => {
    it("defaults missing/null to empty", () => {
        expect(validateAnnouncementTargets(undefined)).toEqual({ ok: true, value: [] });
        expect(validateAnnouncementTargets(null)).toEqual({ ok: true, value: [] });
    });

    it("rejects a non-array", () => {
        expect(validateAnnouncementTargets("all_families").ok).toBe(false);
    });

    it("accepts set-level status groups with no ref", () => {
        const r = validateAnnouncementTargets([{ target_type: "active_families" }, { target_type: "waitlist" }]);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value).toEqual([
                { target_type: "active_families", target_ref: null, rule: {} },
                { target_type: "waitlist", target_ref: null, rule: {} },
            ]);
        }
    });

    it("rejects an invalid target_type", () => {
        expect(validateAnnouncementTargets([{ target_type: "leads" }]).ok).toBe(false);
    });

    it("requires a uuid ref for scoped types (location/program/room)", () => {
        expect(validateAnnouncementTargets([{ target_type: "location" }]).ok).toBe(false);
        expect(validateAnnouncementTargets([{ target_type: "location", target_ref: "x" }]).ok).toBe(false);
        const r = validateAnnouncementTargets([{ target_type: "location", target_ref: UUID, rule: { label: "North" } }]);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value[0]).toEqual({ target_type: "location", target_ref: UUID, rule: { label: "North" } });
    });

    it("rejects a ref on a set-level type", () => {
        expect(validateAnnouncementTargets([{ target_type: "all_families", target_ref: UUID }]).ok).toBe(false);
    });

    it("de-dupes by type+ref", () => {
        const r = validateAnnouncementTargets([
            { target_type: "location", target_ref: UUID },
            { target_type: "location", target_ref: UUID },
            { target_type: "all_families" },
        ]);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toHaveLength(2);
    });
});
