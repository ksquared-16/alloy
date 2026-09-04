/**
 * A manual waitlist position is a POSITION within the candidate's own cohort.
 *
 * Positive control: every ordering case here fails on the pre-fix engine, which spliced
 * `pin_ordinal` into `sort_tuple` and therefore compared an ordinal against `bucket.priority_order`
 * — collapsing 2, 5 and 12 to the same answer. Measured on deployed staging before the fix:
 * pinned `["infant — 0–18 months", 2, 50, …]` vs unpinned `["infant — 0–18 months", 50, …]`.
 */
import { describe, expect, it } from "vitest";
import {
    applyCohortLocalManualPositions,
    readRowManualPinOrdinal,
} from "@/lib/orchestration/placement/applyCohortLocalManualPositions";
import { applyPlacementCandidateOverrides } from "@/lib/orchestration/placement/applyPlacementCandidateOverrides";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 as PROFILE } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import type { PlacementEvaluateOk } from "@/lib/orchestration/placement/placementPriorityTypes";

/** A candidate queue row shaped the way the canonical projection shapes it. */
function row(name: string, cohort: string, pinOrdinal?: number) {
    return {
        id: `row-${name}`,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            placement_candidate_id: `pc-${name}`,
            child_display_name: name,
            program_room_cohort_key: cohort,
            program_room_group_label: cohort,
            placement_priority_v2: {
                placement_candidate_id: `pc-${name}`,
                program_room_cohort_key: cohort,
                active_override_kinds: pinOrdinal == null ? [] : ["pin"],
                ...(pinOrdinal == null ? {} : { manual_pin_ordinal: pinOrdinal }),
            },
        },
    } as Record<string, unknown>;
}
const names = (rows: Array<Record<string, unknown>>) =>
    rows.map((r) => String((r._placement_waitlist_row as { child_display_name: string }).child_display_name));

const INFANT = "infant_0_18_months";
const natural = () => [row("A", INFANT), row("B", INFANT), row("C", INFANT), row("D", INFANT), row("E", INFANT)];

describe("manual position is a cohort-local placement", () => {
    it("no override leaves the natural order untouched", () => {
        expect(names(applyCohortLocalManualPositions(natural()))).toEqual(["A", "B", "C", "D", "E"]);
    });

    it("ordinal 1 puts the row first within its group", () => {
        const rows = [row("A", INFANT), row("B", INFANT), row("Target", INFANT, 1), row("C", INFANT)];
        expect(names(applyCohortLocalManualPositions(rows))).toEqual(["Target", "A", "B", "C"]);
    });

    it("a middle ordinal lands in the middle — the case the old engine could not express", () => {
        const rows = [row("A", INFANT), row("B", INFANT), row("Target", INFANT, 3), row("C", INFANT), row("D", INFANT)];
        expect(names(applyCohortLocalManualPositions(rows))).toEqual(["A", "B", "Target", "C", "D"]);
    });

    it("the final ordinal lands last within the group", () => {
        const rows = [row("A", INFANT), row("Target", INFANT, 4), row("B", INFANT), row("C", INFANT)];
        expect(names(applyCohortLocalManualPositions(rows))).toEqual(["A", "B", "C", "Target"]);
    });

    it("DISTINCT ordinals produce DISTINCT positions (the deployed regression)", () => {
        const seen = new Map<number, string[]>();
        for (const ord of [1, 2, 3, 4, 5]) {
            const rows = [row("A", INFANT), row("B", INFANT), row("C", INFANT), row("D", INFANT), row("Target", INFANT, ord)];
            seen.set(ord, names(applyCohortLocalManualPositions(rows)));
        }
        expect(seen.get(1)).toEqual(["Target", "A", "B", "C", "D"]);
        expect(seen.get(3)).toEqual(["A", "B", "Target", "C", "D"]);
        expect(seen.get(5)).toEqual(["A", "B", "C", "D", "Target"]);
        // Pre-fix, all five of these were identical. That is the whole defect.
        expect(new Set([...seen.values()].map((v) => v.join(","))).size).toBe(5);
    });

    it("clearing the adjustment restores the natural order", () => {
        const pinned = [row("A", INFANT), row("B", INFANT), row("Target", INFANT, 1)];
        expect(names(applyCohortLocalManualPositions(pinned))).toEqual(["Target", "A", "B"]);
        const cleared = [row("A", INFANT), row("B", INFANT), row("Target", INFANT)];
        expect(names(applyCohortLocalManualPositions(cleared))).toEqual(["A", "B", "Target"]);
    });

    it("a released/inactive override never reaches the projection, so it is ignored", () => {
        // The loader filters `is_active`; a released override yields no `manual_pin_ordinal`.
        const r = row("Target", INFANT);
        expect(readRowManualPinOrdinal(r)).toBeNull();
        expect(names(applyCohortLocalManualPositions([row("A", INFANT), r]))).toEqual(["A", "Target"]);
    });

    it("two pinned candidates are deterministic and both honoured", () => {
        const rows = [row("A", INFANT), row("B", INFANT), row("P2", INFANT, 2), row("P1", INFANT, 1), row("C", INFANT)];
        expect(names(applyCohortLocalManualPositions(rows))).toEqual(["P1", "P2", "A", "B", "C"]);
    });

    it("equal ordinals fall back to canonical order rather than an arbitrary one", () => {
        const rows = [row("A", INFANT), row("X", INFANT, 1), row("Y", INFANT, 1)];
        expect(names(applyCohortLocalManualPositions(rows))).toEqual(["X", "Y", "A"]);
    });

    it("unpinned candidates stay comparable to pinned ones and keep their relative order", () => {
        const rows = [row("A", INFANT), row("B", INFANT), row("C", INFANT), row("Target", INFANT, 2)];
        const out = names(applyCohortLocalManualPositions(rows));
        expect(out).toEqual(["A", "Target", "B", "C"]);
        expect(out.filter((n) => n !== "Target")).toEqual(["A", "B", "C"]);
    });

    it("different cohorts are ordered independently and never cross", () => {
        const rows = [
            row("i1", INFANT),
            row("i2", INFANT),
            row("iPin", INFANT, 1),
            row("t1", "toddler_2_3_years"),
            row("t2", "toddler_2_3_years"),
            row("tPin", "toddler_2_3_years", 1),
        ];
        expect(names(applyCohortLocalManualPositions(rows))).toEqual(["iPin", "i1", "i2", "tPin", "t1", "t2"]);
    });

    it("a cohort occupies exactly the slots it occupied before (section ordering intact)", () => {
        const rows = [row("i1", INFANT), row("iPin", INFANT, 2), row("t1", "toddler_2_3_years")];
        const out = applyCohortLocalManualPositions(rows);
        expect(out).toHaveLength(rows.length);
        expect(names(out.slice(0, 2)).sort()).toEqual(["i1", "iPin"]);
        expect(names(out.slice(2))).toEqual(["t1"]);
    });

    it("an out-of-range ordinal clamps instead of dropping the row", () => {
        const rows = [row("A", INFANT), row("Target", INFANT, 999)];
        expect(names(applyCohortLocalManualPositions(rows))).toEqual(["A", "Target"]);
    });

    it("rows with no cohort pass through untouched", () => {
        const rows = [{ id: "plain-1" }, { id: "plain-2" }] as Array<Record<string, unknown>>;
        expect(applyCohortLocalManualPositions(rows).map((r) => r.id)).toEqual(["plain-1", "plain-2"]);
    });
});

describe("the ordinal is no longer a sort-tuple component", () => {
    const policyOk = (t: Array<string | number | null>): PlacementEvaluateOk => ({
        snapshot: {
            schema_version: 1, evaluator_version: "t", profile_id: PROFILE.profile_id,
            profile_revision: PROFILE.revision, evaluated_at_ms: 1,
            bucket_key: "tier_general_waitlist", bucket_priority_order: 100,
            bucket_label: "Standard family", sort_tuple: t,
        },
        reasons: [], tie_breaker_trace: [], warnings: [],
    });

    it("a pinned candidate keeps the SAME tuple shape as an unpinned one", () => {
        const t = ["infant_0_18_months", 100, 1_700_000_000_000, "pc-1"];
        const pinned = applyPlacementCandidateOverrides({
            policy: policyOk([...t]), profile: PROFILE,
            active_overrides: [{ id: "ov", override_kind: "pin", reason: "r", expires_at: null, payload: { pin_ordinal: 2 } }],
        });
        const plain = applyPlacementCandidateOverrides({
            policy: policyOk([...t]), profile: PROFILE, active_overrides: [],
        });
        // Pre-fix this was 5 vs 4, and index 1 compared `2` against `100`.
        expect(pinned.effective.sort_tuple).toHaveLength(plain.effective.sort_tuple.length);
        expect(pinned.effective.sort_tuple).toEqual(plain.effective.sort_tuple);
    });

    it("the ordinal is still reported so downstream knows a pin is in force", () => {
        const out = applyPlacementCandidateOverrides({
            policy: policyOk(["infant_0_18_months", 100, 1, "pc-1"]), profile: PROFILE,
            active_overrides: [{ id: "ov", override_kind: "pin", reason: "r", expires_at: null, payload: { pin_ordinal: 7 } }],
        });
        expect(out.applied[0]?.pin_ordinal).toBe(7);
    });

    it("tier_boost still rewrites the bucket slot at the right index", () => {
        const out = applyPlacementCandidateOverrides({
            policy: policyOk(["preschool", 100, 1, "pc-1"]), profile: PROFILE,
            active_overrides: [{ id: "ov", override_kind: "tier_boost", reason: "Staff", expires_at: null, payload: { effective_bucket_key: "tier_staff_community" } }],
        });
        expect(out.effective.bucket_key).toBe("tier_staff_community");
        expect(out.effective.sort_tuple[1]).toBe(out.effective.bucket_priority_order);
    });
});
