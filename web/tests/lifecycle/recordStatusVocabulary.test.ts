/**
 * The transition status vocabulary — who owns it.
 *
 * The Stage editor was validating a transition's `status_key` against the queue-membership
 * picker, which excludes `alloy_layer === "case_status"` rows by design. Since `open` and
 * `closed` ARE case-layer rows, no valid transition status could survive validation. These tests
 * pin the separation so the two vocabularies cannot be conflated again.
 */

import { describe, expect, it } from "vitest";

import { selectRecordStatusRows } from "@/lib/lifecycle/loadRecordStatusVocabulary";
import { resolveOutcomeStatusOptions } from "@/lib/lifecycle/resolveOutcomeStatusOptions";

const CATALOG = [
    { status_key: "open", status_label: "Open", is_active: true, metadata: { alloy_layer: "case_status" } },
    {
        status_key: "closed",
        status_label: "Closed",
        is_active: true,
        metadata: { alloy_layer: "case_status", terminal: true },
    },
    { status_key: "quote_started", status_label: "Quote", is_active: false, metadata: { alloy_layer: "case_status" } },
    // A disposition — belongs in the queue picker, never on a transition.
    { status_key: "tour_scheduled", status_label: "Tour Scheduled", is_active: true, metadata: { alloy_layer: "disposition" } },
];

describe("record status vocabulary", () => {
    const rows = selectRecordStatusRows(CATALOG, "opportunities");

    it("keeps the case layer and only the case layer", () => {
        expect(rows.map((r) => r.status_key).sort()).toEqual(["closed", "open"]);
    });

    it("drops inactive rows", () => {
        expect(rows.map((r) => r.status_key)).not.toContain("quote_started");
    });

    it("carries metadata through, because closure lives there", () => {
        // Dropping metadata was the second half of the defect: even a delivered `closed` row
        // could not be recognized as closing anything.
        const closed = rows.find((r) => r.status_key === "closed")!;
        expect(closed.metadata).toMatchObject({ terminal: true });
    });
});

describe("what the editor can now resolve", () => {
    const configuredStatuses = selectRecordStatusRows(CATALOG, "opportunities");

    it("accepts the canonical seed statuses that used to be rejected", () => {
        for (const key of ["open", "closed"]) {
            const resolved = resolveOutcomeStatusOptions({
                configuredStatuses,
                purpose: "status_effect",
                entityType: "opportunity",
                selectedStatusKey: key,
            });
            expect(resolved.selectedValid, `${key} must resolve`).toBe(true);
        }
    });

    it("offers a closed status for close semantics", () => {
        const resolved = resolveOutcomeStatusOptions({
            configuredStatuses,
            purpose: "close_record",
            entityType: "opportunity",
            selectedStatusKey: "closed",
        });
        expect(resolved.available).toBe(true);
        expect(resolved.selectedValid).toBe(true);
    });

    it("still refuses a disposition as a record status", () => {
        const resolved = resolveOutcomeStatusOptions({
            configuredStatuses,
            purpose: "status_effect",
            entityType: "opportunity",
            selectedStatusKey: "tour_scheduled",
        });
        expect(resolved.selectedValid).toBe(false);
    });
});
