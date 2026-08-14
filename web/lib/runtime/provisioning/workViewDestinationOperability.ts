/**
 * CAN A SUBJECT ACTUALLY COMPOSE IN THIS LENS? — one definition, importable by anyone offering a
 * Work View as a destination.
 *
 * This rule lived only inside `composeWorkUnitProvisioningAnswer`, which is correct while the answer
 * is the only thing that decides whether a surface can be entered. It stopped being sufficient the
 * moment Search began OFFERING lenses: a destination that cannot compose is a false green, and the
 * only way to know before navigating is to ask the same question the answer asks on arrival.
 *
 * Search must not re-derive it. Two readings of "is this lens enterable" is exactly how a pill came to
 * light up over a Focus Panel with zero cells — the `tours` false-green, which reported PASSING while
 * the answer behind it was refusing `no_truthful_primary_action`.
 *
 * ── THE RULE IS GRAIN-SPECIFIC, AND DELIBERATELY SO ──
 *
 * FAMILY: a family surface claiming `operational` on identity alone is not operational. It needs a
 * resolvable Mission stage, a work template on that stage, and a reachable primary action — unless
 * the Mission was EPP-derived onto a child-segment stage, which legitimately publishes templates
 * without actions.
 *
 * CHILD: refusing on a missing primary action would make the child surface unreachable for a
 * perfectly coherent configuration. Firefly's child-grain stages (`decision`/`waitlist`/`enrolling`/
 * `enrolled`) configure NO primary action at all, and the child path is right to render the absence
 * deliberately rather than refuse. So a child lens is enterable when the child's effective stage is
 * an ACTIVE CONFIGURED stage whose journey segment resolves — the two things the child composition
 * itself refuses on.
 *
 * Reading these as one rule is what produced the original defect in reverse: it would have hidden
 * Waitlist from a waitlisted child, the one destination that is actually true.
 */

import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveJourneySegment } from "@/lib/lifecycle/grainVocabulary";

export type DestinationOperability = { ok: true } | { ok: false; reason: string };

/**
 * The FAMILY rule, stated once. `composeWorkUnitProvisioningAnswer` calls this for its own refusal,
 * so the answer and any surface offering the destination cannot drift apart.
 *
 * @param missionDerivedFromEffectiveParticipants the Mission stage came from participant EPP rather
 *   than the context's own `stage_key`. Child-segment stages reached this way legitimately carry no
 *   primary action; What's Next projects from templates instead.
 */
export function familyStageDestinationOperability(
    stage: LifecycleBuilderStageRecord | null | undefined,
    opts: { missionDerivedFromEffectiveParticipants: boolean },
): DestinationOperability {
    if (!stage) {
        return { ok: false, reason: "subject holds no resolvable Mission stage" };
    }
    const plan = stage.stage_operating_plan_v1 ?? null;
    const template = plan?.work_templates?.find((t) => t.primary) ?? plan?.work_templates?.[0] ?? null;
    if (!plan || !template) {
        return {
            ok: false,
            reason: `stage "${stage.key}" offers no work templates — the answer will not claim operational on identity alone`,
        };
    }
    const actionRef = template.primary_action?.action_ref ?? null;
    if (!actionRef && !opts.missionDerivedFromEffectiveParticipants) {
        return {
            ok: false,
            reason: `stage "${stage.key}" offers no reachable primary action — the answer will not claim operational on identity alone`,
        };
    }
    return { ok: true };
}

/**
 * The CHILD rule: enterable when the effective stage is an active configured stage whose journey
 * segment resolves. An absent primary action is a RESULT here, not a refusal.
 *
 * `stages` is the process's active stage set — the same set the child composition resolves against,
 * so "not an active configured stage" means the same thing in both places.
 */
export function childStageDestinationOperability(
    stageKey: string | null | undefined,
    stages: readonly LifecycleBuilderStageRecord[],
): DestinationOperability {
    const key = (stageKey ?? "").trim();
    if (!key) {
        return {
            ok: false,
            reason: "the child's effective stage is unresolved — neither the participation nor its family case holds a stage",
        };
    }
    const stage = stages.find((s) => s.key === key) ?? null;
    if (!stage) {
        return {
            ok: false,
            reason: `child holds effective stage "${key}" which is not an active configured stage`,
        };
    }
    const segment = resolveJourneySegment({
        planSegment: stage.stage_operating_plan_v1?.journey_segment ?? null,
        stageGrain: stage.grain ?? null,
    });
    if (!segment.ok) {
        return { ok: false, reason: `stage "${stage.key}": ${segment.reason}` };
    }
    return { ok: true };
}
