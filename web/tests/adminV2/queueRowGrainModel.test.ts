/**
 * Queue Row — unified grain + conditions model tests.
 */
import { describe, expect, it } from "vitest";
import {
    WAITLISTED_CONDITION,
    availableWaitlistFields,
    grainForSurfaceId,
    grainLabel,
    grainSupportsWaitlist,
    waitlistConditionalFields,
} from "@/lib/adminV2/settings/surfaces/queueRowGrainModel";

describe("grain identity", () => {
    it("labels both grains for operators", () => {
        expect(grainLabel("family")).toBe("Family / case");
        expect(grainLabel("child")).toBe("Child / candidate");
    });

    it("bridges surfaceId → grain during migration", () => {
        expect(grainForSurfaceId("pipeline-queue-row")).toBe("family");
        expect(grainForSurfaceId("waitlist-queue-row")).toBe("child");
    });

    it("only child grain surfaces waitlist/placement", () => {
        expect(grainSupportsWaitlist("child")).toBe(true);
        expect(grainSupportsWaitlist("family")).toBe(false);
    });
});

describe("waitlist as a CONDITION (not a separate surface)", () => {
    it("all waitlist fields are gated by placement_status = waitlisted", () => {
        for (const f of waitlistConditionalFields()) {
            expect(f.visibleWhen).toEqual(WAITLISTED_CONDITION);
        }
    });

    it("includes position, tier, wait since, desired schedule, desired program", () => {
        const keys = waitlistConditionalFields().map((f) => f.fieldKey);
        expect(keys).toContain("waitlist.positionLabel");
        expect(keys).toContain("waitlist.tierLabel");
        expect(keys).toContain("waitlist.waitSince");
        expect(keys).toContain("inquiry_child.schedule_type");
        expect(keys).toContain("inquiry_child.program");
    });
});

describe("no fake fields — placement override only when persisted", () => {
    it("placement override is NOT available when no persisted source exists", () => {
        const keys = availableWaitlistFields({ placementOverridePersisted: false }).map((f) => f.fieldKey);
        expect(keys).not.toContain("overrides.flags");
    });

    it("placement override IS available when a persisted source exists", () => {
        const keys = availableWaitlistFields({ placementOverridePersisted: true }).map((f) => f.fieldKey);
        expect(keys).toContain("overrides.flags");
    });

    it("real persisted fields (position/tier/wait) are always available for child grain", () => {
        const keys = availableWaitlistFields().map((f) => f.fieldKey);
        expect(keys).toContain("waitlist.positionLabel");
        expect(keys).toContain("waitlist.tierLabel");
        expect(keys).toContain("waitlist.waitSince");
    });
});
