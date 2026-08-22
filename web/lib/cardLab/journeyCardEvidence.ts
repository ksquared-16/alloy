/**
 * Journey card evidence — "Where is this subject in its process, how did it get here,
 * and what remains?"
 *
 * OWNS NOTHING. Composes three inputs it does not own:
 *   1. the ordered stage list from the GOVERNING business-process revision
 *      (`publishedStageInputs.processStages`, pinned per running instance — D-96)
 *   2. the current position (`process_instances.stage_key`) and durable `state`
 *   3. stage-anchored durable facts (tours, waitlist candidacy, forms, agreements,
 *      placements, schedule assignments, billing setup, documents)
 *
 * ── WHY STAGES AND NOT WORK VIEWS ──
 *
 * A Work View is an operator LENS over work: overlapping, re-authorable, and a subject can sit
 * in several at once. A history organised by lenses would change retroactively whenever someone
 * edited one. Stages are pinned to the governing revision for the life of a running instance,
 * which is exactly the durability a journey needs.
 *
 * ── THE HONESTY LIMIT ──
 *
 * There is NO durable stage-history store. `process_instances.stage_key` is a current position
 * and `opportunities.stage_entered_at` is overwritten on each entry. So:
 *   - `enteredAt` is populated for the CURRENT stage only, never reconstructed for past ones
 *   - `skipped` is an INFERENCE (a passed stage with no anchored fact), reported as such
 *   - `reopened` is claimed only from an observed backwards transition (`mutation_events`)
 * Fabricating past entry times would be plausible and wrong. See GAP-4.
 *
 * @see docs/platform/operator/operational-card-system-expansion.md §3, §8
 */

import {
    type CardLabEvidenceBase,
    type CardLabHandoff,
    type CardLabResolution,
    trimOrNull,
} from "@/lib/cardLab/cardLabTypes";

export type JourneyStageStatus = "completed" | "current" | "future" | "skipped" | "reopened";

/**
 * One stage-anchored durable fact.
 *
 * Deliberately the shape of the EXISTING `MilestoneFact` blueprint plus `stageKey` — that one
 * field is the whole difference between a milestone list and a journey. Do not define a second
 * fact type; the adapters that would populate `truth.milestones` populate this. See spec §8.
 */
export type JourneyFact = {
    id: string;
    /** Registered type key, e.g. "tour.booking" — from MILESTONE_TYPE_REGISTRY. */
    typeKey: string;
    label: string;
    /** ISO instant; null for an undated committed fact. Never invented. */
    at: string | null;
    /** The stage this fact is anchored to. Null = unanchored (a milestone, not journey content). */
    stageKey: string | null;
    /** Opaque owner key for audit. Never displayed. */
    sourceOwner: string;
    /** Card Links destination — the card that OWNS this fact. */
    destinationCard: CardLabHandoff;
    subjectId: string | null;
};

export type JourneyStage = {
    key: string;
    label: string;
    status: JourneyStageStatus;
    /**
     * CURRENT stage only. Past stages have no store, so this stays null for them — an absent
     * date is the truthful rendering of a fact the platform never recorded.
     */
    enteredAt: string | null;
    facts: JourneyFact[];
    outcomeLabel: string | null;
    /** Current stage only; null when the stage declares no requirements. */
    requirementsSatisfied: number | null;
    requirementsTotal: number | null;
    /** True when `skipped` was derived rather than observed — the card must say so. */
    statusIsInferred: boolean;
};

export type JourneyCardEvidence = CardLabEvidenceBase & {
    stages: JourneyStage[];
    currentStageKey: string | null;
    /** 1-based ordinal for "Stage 3 of 5"; null when the position is unknown. */
    currentStageIndex: number | null;
    stageCount: number;
    /** From `process_instances.state` — waitlisted / enrolling / enrolled / withdrawn / … */
    stateLabel: string | null;
    closeReasonLabel: string | null;
    /** Open work count — REFERENCED, owned by `current_work`. */
    openWorkCount: number;
    openWorkHandoff: CardLabHandoff;
};

export type JourneyEvidenceInput = {
    /** Ordered stage list from the governing revision. Empty/absent = UNRESOLVED, not "no journey". */
    processStages: readonly { key: string; label: string }[] | null;
    currentStageKey: string | null;
    /** `opportunities.stage_entered_at` — the current stage's entry only. */
    currentStageEnteredAt: string | null;
    stateLabel: string | null;
    closeReasonLabel: string | null;
    facts: readonly JourneyFact[];
    /** Stage keys observed re-entered, from `mutation_events` backwards transitions. */
    reopenedStageKeys?: readonly string[];
    requirementsSatisfied?: number | null;
    requirementsTotal?: number | null;
    openWorkCount?: number;
    /** True when the process has closed — the current stage stops being "current". */
    isClosed?: boolean;
};

function factsForStage(facts: readonly JourneyFact[], stageKey: string): JourneyFact[] {
    return facts
        .filter((f) => f.stageKey === stageKey)
        .slice()
        .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

export function buildJourneyCardEvidence(input: JourneyEvidenceInput): JourneyCardEvidence {
    const stageList = input.processStages ?? [];
    const openWorkCount = input.openWorkCount ?? 0;

    // UNRESOLVED — no governing revision resolved. Hold; never conclude "no journey".
    if (stageList.length === 0) {
        return {
            stages: [],
            currentStageKey: null,
            currentStageIndex: null,
            stageCount: 0,
            stateLabel: null,
            closeReasonLabel: null,
            openWorkCount,
            openWorkHandoff: "current_work",
            answerLine: "",
            supportingLine: null,
            statusChip: null,
            statusTone: "neutral",
            resolution: "unresolved" satisfies CardLabResolution,
        };
    }

    const currentIndex = input.currentStageKey
        ? stageList.findIndex((s) => s.key === input.currentStageKey)
        : -1;
    const reopened = new Set(input.reopenedStageKeys ?? []);
    const isClosed = Boolean(input.isClosed);

    const stages: JourneyStage[] = stageList.map((stage, index) => {
        const facts = factsForStage(input.facts, stage.key);
        const isCurrent = !isClosed && index === currentIndex;
        const isPast = currentIndex >= 0 && index < currentIndex;

        let status: JourneyStageStatus;
        let statusIsInferred = false;
        if (reopened.has(stage.key)) {
            status = "reopened";
        } else if (isCurrent) {
            status = "current";
        } else if (isPast) {
            // A passed stage with no anchored fact READS as skipped, but the platform never
            // recorded a skip — a stage can be worked without producing a fact. Say so.
            if (facts.length === 0) {
                status = "skipped";
                statusIsInferred = true;
            } else {
                status = "completed";
            }
        } else if (isClosed && index <= Math.max(currentIndex, 0)) {
            status = facts.length > 0 ? "completed" : "skipped";
            statusIsInferred = facts.length === 0;
        } else {
            status = "future";
        }

        const outcomeFact = facts.find((f) => f.typeKey === "process.outcome") ?? null;

        return {
            key: stage.key,
            label: stage.label,
            status,
            enteredAt: isCurrent ? input.currentStageEnteredAt : null,
            facts,
            outcomeLabel: outcomeFact ? outcomeFact.label : null,
            requirementsSatisfied: isCurrent ? (input.requirementsSatisfied ?? null) : null,
            requirementsTotal: isCurrent ? (input.requirementsTotal ?? null) : null,
            statusIsInferred,
        };
    });

    const stateLabel = trimOrNull(input.stateLabel);
    const closeReasonLabel = trimOrNull(input.closeReasonLabel);
    const currentStage = currentIndex >= 0 ? stageList[currentIndex] : null;

    let answerLine: string;
    let supportingLine: string | null;
    let statusChip: string | null;
    let statusTone: JourneyCardEvidence["statusTone"];

    if (isClosed) {
        answerLine = stateLabel ?? "Process closed";
        supportingLine = closeReasonLabel ? `Reason: ${closeReasonLabel}` : null;
        statusChip = "Closed";
        statusTone = "done";
    } else if (currentStage) {
        answerLine = `Stage ${currentIndex + 1} of ${stageList.length} — ${currentStage.label}`;
        const req = stages[currentIndex];
        supportingLine =
            req && req.requirementsTotal != null && req.requirementsSatisfied != null
                ? `${req.requirementsSatisfied} of ${req.requirementsTotal} required items complete`
                : openWorkCount > 0
                  ? `${openWorkCount} open item${openWorkCount === 1 ? "" : "s"}`
                  : null;
        statusChip = stateLabel;
        statusTone =
            req && req.requirementsTotal != null && req.requirementsSatisfied != null
                ? req.requirementsSatisfied >= req.requirementsTotal
                    ? "ready"
                    : "at-risk"
                : "neutral";
    } else {
        // Stage list resolved but the subject holds no position — a real answer, not a hold.
        answerLine = "Not started";
        supportingLine = `${stageList.length} stage${stageList.length === 1 ? "" : "s"} configured`;
        statusChip = null;
        statusTone = "neutral";
    }

    const anyFact = input.facts.length > 0;

    return {
        stages,
        currentStageKey: currentStage?.key ?? null,
        currentStageIndex: currentIndex >= 0 ? currentIndex + 1 : null,
        stageCount: stageList.length,
        stateLabel,
        closeReasonLabel,
        openWorkCount,
        openWorkHandoff: "current_work",
        answerLine,
        supportingLine,
        statusChip,
        statusTone,
        resolution: currentStage || anyFact ? "settled" : "empty",
    };
}
