/**
 * RETIRED — this fixture is refused, and the refusal is the point.
 *
 * It used to select the tenant's most recent Communications thread and service-role
 * write `attention_state = 'needs_response'` onto it so a Work Items row would appear.
 *
 * That is not an acceptable certification scenario, for three reasons:
 *
 *   1. It certified itself. The projection was reading a value this script had written,
 *      so a run stayed green even if the Communications runtime had stopped producing
 *      actionable state. The authority under test was the fixture.
 *   2. It was not repeatable. "Most recent thread" is whatever ran last.
 *   3. It mutated real correspondence. Hosted candidate threads carry real external
 *      addresses, and flipping a family's conversation into Needs Reply — then restoring
 *      a remembered prior value on cleanup — edits a customer's record to stage a test.
 *
 * The replacement delivers a message and lets the runtime decide:
 *
 *   certification/playwright/communicationsNeedsReplyScenario.ts
 *   certification/playwright/communications-work-items-needs-reply.cert.spec.ts
 *   docs/platform/communications/work-items-h2-safe-scenario.md
 *
 * Run it with `certification/alloy-certify verify`.
 *
 * This file is left in place, refusing, rather than deleted: anything still wired to the
 * old path must fail loudly instead of silently finding nothing — or worse, being
 * restored by someone who only saw that a fixture was missing.
 */

console.error(
    [
        "REFUSED: createCommunicationsNeedsReplyQaFixture is retired.",
        "",
        "It manufactured Work Items eligibility by direct-writing attention_state onto an",
        "existing thread — which certified the fixture rather than the runtime, and mutated",
        "real correspondence to do it.",
        "",
        "Use the safe scenario instead:",
        "  certification/playwright/communicationsNeedsReplyScenario.ts",
        "  certification/alloy-certify verify",
        "",
        "Rationale: docs/platform/communications/work-items-h2-safe-scenario.md",
    ].join("\n"),
);
process.exit(1);
