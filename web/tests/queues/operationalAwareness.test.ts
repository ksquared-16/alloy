import { describe, expect, it } from "vitest";
import {
    formatCompactRelativeDuration,
    formatCompactRelativeDurationIso,
    formatOperationalAgeAccessibleLabel,
} from "@/lib/format/formatCompactRelativeDuration";
import {
    buildStageMembershipOccurrenceKey,
    resolveOperationalStateEnteredAt,
} from "@/lib/lifecycle/operationalStateEnteredAt";
import { personalSeenFromOccurrence } from "@/lib/queues/operatorStageMembershipAck";

const NOW = Date.parse("2026-07-30T18:00:00.000Z");

describe("formatCompactRelativeDuration", () => {
    it("formats minutes, hours, days, weeks, and months without ambiguous m", () => {
        expect(formatCompactRelativeDuration(NOW - 30_000, NOW)?.compact).toBe("<1m");
        expect(formatCompactRelativeDuration(NOW - 12 * 60_000, NOW)?.compact).toBe("12m");
        expect(formatCompactRelativeDuration(NOW - 3 * 3_600_000, NOW)?.compact).toBe("3h");
        expect(formatCompactRelativeDuration(NOW - 2 * 86_400_000, NOW)?.compact).toBe("2d");
        expect(formatCompactRelativeDuration(NOW - 4 * 7 * 86_400_000, NOW)?.compact).toBe("4w");
        expect(formatCompactRelativeDuration(NOW - 100 * 86_400_000, NOW)?.compact).toBe("3mo");
    });

    it("uses mo for months, never bare m", () => {
        const label = formatCompactRelativeDuration(NOW - 40 * 86_400_000, NOW)?.compact ?? "";
        expect(label.endsWith("mo")).toBe(true);
        expect(label).not.toMatch(/^\d+m$/);
    });

    it("builds accessible stage age labels", () => {
        const iso = new Date(NOW - 2 * 86_400_000).toISOString();
        expect(formatOperationalAgeAccessibleLabel(iso, NOW)).toBe("In this stage for 2 days");
        expect(formatCompactRelativeDurationIso(iso, NOW)?.compact).toBe("2d");
    });
});

describe("resolveOperationalStateEnteredAt", () => {
    const base = {
        orgId: "org-1",
        grain: "case" as const,
        subjectType: "case",
        subjectId: "opp-1",
        currentStageKey: "lead",
    };

    it("prefers persisted stage_entered_at", () => {
        const entered = "2026-07-28T12:00:00.000Z";
        const result = resolveOperationalStateEnteredAt({
            ...base,
            persistedStageEnteredAt: entered,
            intakeCreatedAt: "2026-07-01T00:00:00.000Z",
            neverTransitioned: true,
        });
        expect(result.source).toBe("persisted_stage_entered_at");
        expect(result.enteredAtIso).toBe(new Date(entered).toISOString());
    });

    it("falls back to intake created_at only when never transitioned", () => {
        const created = "2026-07-20T08:00:00.000Z";
        const ok = resolveOperationalStateEnteredAt({
            ...base,
            intakeCreatedAt: created,
            neverTransitioned: true,
        });
        expect(ok.source).toBe("intake_created_at");
        expect(ok.enteredAtIso).toBe(new Date(created).toISOString());

        const unknown = resolveOperationalStateEnteredAt({
            ...base,
            intakeCreatedAt: created,
            neverTransitioned: false,
        });
        expect(unknown.source).toBe("unknown");
        expect(unknown.enteredAtIso).toBeNull();
    });

    it("never invents age from missing evidence", () => {
        const result = resolveOperationalStateEnteredAt({
            ...base,
            currentStageKey: "tour",
        });
        expect(result.source).toBe("unknown");
        expect(result.enteredAtIso).toBeNull();
    });

    it("builds stable occurrence keys including entered_at", () => {
        const a = buildStageMembershipOccurrenceKey({
            orgId: "org",
            userId: "user",
            subjectType: "case",
            subjectId: "opp",
            stageKey: "tour",
            stageEnteredAtIso: "2026-07-30T10:00:00.000Z",
        });
        const b = buildStageMembershipOccurrenceKey({
            orgId: "org",
            userId: "user",
            subjectType: "case",
            subjectId: "opp",
            stageKey: "tour",
            stageEnteredAtIso: "2026-07-30T11:00:00.000Z",
        });
        expect(a).not.toBe(b);
        expect(a).toContain("tour");
    });
});

describe("personalSeenFromOccurrence", () => {
    it("treats missing occurrence as not unseen", () => {
        expect(personalSeenFromOccurrence({ occurrenceKey: null, acknowledgedKeys: new Set() }).unseen).toBe(
            false,
        );
    });

    it("marks unseen until acknowledged, and local seen wins over stale hydrate", () => {
        const key = "org:user:case:opp:lead:2026-07-30T00:00:00.000Z";
        expect(
            personalSeenFromOccurrence({ occurrenceKey: key, acknowledgedKeys: new Set() }).unseen,
        ).toBe(true);
        expect(
            personalSeenFromOccurrence({
                occurrenceKey: key,
                acknowledgedKeys: new Set([key]),
            }).unseen,
        ).toBe(false);
        expect(
            personalSeenFromOccurrence({
                occurrenceKey: key,
                acknowledgedKeys: new Set(),
                locallySeenKeys: new Set([key]),
            }).unseen,
        ).toBe(false);
    });
});
