import { describe, expect, it } from "vitest";
import {
    buildVersionTimeline,
    canVoidVersion,
    classifyVersionStatus,
    currentVersionId,
    planSupersede,
    type EffectiveDatedVersionRow,
} from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";

const TODAY = "2026-06-29";

function v(
    id: string,
    start: string,
    end: string | null,
    extra?: Partial<EffectiveDatedVersionRow>,
): EffectiveDatedVersionRow {
    return { id, effective_start: start, effective_end: end, ...extra };
}

describe("effectiveDatedVersioning — classifyVersionStatus", () => {
    // Lineage: v1 ended, v2 current/open, v3 scheduled.
    const v1 = v("v1", "2026-01-01", "2026-05-31");
    const v2 = v("v2", "2026-06-01", null);
    const v3 = v("v3", "2026-09-01", null);
    const lineage = [v1, v2, v3];

    it("marks the latest open effective row as current", () => {
        expect(classifyVersionStatus(v2, lineage, TODAY)).toBe("current");
        expect(currentVersionId(lineage, TODAY)).toBe("v2");
    });

    it("marks a future version as scheduled", () => {
        expect(classifyVersionStatus(v3, lineage, TODAY)).toBe("scheduled");
    });

    it("marks an ended row with a later sibling as superseded", () => {
        expect(classifyVersionStatus(v1, lineage, TODAY)).toBe("superseded");
    });

    it("marks an ended row with no successor as retired", () => {
        const solo = [v("only", "2025-01-01", "2025-12-31")];
        expect(classifyVersionStatus(solo[0], solo, TODAY)).toBe("retired");
    });

    it("marks a hard-disabled (is_active=false) row as retired", () => {
        const disabled = v("d", "2026-01-01", null, { is_active: false });
        expect(classifyVersionStatus(disabled, [disabled], TODAY)).toBe("retired");
        // ...and it is not the current winner even though dates would qualify.
        expect(currentVersionId([disabled], TODAY)).toBeNull();
    });

    it("treats boundary dates inclusively", () => {
        const boundary = v("b", TODAY, TODAY);
        expect(classifyVersionStatus(boundary, [boundary], TODAY)).toBe("current");
    });
});

describe("effectiveDatedVersioning — buildVersionTimeline", () => {
    it("orders current, then scheduled (soonest first), then ended (newest first)", () => {
        const rows = [
            v("old", "2025-01-01", "2025-12-31"),
            v("current", "2026-06-01", null),
            v("future_b", "2027-01-01", null),
            v("future_a", "2026-10-01", null),
        ];
        const timeline = buildVersionTimeline(rows, TODAY);
        expect(timeline.map((t) => t.row.id)).toEqual(["current", "future_a", "future_b", "old"]);
        expect(timeline[0].status).toBe("current");
        expect(timeline[0].isCurrent).toBe(true);
        expect(timeline[1].status).toBe("scheduled");
        // "old" ended in the past but has later versions, so it is superseded.
        expect(timeline[3].status).toBe("superseded");
        // newest authored version flagged isLatest
        expect(timeline.find((t) => t.row.id === "future_b")?.isLatest).toBe(true);
    });
});

describe("effectiveDatedVersioning — planSupersede", () => {
    it("computes the prior close date as the day before the new start", () => {
        const result = planSupersede({ priorStart: "2026-01-01", priorEnd: null, newStart: "2026-07-01" });
        expect(result).toEqual({ ok: true, closeDate: "2026-06-30" });
    });

    it("rejects a new start on or before the prior start", () => {
        const result = planSupersede({ priorStart: "2026-01-01", priorEnd: null, newStart: "2026-01-01" });
        expect(result.ok).toBe(false);
    });

    it("rejects a new start that overlaps a closed prior window", () => {
        const result = planSupersede({ priorStart: "2026-01-01", priorEnd: "2026-08-01", newStart: "2026-07-01" });
        expect(result.ok).toBe(false);
    });
});

describe("effectiveDatedVersioning — canVoidVersion", () => {
    const current = v("current", "2026-06-01", null);
    const scheduled = v("scheduled", "2026-09-01", null);
    const lineage = [current, scheduled];

    it("allows voiding a scheduled version with no later sibling", () => {
        expect(canVoidVersion(scheduled, lineage, TODAY)).toBe(true);
    });

    it("refuses to void an active (current) version", () => {
        expect(canVoidVersion(current, lineage, TODAY)).toBe(false);
    });

    it("refuses to void a scheduled version that has a later version", () => {
        const later = v("later", "2027-01-01", null);
        expect(canVoidVersion(scheduled, [...lineage, later], TODAY)).toBe(false);
    });
});
