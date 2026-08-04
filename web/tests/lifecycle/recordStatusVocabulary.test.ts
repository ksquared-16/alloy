/**
 * The transition status vocabulary — who owns it.
 *
 * The Stage editor was validating a transition's `status_key` against the queue-membership
 * picker, which excludes `alloy_layer === "case_status"` rows by design. Since `open` and
 * `closed` ARE case-container rows, no valid transition status could survive validation. These
 * tests pin the separation so the two vocabularies cannot be conflated again.
 *
 * They also pin the SECOND way this broke. The original fix filtered on the literal
 * `alloy_layer === "case_status"`, and the S4 status collapse
 * (`20260711000100_enrollment_status_collapse_and_stage_key.sql`) subsequently overwrote that
 * layer to `enrollment_process` on `opportunities.open` / `opportunities.closed`. The old
 * fixtures below still described the pre-collapse shape, so the suite stayed green while the
 * product regressed: the editor was handed only `inactive` / `archived` and reported "no closed
 * lead status values are configured" about a `closed` status that was present and correct.
 *
 * Every fixture here is therefore labelled with the migration generation that produces it, and
 * both generations are asserted. A fixture that no migration writes is not evidence.
 */

import { describe, expect, it } from "vitest";

import { selectRecordStatusRows } from "@/lib/lifecycle/loadRecordStatusVocabulary";
import { resolveOutcomeStatusOptions } from "@/lib/lifecycle/resolveOutcomeStatusOptions";

/**
 * Pre-collapse generation — `alloy_layer: "case_status"`, written by
 * `20260612120000_enrollment_process_status_vocabulary_repair` and earlier.
 */
const HISTORICAL_CATALOG = [
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

/**
 * Current authoritative generation — verbatim metadata shape read back from the Firefly tenant
 * after `20260711000100_enrollment_status_collapse_and_stage_key` ran. Note `alloy_layer` is
 * `enrollment_process` on the very rows this loader exists to return.
 */
const COLLAPSED_CATALOG = [
    {
        status_key: "open",
        status_label: "Open",
        is_active: true,
        metadata: {
            alloy_layer: "enrollment_process",
            process_key: "enrollment_process",
            seed_source: "enrollment_alignment_status_collapse_v1",
            lifecycle_stage: "case",
            status_settings_category: "lead_statuses",
            excluded_from_enrollment_stage_picker: true,
        },
    },
    {
        status_key: "closed",
        status_label: "Closed",
        is_active: true,
        metadata: {
            alloy_layer: "enrollment_process",
            process_key: "enrollment_process",
            seed_source: "enrollment_alignment_status_collapse_v1",
            lifecycle_stage: "case",
            status_settings_category: "lead_statuses",
            excluded_from_enrollment_stage_picker: true,
        },
    },
    {
        status_key: "inactive",
        status_label: "Inactive",
        is_active: true,
        metadata: {
            alloy_layer: "case_status",
            seed_source: "migration_20260612120000_enrollment_process_status_vocabulary_repair",
            lifecycle_stage: "case",
            status_settings_category: "lead_statuses",
            excluded_from_enrollment_stage_picker: true,
        },
    },
    {
        status_key: "archived",
        status_label: "Archived",
        is_active: true,
        metadata: {
            alloy_layer: "case_status",
            seed_source: "migration_20260612120000_enrollment_process_status_vocabulary_repair",
            lifecycle_stage: "case",
            status_settings_category: "lead_statuses",
            excluded_from_enrollment_stage_picker: true,
        },
    },
];

describe("record status vocabulary — historical case_status seed", () => {
    const rows = selectRecordStatusRows(HISTORICAL_CATALOG, "opportunities");

    it("keeps the case container and only the case container", () => {
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

describe("record status vocabulary — current collapsed seed", () => {
    const rows = selectRecordStatusRows(COLLAPSED_CATALOG, "opportunities");

    it("returns `closed` even though the collapse relabelled its layer", () => {
        // The regression in one line: this was [] for `closed` when the filter read the literal
        // `alloy_layer === "case_status"`.
        expect(rows.map((r) => r.status_key)).toContain("closed");
    });

    it("returns the whole canonical case container vocabulary", () => {
        expect(rows.map((r) => r.status_key).sort()).toEqual([
            "archived",
            "closed",
            "inactive",
            "open",
        ]);
    });
});

describe("what the editor can now resolve", () => {
    for (const [generation, catalog] of [
        ["historical case_status", HISTORICAL_CATALOG],
        ["current enrollment_process", COLLAPSED_CATALOG],
    ] as const) {
        describe(generation, () => {
            const configuredStatuses = selectRecordStatusRows(catalog, "opportunities");

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
        });
    }

    it("still refuses a disposition as a record status", () => {
        const resolved = resolveOutcomeStatusOptions({
            configuredStatuses: selectRecordStatusRows(HISTORICAL_CATALOG, "opportunities"),
            purpose: "status_effect",
            entityType: "opportunity",
            selectedStatusKey: "tour_scheduled",
        });
        expect(resolved.selectedValid).toBe(false);
    });
});

describe("the warning this defect produced", () => {
    // `outcome_close_status_missing` fires exactly when `available` is false for close_record.
    // This is the assertion that would have caught the regression from the operator's side.
    it("no longer reports a missing closed lead status against the real Firefly catalog", () => {
        const resolved = resolveOutcomeStatusOptions({
            configuredStatuses: selectRecordStatusRows(COLLAPSED_CATALOG, "opportunities"),
            purpose: "close_record",
            entityType: "opportunities",
            selectedStatusKey: null,
        });
        expect(resolved.available).toBe(true);
        expect(resolved.unavailableReason).toBeNull();
        expect(resolved.options.map((o) => o.status_key)).toEqual(["closed"]);
    });

    it("reported it before the fix, when only the case_status layer was admitted", () => {
        // Reproduces the old predicate against the current seed — the exact broken state.
        const oldPredicateRows = COLLAPSED_CATALOG.filter(
            (r) => (r.metadata as Record<string, unknown>).alloy_layer === "case_status",
        ).map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            entity_type: "opportunities",
            is_active: true,
            metadata: r.metadata as Record<string, unknown>,
        }));
        const resolved = resolveOutcomeStatusOptions({
            configuredStatuses: oldPredicateRows,
            purpose: "close_record",
            entityType: "opportunities",
            selectedStatusKey: null,
        });
        expect(resolved.available).toBe(false);
    });
});

describe("child enrollment status is untouched", () => {
    // `opportunity_customer_members.outcome_status_key` is owned elsewhere. Widening the
    // opportunity grain must not start resolving rows on the child grain that never resolved.
    const CHILD_CATALOG = [
        {
            status_key: "enrolled",
            status_label: "Enrolled",
            is_active: true,
            metadata: {
                alloy_layer: "enrollment_disposition",
                status_settings_category: "enrollment_statuses",
                seed_source: "enrollment_alignment_status_collapse_v1",
            },
        },
        {
            status_key: "withdrawn",
            status_label: "Withdrawn",
            is_active: true,
            metadata: {
                alloy_layer: "enrollment_disposition",
                status_settings_category: "enrollment_statuses",
                terminal: true,
            },
        },
    ];

    it("returns nothing for the child grain, exactly as before", () => {
        expect(selectRecordStatusRows(CHILD_CATALOG, "opportunity_customer_members")).toEqual([]);
    });

    it("does not leak child disposition rows into the opportunity grain", () => {
        const rows = selectRecordStatusRows(
            [...COLLAPSED_CATALOG, ...CHILD_CATALOG],
            "opportunities",
        );
        expect(rows.map((r) => r.status_key)).not.toContain("enrolled");
        expect(rows.map((r) => r.status_key)).not.toContain("withdrawn");
    });
});
