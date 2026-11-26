import { describe, expect, it } from "vitest";
import { buildTourAvailabilityRulePatch } from "@/lib/tours/admin/tourAvailabilityRuleMutation";

describe("buildTourAvailabilityRulePatch", () => {
    it("preserves every editable tour-window field", () => {
        expect(
            buildTourAvailabilityRulePatch({
                day_of_week: 0,
                start_time: "08:00:00",
                end_time: "10:30:00",
                timezone: "America/Los_Angeles",
                slot_duration_minutes: 45,
                buffer_minutes: 0,
                max_bookings_per_slot: 2,
                approval_required: false,
                is_active: false,
            }),
        ).toEqual({
            ok: true,
            patch: {
                day_of_week: 0,
                start_time: "08:00:00",
                end_time: "10:30:00",
                timezone: "America/Los_Angeles",
                slot_duration_minutes: 45,
                buffer_minutes: 0,
                max_bookings_per_slot: 2,
                approval_required: false,
                is_active: false,
            },
        });
    });

    it.each([
        [{ day_of_week: 7 }, "day_of_week"],
        [{ slot_duration_minutes: 0 }, "slot_duration_minutes"],
        [{ buffer_minutes: -1 }, "buffer_minutes"],
        [{ max_bookings_per_slot: 0 }, "max_bookings_per_slot"],
        [{ approval_required: "yes" }, "approval_required"],
        [{ timezone: "" }, "timezone"],
        [{ org_id: "other-org" }, "Unsupported field"],
    ])("rejects invalid or privileged fields", (input, message) => {
        const result = buildTourAvailabilityRulePatch(input);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain(message);
    });
});
