/**
 * The operating plan, said in operator language.
 *
 * A director should be able to read the Lead stage and answer: what do staff do here, what can
 * happen, which of those finish the work, which create follow-up, which raise attention, and
 * which one moves the family on. Those answers exist in the configuration already — they are just
 * spread across `work_templates`, `outcomes`, `outcome_rules` and `attention_rules` in a shape
 * that reads like a schema.
 *
 * This module is the one place that translation happens. Both the Stage Overview and each Work
 * Item card read from here, so the page cannot describe the configuration differently in two
 * places — which is precisely the defect the editor has today, where outcomes are rendered twice
 * with different affordances and nothing says which is authoritative.
 *
 * Pure functions on purpose: the interesting logic is the translation, and it should be provable
 * without a browser.
 */

import type {
    StageOperatingPlanV1,
    StageOutcomeRuleV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

/** What an outcome actually does, in the order an operator would ask it. */
export type OutcomeEffectSummary = {
    outcomeKey: string;
    label: string;
    /** Does this finish the work item? */
    completesWork: boolean;
    /** Does the record stay in this stage? */
    staysInStage: boolean;
    /** The transition it moves through, when it moves. */
    movesThrough: string | null;
    /** Follow-up work this creates, described in days. */
    createsFollowUp: { templateKey: string; dueInDays: number | null; whileAttemptsUnder: number | null } | null;
    /** Attention this raises. */
    createsAttention: boolean;
    /** True when the outcome is produced by a domain signal rather than recorded by a person. */
    automatic: boolean;
    /** The signal that produces it, when automatic. */
    producedBy: { domain: string; signal: string } | null;
    /** One sentence an operator can read. */
    sentence: string;
};

const dayWord = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/**
 * The `when_attempt_count_lt` gate on whichever rule carries a given target kind.
 *
 * Attempt-conditional behaviour is expressed as TWO rules on the same outcome — one below the
 * threshold, one at or above it — which is what `upsertAttemptConditionalOutcomeRules` builds.
 * The summary therefore has to look across all of an outcome's rules, not just the first.
 */
function attemptGateFor(rules: StageOutcomeRuleV1[], targetKind: string): number | null {
    for (const rule of rules) {
        if (typeof rule.when_attempt_count_lt !== "number") continue;
        if ((rule.targets ?? []).some((t) => t.kind === targetKind)) return rule.when_attempt_count_lt;
    }
    return null;
}

function followUpDays(rule: StageOutcomeRuleV1): number | null {
    for (const target of rule.targets ?? []) {
        if (target.kind !== "create_next_work") continue;
        const policy = target.follow_up_due_policy;
        if (policy && typeof policy.offset_value === "number") return policy.offset_value;
        if (typeof target.due_days === "number") return target.due_days;
        return null;
    }
    return null;
}

/**
 * Rules that describe one outcome.
 *
 * An outcome can be driven by a person recording it (`when_outcome_key`) AND by a domain signal
 * (`when_domain_signal`) — Tour Scheduled is both, deliberately: the booking produces it
 * automatically, and the manual outcome remains for tours booked outside the system. Both must be
 * considered or the summary would claim the operator has to record something they do not.
 */
function rulesForOutcome(plan: StageOperatingPlanV1, outcomeKey: string): StageOutcomeRuleV1[] {
    return (plan.outcome_rules ?? []).filter((r) => (r.when_outcome_key ?? "").trim() === outcomeKey);
}

/** The signal-triggered rule whose targets match this outcome's, if one exists. */
function signalRuleMatching(plan: StageOperatingPlanV1, rules: StageOutcomeRuleV1[]): StageOutcomeRuleV1 | null {
    const transitions = new Set(
        rules.flatMap((r) => (r.targets ?? []).map((t) => t.transition_ref).filter(Boolean) as string[]),
    );
    if (!transitions.size) return null;
    return (
        (plan.outcome_rules ?? []).find(
            (r) =>
                r.when_domain_signal?.domain &&
                r.when_domain_signal?.signal &&
                (r.targets ?? []).some((t) => t.transition_ref && transitions.has(t.transition_ref)),
        ) ?? null
    );
}

export function summarizeOutcome(plan: StageOperatingPlanV1, outcomeKey: string): OutcomeEffectSummary | null {
    const outcome = (plan.outcomes ?? []).find((o) => o.outcome_key === outcomeKey);
    if (!outcome) return null;

    const rules = rulesForOutcome(plan, outcomeKey);
    const targets = rules.flatMap((r) => r.targets ?? []);

    const movesThrough = targets.find((t) => t.kind === "move_to_stage" && t.transition_ref)?.transition_ref ?? null;
    const completesWork =
        Boolean(outcome.completes_work) || targets.some((t) => t.kind === "mark_stage_work_complete");
    const followUpTarget = targets.find((t) => t.kind === "create_next_work");
    const createsAttention = targets.some((t) => t.kind === "create_needs_attention");

    const signalRule = signalRuleMatching(plan, rules);
    const producedBy = signalRule?.when_domain_signal
        ? { domain: signalRule.when_domain_signal.domain, signal: signalRule.when_domain_signal.signal }
        : null;

    const followUpDayCount = rules.map(followUpDays).find((d) => d != null) ?? null;
    const createsFollowUp = followUpTarget
        ? {
              templateKey: followUpTarget.template_key ?? "",
              dueInDays: followUpDayCount,
              // The attempt gate lives on the RULE, not the target — a gate written onto a target
              // is silently never read. Hiding the threshold would let the card imply the retry
              // loop is endless, which is the opposite of the policy.
              whileAttemptsUnder: attemptGateFor(rules, "create_next_work"),
          }
        : null;

    return {
        outcomeKey,
        label: outcome.label || outcomeKey,
        completesWork,
        staysInStage: !movesThrough,
        movesThrough,
        createsFollowUp,
        createsAttention,
        automatic: Boolean(producedBy),
        producedBy,
        sentence: outcomeSentence({
            label: outcome.label || outcomeKey,
            completesWork,
            movesThrough,
            createsFollowUp,
            createsAttention,
            producedBy,
        }),
    };
}

/**
 * One readable sentence per outcome.
 *
 * Written as consequences in the order an operator experiences them — finishes the work, moves
 * the family, schedules the next touch — rather than as a list of target kinds.
 */
export function outcomeSentence(input: {
    label: string;
    completesWork: boolean;
    movesThrough: string | null;
    createsFollowUp: { templateKey: string; dueInDays: number | null; whileAttemptsUnder: number | null } | null;
    createsAttention: boolean;
    producedBy: { domain: string; signal: string } | null;
}): string {
    const parts: string[] = [];
    parts.push(input.completesWork ? "Completes the work item" : "Leaves the work item open");
    parts.push(input.movesThrough ? `moves the family through ${humanTransition(input.movesThrough)}` : "keeps the family in this stage");
    if (input.createsFollowUp) {
        const base =
            input.createsFollowUp.dueInDays != null
                ? `creates follow-up work due in ${dayWord(input.createsFollowUp.dueInDays)}`
                : "creates follow-up work";
        parts.push(
            input.createsFollowUp.whileAttemptsUnder != null
                ? `${base} while under ${input.createsFollowUp.whileAttemptsUnder} attempts`
                : base,
        );
    }
    if (input.createsAttention) parts.push("raises Needs Attention");
    const sentence = `${parts.join(", ")}.`;
    return input.producedBy
        ? `${sentence} Recorded automatically when a ${input.producedBy.domain.replace(/_/g, " ")} is ${input.producedBy.signal}.`
        : sentence;
}

/** `lead_to_tour` → "Lead → Tour". Identity keys are never the operator-facing label. */
export function humanTransition(transitionRef: string): string {
    const parts = transitionRef.split("_to_");
    if (parts.length !== 2) return transitionRef;
    const title = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return `${title(parts[0]!)} → ${title(parts[1]!)}`;
}

export type WorkItemSummary = {
    templateKey: string;
    label: string;
    purpose: string;
    required: boolean;
    primary: boolean;
    /** "Due same day" / "Due in 2 days". */
    dueExpectation: string;
    actionCount: number;
    outcomes: OutcomeEffectSummary[];
    /** Attention rules scoped to THIS work item, by `template_key`. */
    attentionLabels: string[];
    /** "Left Message → follow-up in 1 day" style lines. */
    followUpLines: string[];
    /** The outcome that moves the family on, if any. */
    exitOutcome: OutcomeEffectSummary | null;
};

export function summarizeWorkItem(plan: StageOperatingPlanV1, work: StageWorkTemplateV1): WorkItemSummary {
    const outcomeKeys = (work.outcome_refs ?? []).map((r) => r.outcome_ref).filter(Boolean) as string[];
    const outcomes = outcomeKeys
        .map((k) => summarizeOutcome(plan, k))
        .filter((o): o is OutcomeEffectSummary => o != null);

    const attentionLabels = (plan.attention_rules ?? [])
        .filter((r) => (r.template_key ?? "").trim() === work.template_key)
        .map((r) => r.label || r.rule_key);

    return {
        templateKey: work.template_key,
        label: work.label || work.template_key,
        purpose: work.description ?? "",
        required: Boolean(work.required),
        primary: Boolean(work.primary),
        dueExpectation: dueExpectation(work),
        actionCount:
            (work.primary_action ? 1 : 0) + (work.helpful_actions?.length ?? 0),
        outcomes,
        attentionLabels,
        followUpLines: outcomes
            .filter((o) => o.createsFollowUp)
            .map((o) => {
                const f = o.createsFollowUp!;
                const when = f.dueInDays != null ? `in ${dayWord(f.dueInDays)}` : "";
                const gate = f.whileAttemptsUnder != null ? ` (while under ${f.whileAttemptsUnder} attempts)` : "";
                return `${o.label} → follow-up${when ? ` ${when}` : ""}${gate}`;
            }),
        exitOutcome: outcomes.find((o) => o.movesThrough) ?? null,
    };
}

function dueExpectation(work: StageWorkTemplateV1): string {
    const policy = work.due_policy;
    if (!policy) return "No due expectation";
    if (policy.kind === "same_day") return "Due same day";
    const days = policy.days ?? 1;
    return `Due in ${dayWord(days)}`;
}

export type StageOverviewSummary = {
    workItems: WorkItemSummary[];
    /** Attention rules that belong to the stage rather than to any work item. */
    stageAttentionLabels: string[];
    /** Outgoing paths in product language. */
    exitPaths: Array<{ transitionRef: string; label: string; usedByOutcomes: string[]; closesRecord: boolean }>;
    /** A single line: "1 work item · 6 outcomes · 1 way out". */
    headline: string;
};

export function summarizeStageOperatingPlan(plan: StageOperatingPlanV1): StageOverviewSummary {
    const workItems = (plan.work_templates ?? []).map((w) => summarizeWorkItem(plan, w));

    const stageAttentionLabels = (plan.attention_rules ?? [])
        .filter((r) => !(r.template_key ?? "").trim())
        .map((r) => r.label || r.rule_key);

    const exitPaths = (plan.outgoing_transitions ?? []).map((t) => ({
        transitionRef: t.transition_ref,
        label: t.label?.trim() || humanTransition(t.transition_ref),
        closesRecord: Boolean(t.closes_record),
        usedByOutcomes: (plan.outcome_rules ?? [])
            .filter((r) => (r.targets ?? []).some((x) => x.transition_ref === t.transition_ref))
            .map((r) => {
                const key = (r.when_outcome_key ?? "").trim();
                if (key) {
                    return (plan.outcomes ?? []).find((o) => o.outcome_key === key)?.label || key;
                }
                // A signal-triggered rule has no outcome key — name the signal instead, so the
                // path is never shown as unused when something automatic drives it.
                return r.when_domain_signal
                    ? `${r.when_domain_signal.domain.replace(/_/g, " ")} ${r.when_domain_signal.signal} (automatic)`
                    : r.rule_key;
            }),
    }));

    const outcomeCount = new Set(workItems.flatMap((w) => w.outcomes.map((o) => o.outcomeKey))).size;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

    return {
        workItems,
        stageAttentionLabels,
        exitPaths,
        headline: [
            plural(workItems.length, "work item", "work items"),
            plural(outcomeCount, "outcome", "outcomes"),
            plural(exitPaths.length, "way out", "ways out"),
        ].join(" · "),
    };
}
