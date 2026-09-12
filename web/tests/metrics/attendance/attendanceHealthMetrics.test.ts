/**
 * Thread 9, Phases E and F — three health questions that must stay apart.
 *
 * Scenario H is the one that matters most: an unmapped provider event must move
 * INTEGRATION health and leave every Attendance count alone. The structural
 * proof is stronger than any assertion about numbers — no Attendance resolver
 * reads the integration inbox at all — so that is what the last block checks.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    computeCorrectionRate,
    UNUSABLE_DISPOSITIONS,
} from "@/lib/metrics/resolvers/attendanceHealthMetrics";
import { getMetricDefinition } from "@/lib/metrics/registry";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("truth quality — correction rate", () => {
    it("is null when nothing was recorded, not zero", () => {
        // "0% corrected" claims we recorded facts and got them all right.
        expect(computeCorrectionRate([])).toBeNull();
    });

    it("counts corrections and reversals against all authored facts", () => {
        const rows = [
            { entry_type: "original" },
            { entry_type: "original" },
            { entry_type: "correction" },
            { entry_type: "reversal" },
        ];
        expect(computeCorrectionRate(rows)).toBe(0.5);
    });

    it("is zero when every fact stood", () => {
        expect(computeCorrectionRate([{ entry_type: "original" }, { entry_type: "original" }])).toBe(0);
    });
});

describe("H — provider evidence is not Attendance", () => {
    it("treats every unusable disposition as an integration problem", () => {
        expect([...UNUSABLE_DISPOSITIONS]).toEqual([
            "unmapped",
            "unattributed",
            "conflicted",
            "rejected",
        ]);
        // `applied` and `duplicate` are absent deliberately: an applied event
        // became Attendance truth, and a duplicate is a replay of one that did.
        expect([...UNUSABLE_DISPOSITIONS]).not.toContain("applied");
        expect([...UNUSABLE_DISPOSITIONS]).not.toContain("duplicate");
    });

    it("no Attendance count metric reads the integration inbox", () => {
        /*
         * The structural guarantee. A child-count resolver that never touches
         * `attendance_integration_events` cannot be moved by what a provider
         * sent, whatever the disposition — which is the invariant the brief
         * states and the one an assertion about numbers could not prove.
         */
        for (const rel of [
            "lib/metrics/resolvers/attendanceServiceDayMetrics.ts",
            "lib/metrics/resolvers/attendanceOccupancyMetrics.ts",
        ]) {
            expect(read(rel), `${rel} must not read the provider inbox`).not.toContain(
                "attendance_integration_events",
            );
        }
    });

    it("and the integration metric is declared org-wide, because the inbox has no site", () => {
        expect(getMetricDefinition("attendance.unmapped_event_count").orgScopeOnly).toBe(true);
    });
});

describe("I — consequence health counts state, never money", () => {
    it("reads no monetary column anywhere in the resolver CODE", () => {
        /*
         * Comments are stripped first. The prose says "never an amount", and a
         * naive substring check would fail on the very sentence promising the
         * guarantee — the claim is about what the code READS, not what it says.
         */
        const src = read("lib/metrics/resolvers/attendanceHealthMetrics.ts")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
        for (const word of ["amount", "cents", "total_due", "price", "rate_plan", "currency"]) {
            expect(src.toLowerCase(), `consequence health must not read ${word}`).not.toContain(word);
        }
    });

    it("is a count, not a currency metric", () => {
        const def = getMetricDefinition("attendance.consequence_review_count");
        expect(def.format).toBe("count");
        expect(def.sources).toContain("consumption_events");
    });

    it("is live-only — an unresolved consequence is a current state", () => {
        expect(getMetricDefinition("attendance.consequence_review_count").snapshotPolicy).toBe(
            "live_only",
        );
    });
});

describe("the three questions are not one number", () => {
    it("keeps truth quality, integration health and consequence health as separate metrics", () => {
        const keys = [
            "attendance.correction_rate",
            "attendance.unmapped_event_count",
            "attendance.consequence_review_count",
        ] as const;
        const sources = keys.map((k) => getMetricDefinition(k).sources.join(","));
        // Different sources, different owners, different remedies. One combined
        // "Attendance errors" number would send an operator to fix the wrong
        // thing.
        expect(new Set(sources).size).toBe(3);
    });

    it("classifies the historical one as windowed and the current one as live", () => {
        expect(getMetricDefinition("attendance.correction_rate").snapshotPolicy).toBeUndefined();
        expect(getMetricDefinition("attendance.consequence_review_count").snapshotPolicy).toBe(
            "live_only",
        );
    });
});
