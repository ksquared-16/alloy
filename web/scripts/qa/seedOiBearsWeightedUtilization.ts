/**
 * Seed / document Bears weighted utilization fixture for OI QA.
 * Does not mutate production. Wire to staging-development clients before running.
 *
 * Expected: 8×1.0 + 4×0.5 = 10 FTE; capacity 15; utilization 66.67%.
 */

import {
    OI_BEARS_WEIGHTED_UTILIZATION_FIXTURE,
    computeExpectedUtilization,
} from "../../lib/operationalQuestions/oiQaFixtures";

const expected = computeExpectedUtilization({
    equivalentCount: OI_BEARS_WEIGHTED_UTILIZATION_FIXTURE.expectedEquivalentCount,
    capacity: OI_BEARS_WEIGHTED_UTILIZATION_FIXTURE.effectiveCapacity,
});

console.log(
    JSON.stringify(
        {
            fixture: OI_BEARS_WEIGHTED_UTILIZATION_FIXTURE,
            computed: expected,
            note:
                "Apply room capacity, enrollments, and schedules in staging-development manually or via org-specific seed helpers before browser QA.",
        },
        null,
        2,
    ),
);

if (expected.displayed !== OI_BEARS_WEIGHTED_UTILIZATION_FIXTURE.expectedDisplayedPct) {
    process.exitCode = 1;
}
