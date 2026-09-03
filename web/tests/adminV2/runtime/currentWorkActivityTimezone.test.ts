/**
 * Local-time doctrine — What's Next activity timestamps.
 *
 * Every operator-facing timestamp in the activity path must render in the resolved operator
 * timezone via the canonical `formatActivityTimestamp`, never raw UTC. Proves: UTC→local shift,
 * DST correctness, date-boundary conversion, and that the shared activity path threads the tz.
 */

import { describe, expect, it } from "vitest";

import { formatActivityTimestamp } from "@/lib/presentation/presentationDateFormat";
import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import { buildCurrentWorkActivityPreviewItems } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

describe("canonical formatActivityTimestamp — timezone doctrine", () => {
    const now = Date.parse("2026-07-22T12:00:00.000Z");

    it("renders a UTC instant in the configured local timezone (UTC→local shift + date boundary)", () => {
        // 02:30Z on Jun 15 is 10:30 PM on Jun 14 in America/New_York (EDT, UTC-4) — day rolls back.
        // (Same-year dates omit the year in this formatter.)
        expect(formatActivityTimestamp("2026-06-15T02:30:00.000Z", { timeZone: "America/New_York", nowMs: now })).toBe(
            "Jun 14 • 10:30 PM",
        );
        // Same instant with no timezone falls back to UTC — the pre-fix behavior we must not ship.
        expect(formatActivityTimestamp("2026-06-15T02:30:00.000Z", { nowMs: now })).toBe("Jun 15 • 2:30 AM");
    });

    it("applies daylight-saving correctly (EDT vs EST offsets differ)", () => {
        // Summer (EDT, UTC-4): 02:30Z → 10:30 PM prior day.
        expect(formatActivityTimestamp("2026-06-15T02:30:00.000Z", { timeZone: "America/New_York", nowMs: now })).toBe(
            "Jun 14 • 10:30 PM",
        );
        // Winter (EST, UTC-5): 02:30Z → 9:30 PM prior day.
        expect(formatActivityTimestamp("2026-01-15T02:30:00.000Z", { timeZone: "America/New_York", nowMs: now })).toBe(
            "Jan 14 • 9:30 PM",
        );
    });
});

describe("activity path threads the operator timezone", () => {
    const record = {
        recent_communication: [{ channel: "email", body: "Confirming your tour.", at: "2026-06-15T02:30:00.000Z" }],
    } as unknown as ProofRuntimeRecord;

    it("resolveLeadActivityPreview formats `at` in the passed timezone (not UTC)", () => {
        const nyc = resolveLeadActivityPreview(record, "America/New_York").find((e) => e.kind === "communication");
        const utc = resolveLeadActivityPreview(record, "UTC").find((e) => e.kind === "communication");
        expect(nyc?.at).toBeTruthy();
        expect(nyc?.at).not.toBe(utc?.at);
        expect(nyc?.at).toContain("Jun 14"); // EDT rolls to previous day
        expect(utc?.at).toContain("Jun 15");
        // Never expose raw UTC/ISO markers to the operator.
        expect(nyc?.at).not.toMatch(/Z|GMT|UTC|T\d\d:/);
    });

    it("buildCurrentWorkActivityPreviewItems threads the timezone into the tour fallback", () => {
        const context = {
            signals: {
                tour: { scheduled: true, startAt: "2026-06-15T02:30:00.000Z", statusLabel: "Scheduled", statusKey: null, bookingId: null },
            },
            truth: {},
        } as unknown as OperationalContext;
        const items = buildCurrentWorkActivityPreviewItems({ context, timeZone: "America/New_York" });
        expect(items).toHaveLength(1);
        expect(items[0]?.occurredAt).toContain("Jun 14"); // local, not the raw UTC Jun 15
        expect(items[0]?.occurredAt).not.toMatch(/Z|T\d\d:/);
    });
});
