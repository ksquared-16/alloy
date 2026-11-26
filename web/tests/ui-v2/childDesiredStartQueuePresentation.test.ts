import { describe, expect, it } from "vitest";

import {
    childDesiredStartSummaryFromOcmRows,
    summarizeChildStartDates,
} from "@/lib/ui-v2/childDesiredStartQueuePresentation";
import {
    buildCrmCompactWorkUnitFactGroups,
    buildCrmQueueRowPreviewPresentation,
} from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import type { QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";

const wantTiming = (f: QueueUiRowPreviewField) => f === "start_date" || f === "tour_date";

describe("childDesiredStartQueuePresentation", () => {
    it("summarizes unique child dates", () => {
        expect(summarizeChildStartDates(["2026-09-01", "2026-10-01"])).toBe("2 dates");
        expect(summarizeChildStartDates(["2026-09-01", "2026-09-01"])).toBe("2026-09-01");
    });

    it("builds summary from OCM rows", () => {
        expect(
            childDesiredStartSummaryFromOcmRows([
                { start_date: "2026-08-15" },
                { start_date: null },
            ])
        ).toBe("2026-08-15");
    });
});

describe("crm queue timing — child desired start", () => {
    it("does not show opportunity-level _start_date when no child summary", () => {
        const p = buildCrmQueueRowPreviewPresentation(
            { _start_date: "2026-07-01", _tour_queue_display: "Tour tomorrow" },
            wantTiming,
            null
        );
        expect(p.startDateDisplay).toBeNull();
        expect(p.tourContext).toBeTruthy();
    });

    it("shows child summary from _child_desired_start_summary", () => {
        const p = buildCrmQueueRowPreviewPresentation(
            {
                _start_date: "2026-07-01",
                _child_desired_start_summary: "2026-09-01",
                _tour_queue_display: "Tour tomorrow",
            },
            wantTiming,
            null
        );
        expect(p.startDateDisplay).toContain("2026");
        const groups = buildCrmCompactWorkUnitFactGroups({
            row: { _child_desired_start_summary: "2 dates", _tour_queue_display: "Tour" },
            want: wantTiming,
            childrenLines: null,
            childNameSingle: null,
            programSingle: null,
        });
        const timing = groups.find((g) => g.kind === "timing");
        expect(timing?.columnGrid?.rows?.[0]?.[0]).toBe("Starts: 2 dates");
    });
});
