import { describe, expect, it } from "vitest";
import {
    queueRecordStatusPillToneClass,
    resolveQueueRecordStatusPillTone,
    resolveQueueRecordStatusPillToneFromKey,
} from "@/lib/layout/runtime/resolveQueueRecordStatusPillTone";

describe("resolveQueueRecordStatusPillTone", () => {
    it("maps contact_attempted to info tone", () => {
        expect(resolveQueueRecordStatusPillToneFromKey("contact_attempted")).toBe("info");
        expect(queueRecordStatusPillToneClass("info")).toBe("queue-record-field--status-tone-info");
    });

    it("maps enrolled to success and lost to error", () => {
        expect(resolveQueueRecordStatusPillToneFromKey("enrolled")).toBe("success");
        expect(resolveQueueRecordStatusPillToneFromKey("ready")).toBe("success");
        expect(resolveQueueRecordStatusPillToneFromKey("lost")).toBe("error");
        expect(resolveQueueRecordStatusPillToneFromKey("incomplete")).toBe("error");
        expect(resolveQueueRecordStatusPillToneFromKey("missing")).toBe("error");
        expect(resolveQueueRecordStatusPillToneFromKey("waitlisted")).toBe("warning");
        expect(resolveQueueRecordStatusPillToneFromKey("tour_needed")).toBe("warning");
    });

    it("prefers status definition metadata tone when present on record", () => {
        const tone = resolveQueueRecordStatusPillTone({
            status_key: "contact_attempted",
            _status_definition: {
                metadata: { pill_tone: "warning" },
            },
        });
        expect(tone).toBe("warning");
    });

    it("uses lifecycle_stage from status definition metadata", () => {
        const tone = resolveQueueRecordStatusPillTone({
            status_key: "custom_stage",
            _status_definition: {
                metadata: { lifecycle_stage: "success" },
            },
        });
        expect(tone).toBe("success");
    });
});
