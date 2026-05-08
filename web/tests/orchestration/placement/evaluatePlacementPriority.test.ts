import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    collectPredicateFactKeys,
    evaluatePlacementPriority,
    evaluatePredicate,
    validatePlacementProfile,
} from "@/lib/orchestration/placement/evaluatePlacementPriority";
import type { FactBag, PlacementEvaluateInput, PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

const BASE_INPUT = {
    evaluator_version: "1",
    now_ms: 1_715_176_800_000,
    entity: { entity_type: "opportunity", entity_id: "opp_a" },
    cohort: { work_unit_id: "wu_1", queue_key: "waitlisted", status_keys_allowed: ["waitlisted"] },
} satisfies Omit<PlacementEvaluateInput, "facts" | "profile">;

function evalChildcare(facts: FactBag, entityId = "opp_a") {
    return evaluatePlacementPriority({
        ...BASE_INPUT,
        entity: { entity_type: "opportunity", entity_id: entityId },
        facts,
        profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
    });
}

describe("evaluatePlacementPriority", () => {
    it("evaluator core has no childcare-specific branching (string scan)", () => {
        const corePath = resolve(process.cwd(), "lib/orchestration/placement/evaluatePlacementPriority.ts");
        const src = readFileSync(corePath, "utf8");
        expect(src.toLowerCase()).not.toMatch(/childcare|waitlist|sibling|sister/);
    });

    it("invalid profile: duplicate bucket_key", () => {
        const bad: PlacementProfile = {
            ...CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
            buckets: [
                { bucket_key: "dup", priority_order: 1, label_key: "l1" },
                { bucket_key: "dup", priority_order: 2, label_key: "l2" },
            ],
            labels: { l1: "A", l2: "B" },
            rules: [],
            fallback_bucket_key: "dup",
            tie_breakers: [],
        };
        const v = validatePlacementProfile(bad);
        expect(v?.code).toBe("INVALID_PROFILE");
    });

    it("UNSUPPORTED_COHORT when queue_key outside cohort_filter", () => {
        const r = evaluatePlacementPriority({
            ...BASE_INPUT,
            cohort: { ...BASE_INPUT.cohort, queue_key: "pipeline_total" },
            facts: {},
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("UNSUPPORTED_COHORT");
    });

    it("FACT_CONSTRAINT_VIOLATION when strict_required_facts and fact missing", () => {
        const profile: PlacementProfile = {
            ...CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
            strict_required_facts: true,
            required_fact_keys: ["wait_since"],
        };
        const r = evaluatePlacementPriority({
            ...BASE_INPUT,
            facts: {},
            profile,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("FACT_CONSTRAINT_VIOLATION");
    });

    it("first matching bucket wins (staff before sibling when both true)", () => {
        const r = evalChildcare({
            flag_employee_household: { presence: "present", value: true },
            flag_sibling_enrolled: { presence: "present", value: true },
            wait_since: { presence: "present", value: "2024-01-01T00:00:00.000Z" },
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.snapshot.bucket_key).toBe("tier_staff_community");
    });

    it("sibling bucket when sibling flag true and not staff/community", () => {
        const r = evalChildcare({
            flag_sibling_enrolled: { presence: "present", value: true },
            wait_since: { presence: "present", value: "2024-06-01T00:00:00.000Z" },
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.snapshot.bucket_key).toBe("tier_sibling_enrolled");
    });

    it("sister center bucket", () => {
        const r = evalChildcare({
            flag_sister_center: { presence: "present", value: true },
            wait_since: { presence: "present", value: "2024-06-01T00:00:00.000Z" },
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.snapshot.bucket_key).toBe("tier_sister_center");
    });

    it("fallback general waitlist when no rule matches", () => {
        const r = evalChildcare({
            wait_since: { presence: "present", value: "2024-06-01T00:00:00.000Z" },
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.snapshot.bucket_key).toBe("tier_general_waitlist");
            expect(r.value.reasons.some((x) => x.code === "fallback_bucket")).toBe(true);
        }
    });

    it("unknown sibling flag produces warnings and extra reasons", () => {
        const r = evalChildcare({
            flag_sibling_enrolled: { presence: "unknown" },
            wait_since: { presence: "present", value: "2024-06-01T00:00:00.000Z" },
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.warnings.some((w) => w.code === "unknown_fact")).toBe(true);
            expect(r.value.reasons.some((x) => x.code === "fact_unknown_optional")).toBe(true);
        }
    });

    it("deterministic tie-breaker trace and sort_tuple (dates + entity_id)", () => {
        const r = evalChildcare({
            wait_since: { presence: "present", value: "2024-06-01T12:00:00.000Z" },
            desired_start_date: { presence: "present", value: "2025-09-01T00:00:00.000Z" },
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.tie_breaker_trace.length).toBe(3);
            expect(r.value.tie_breaker_trace[0].field).toBe("wait_since");
            expect(r.value.tie_breaker_trace[2].field).toBe("__entity_id__");
            expect(r.value.snapshot.sort_tuple[0]).toBe(100);
            expect(typeof r.value.snapshot.sort_tuple[1]).toBe("number");
            expect(typeof r.value.snapshot.sort_tuple[2]).toBe("number");
            expect(r.value.snapshot.sort_tuple[3]).toBe("opp_a");
        }
    });

    it("stable entity_id final tie-breaker: same facts different ids produce ordered sort_tuple", () => {
        const facts: FactBag = {
            wait_since: { presence: "present", value: "2024-06-01T00:00:00.000Z" },
        };
        const a = evaluatePlacementPriority({
            ...BASE_INPUT,
            entity: { entity_type: "opportunity", entity_id: "opp_z" },
            facts,
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
        });
        const b = evaluatePlacementPriority({
            ...BASE_INPUT,
            entity: { entity_type: "opportunity", entity_id: "opp_m" },
            facts,
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
        });
        expect(a.ok && b.ok).toBe(true);
        if (a.ok && b.ok) {
            expect(a.value.snapshot.sort_tuple.slice(0, -1)).toEqual(b.value.snapshot.sort_tuple.slice(0, -1));
            expect(a.value.snapshot.sort_tuple.at(-1)).toBe("opp_z");
            expect(b.value.snapshot.sort_tuple.at(-1)).toBe("opp_m");
            const tuples = [a.value.snapshot.sort_tuple, b.value.snapshot.sort_tuple].sort((x, y) =>
                JSON.stringify(x).localeCompare(JSON.stringify(y))
            );
            expect(tuples[0].at(-1)).toBe("opp_m");
            expect(tuples[1].at(-1)).toBe("opp_z");
        }
    });

    it("generic profile: first ordered rule wins", () => {
        const generic: PlacementProfile = {
            profile_id: "generic_test",
            revision: "1",
            domain: "generic",
            buckets: [
                { bucket_key: "first", priority_order: 1, label_key: "l_first" },
                { bucket_key: "second", priority_order: 2, label_key: "l_second" },
                { bucket_key: "fb", priority_order: 99, label_key: "l_fb" },
            ],
            rules: [
                {
                    rule_order: 2,
                    when: { fact_eq: { key: "x", value: true } },
                    assign_bucket_key: "second",
                },
                {
                    rule_order: 1,
                    when: { fact_present: { key: "x" } },
                    assign_bucket_key: "first",
                },
            ],
            fallback_bucket_key: "fb",
            tie_breakers: [],
            labels: {
                l_first: "First",
                l_second: "Second",
                l_fb: "Fallback",
                reason_fallback: "fb",
                reason_rule_matched: "matched",
            },
        };
        const r = evaluatePlacementPriority({
            ...BASE_INPUT,
            cohort: { work_unit_id: "wu", queue_key: "any" },
            facts: { x: { presence: "present", value: true } },
            profile: generic,
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.snapshot.bucket_key).toBe("first");
    });
});

describe("evaluatePredicate", () => {
    it("fact_eq false for unknown", () => {
        expect(
            evaluatePredicate({ fact_eq: { key: "flag_sibling_enrolled", value: true } }, {
                flag_sibling_enrolled: { presence: "unknown" },
            })
        ).toBe(false);
    });

    it("collectPredicateFactKeys gathers keys", () => {
        const s = new Set<string>();
        collectPredicateFactKeys(
            {
                any: [
                    { fact_eq: { key: "a", value: 1 } },
                    { fact_present: { key: "b" } },
                ],
            },
            s
        );
        expect([...s].sort()).toEqual(["a", "b"]);
    });
});
