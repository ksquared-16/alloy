/**
 * CANONICAL GRAIN TRANSLATION — the one place Alloy's three grain vocabularies line up.
 *
 *   StageGrain        "family" | "child" | "person" | "account" | "work_item"   stage configuration
 *   JourneySegment    "family" | "child"                                        stage operating plans
 *   OperationalGrain  "case"   | "child" | "candidate"                          the Focus Panel
 *
 * They do not line up by name (`family` ≡ `case`), they do not cover the same ground (`candidate`
 * exists only on the panel; `person`/`account`/`work_item` only on the stage), and each had its own
 * default scattered across a dozen call sites as `?? "family"` / `?? "case"`.
 *
 * Most of those defaults were DEAD: `journey_segment` is required on `StageOperatingPlanV1` and
 * enforced by its parser, so a plan that omits it never parses and never reaches a call site.
 *
 * What no code was doing is the thing that actually bites: the plan's segment and the STAGE's grain
 * are two independent declarations, and nothing reconciled them. A stage configured `grain: "child"`
 * whose plan still said `family` ran as a family — `completeStageWorkWithOutcome`'s child guard reads
 * the PLAN, so it never fired, no child subject was required, and the child stage's outcome executed
 * against the family case. That is reachable in ordinary operation: a tenant edits grain in the
 * builder and does not republish the plan.
 *
 * So translation is TOTAL and its failure is a value. Where two declarations exist they must AGREE;
 * a contradiction is refused rather than resolved by precedence, because a precedence rule is just a
 * silent default with more steps. Where neither exists the answer still comes back, but it says it is
 * a default — the caller can see it was not told.
 */

import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";

/** The vocabulary stage operating plans use. A plan speaks only of family vs child. */
export type JourneySegment = "family" | "child";

export type JourneySegmentResolution =
    | { ok: true; segment: JourneySegment; source: "declared" | "stage_grain" | "default" }
    | { ok: false; reason: string };

/**
 * StageGrain → JourneySegment.
 *
 * `person`/`account`/`work_item` have NO journey segment. A plan cannot be authored for them, and
 * answering "family" would be the substitution this module exists to remove.
 */
export function journeySegmentForStageGrain(
    grain: StageGrain,
): { ok: true; segment: JourneySegment } | { ok: false; reason: string } {
    switch (grain) {
        case "family":
            return { ok: true, segment: "family" };
        case "child":
            return { ok: true, segment: "child" };
        case "person":
        case "account":
        case "work_item":
            return {
                ok: false,
                reason: `stage grain "${grain}" has no journey segment — a stage operating plan cannot be authored for it`,
            };
    }
}

/**
 * The journey segment a stage's work actually runs at, reconciling the two places it can be declared.
 *
 *  - both declared and AGREE      → the declaration
 *  - both declared and DISAGREE   → refused; the configuration contradicts itself
 *  - only the plan declares       → the plan
 *  - only the stage declares      → derived from the stage grain
 *  - neither declares             → "family", explicitly marked as a default, never as a fact
 */
export function resolveJourneySegment(params: {
    planSegment?: JourneySegment | null | undefined;
    stageGrain?: StageGrain | null | undefined;
}): JourneySegmentResolution {
    const declared = params.planSegment ?? null;
    const stageGrain = params.stageGrain ?? null;

    if (!stageGrain) {
        return declared
            ? { ok: true, segment: declared, source: "declared" }
            : { ok: true, segment: "family", source: "default" };
    }

    const fromStage = journeySegmentForStageGrain(stageGrain);
    if (!fromStage.ok) {
        // The stage is a grain no plan can serve. If the plan declared one anyway, that is the
        // contradiction — the plan claims to run at a segment the stage does not have.
        return declared
            ? {
                  ok: false,
                  reason: `stage operating plan declares journey segment "${declared}" but the stage grain is "${stageGrain}" — ${fromStage.reason}`,
              }
            : fromStage;
    }

    if (declared && declared !== fromStage.segment) {
        return {
            ok: false,
            reason: `stage operating plan declares journey segment "${declared}" but the stage declares grain "${stageGrain}" — configuration contradicts itself`,
        };
    }

    return declared
        ? { ok: true, segment: declared, source: "declared" }
        : { ok: true, segment: fromStage.segment, source: "stage_grain" };
}

/**
 * The segment to USE when a caller cannot refuse — it must still act, and acting as family is the
 * historical behaviour. Distinguished from `resolveJourneySegment` so that every remaining tolerant
 * call site is greppable, and so a contradiction is at least reported rather than absorbed.
 *
 * Prefer `resolveJourneySegment` and handle `ok: false`. This exists for stamping provenance onto a
 * trace/metadata record, where refusing to write the trace would lose more than it protects.
 */
export function journeySegmentOrFamily(params: {
    planSegment?: JourneySegment | null | undefined;
    stageGrain?: StageGrain | null | undefined;
}): JourneySegment {
    const resolved = resolveJourneySegment(params);
    return resolved.ok ? resolved.segment : "family";
}
