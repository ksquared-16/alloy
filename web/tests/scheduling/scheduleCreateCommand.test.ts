import { describe, expect, it } from "vitest";
import {
    SCHEDULE_CREATE_ACTION_KEY,
    buildScheduleCreateEligibility,
    buildScheduleCreatePreview,
    validateScheduleCreatePayload,
} from "@/lib/scheduling/commands/scheduleCreateInputs";
import {
    getRegisteredAction,
    hasRegisteredHandler,
    isKnownActionKey,
} from "@/lib/adminV2/actions/actionRegistry";

const VALID = {
    enrollment_agreement_id: "agr-1",
    schedule_pattern_id: "pat-1",
    start_date: "2026-07-28",
    room_label: "Sunshine",
    pattern_label: "Mon–Fri",
    child_name: "Ethan Rivera",
};

describe("validateScheduleCreatePayload", () => {
    it("trims and accepts a valid payload", () => {
        const res = validateScheduleCreatePayload({ ...VALID, room_label: "  Sunshine  " });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.value.room_label).toBe("Sunshine");
    });

    it("rejects an invalid start date", () => {
        const res = validateScheduleCreatePayload({ ...VALID, start_date: "2026-13-40" });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.blockers[0].field).toBe("start_date");
    });
});

describe("buildScheduleCreateEligibility", () => {
    it("is eligible with all required fields", () => {
        const e = buildScheduleCreateEligibility(VALID);
        expect(e.eligible).toBe(true);
        expect(e.blockers).toHaveLength(0);
    });

    it("blocks when the pattern or start date is missing", () => {
        const e = buildScheduleCreateEligibility({ enrollment_agreement_id: "agr-1" });
        expect(e.eligible).toBe(false);
        const fields = e.blockers.map((b) => b.field);
        expect(fields).toContain("schedule_pattern_id");
        expect(fields).toContain("start_date");
    });
});

describe("buildScheduleCreatePreview", () => {
    it("renders a plain operator sentence with the known labels", () => {
        const p = buildScheduleCreatePreview(VALID);
        expect(p.summary).toBe("Place Ethan Rivera in Sunshine, Mon–Fri, from 2026-07-28.");
        expect(p.changes).toContain("Placement → Sunshine");
        expect(p.changes).toContain("Schedule → Mon–Fri");
    });

    it("degrades gracefully when labels are absent", () => {
        const p = buildScheduleCreatePreview({ start_date: "2026-07-28" });
        expect(p.summary).toBe("Place this child, from 2026-07-28.");
    });
});

describe("action registration", () => {
    it("registers schedule.create as an executable, known action", () => {
        expect(SCHEDULE_CREATE_ACTION_KEY).toBe("schedule.create");
        expect(hasRegisteredHandler("schedule.create")).toBe(true);
        expect(isKnownActionKey("schedule.create")).toBe(true);
        const action = getRegisteredAction("schedule.create");
        expect(action).not.toBeNull();
        expect(action!.supportedEntityTypes).toContain("child");
        expect(action!.audit.mutates).toBe(true);
    });
});
