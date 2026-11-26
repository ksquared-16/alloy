/**
 * The Staffing V1 acceptance catalog, and the harness's promises about it.
 *
 * A QA instrument that quietly drops a scenario, or marks a fixture-limited one as runnable,
 * produces an acceptance that means less than it appears to. These are the properties that
 * keep the recorded answer worth having.
 */
import { describe, expect, it } from "vitest";

import { CATALOG_VERSION, SCENARIOS, SUITE_KEY } from "@/lib/qa/staffingV1Qa/scenarioCatalog";
import { overallFixtureStatus, resolveScenarioReadiness, type FixtureSnapshot } from "@/lib/qa/staffingV1Qa/readiness";

function fixture(over: Partial<FixtureSnapshot> = {}): FixtureSnapshot {
    return {
        ok: true, error: null, siteLabel: "North Campus", roomLabel: "Infant A",
        dateLabel: "Thursday, 1 April 2027", date: "2027-04-01", roomSegments: [],
        checks: {
            site_exists: true, room_exists: true, child_demand_on_qa_date: true,
            requirement_resolves: true, adequate_segment_exists: true, gap_segment_exists: true,
            staff_candidates_exist: true, attendance_observed_on_qa_date: false,
        },
        ...over,
    };
}

describe("the catalog", () => {
    it("covers all twenty acceptance areas, in order, with stable keys", () => {
        expect(SCENARIOS).toHaveLength(20);
        expect(SCENARIOS.map((s) => s.order)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
        expect(new Set(SCENARIOS.map((s) => s.key)).size).toBe(20);
    });

    it("is namespaced and versioned, so an answer belongs to a question", () => {
        expect(SUITE_KEY).toBe("staffing_v1_human_qa");
        expect(CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    });

    it("gives every scenario something to do and a rule it protects", () => {
        for (const s of SCENARIOS) {
            expect(s.title.length, s.key).toBeGreaterThan(8);
            expect(s.purpose.length, s.key).toBeGreaterThan(20);
            expect(s.whyItMatters.length, s.key).toBeGreaterThan(40);
            expect(s.invariant.length, s.key).toBeGreaterThan(20);
            if (s.key !== "final_operator_verdict") {
                expect(s.navigate.length, s.key).toBeGreaterThan(0);
                expect(s.doThis.length, s.key).toBeGreaterThan(0);
            }
        }
    });

    it("states a reason whenever a scenario is not a plain walkthrough", () => {
        for (const s of SCENARIOS) {
            if (s.disposition !== "HUMAN_WALKTHROUGH") {
                expect(s.dispositionReason, `${s.key} must say why`).toBeTruthy();
            }
        }
    });

    it("keeps the two fixture-limited scenarios visible rather than omitted", () => {
        const limited = SCENARIOS.filter((s) => s.disposition === "FIXTURE_NEEDED").map((s) => s.key);
        expect(limited).toEqual(["plan_vs_actual", "expected_vs_actual_children"]);
    });
});

describe("readiness", () => {
    it("marks a scenario runnable only when its preconditions actually hold", () => {
        const r = resolveScenarioReadiness(fixture());
        expect(r.find((x) => x.key === "coverage_gap")?.status).toBe("RUNNABLE");
    });

    it("never calls a fixture-limited scenario runnable while its fixture is missing", () => {
        const r = resolveScenarioReadiness(fixture());
        const planVsActual = r.find((x) => x.key === "plan_vs_actual");
        expect(planVsActual?.status).toBe("FIXTURE_NEEDED");
        expect(planVsActual?.unmet).toContain("an observation exists");
    });

    it("blocks the gap scenarios when the day has no gap, rather than letting them pass", () => {
        const r = resolveScenarioReadiness(fixture({ checks: { ...fixture().checks, gap_segment_exists: false } }));
        expect(r.find((x) => x.key === "coverage_gap")?.status).toBe("BLOCKED");
    });

    it("blocks everything when the day could not be read — an unread day is not an empty one", () => {
        const r = resolveScenarioReadiness(fixture({ ok: false, error: "boom" }));
        expect(r.every((x) => x.status === "BLOCKED")).toBe(true);
    });

    it("summarises the fixture honestly", () => {
        expect(overallFixtureStatus(fixture())).toBe("READY");
        expect(overallFixtureStatus(fixture({ checks: { ...fixture().checks, gap_segment_exists: false } }))).toBe("PARTIAL");
        expect(overallFixtureStatus(fixture({ ok: false }))).toBe("BLOCKED");
    });

    it("does not require an observation fixture for the twenty-scenario suite to be READY", () => {
        // Plan-vs-actual is genuinely fixture-limited; that must not make the whole suite
        // read as not-ready, or the operator will never start.
        expect(fixture().checks.attendance_observed_on_qa_date).toBe(false);
        expect(overallFixtureStatus(fixture())).toBe("READY");
    });
});
