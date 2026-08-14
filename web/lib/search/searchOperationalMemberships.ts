/**
 * OPERATIONAL MEMBERSHIPS — which configured Work Views does this subject ACTUALLY belong to?
 *
 * ── THE CORRECTION THIS MODULE EXISTS TO MAKE ──
 *
 * A Process stage answers "where is this participant in the Process". A Work View answers "which
 * configured operational cohort does this subject currently belong to". They are not the same
 * question, and Search was answering the second with the first.
 *
 * Live staging proves they come apart. The Kurzman Family sits at stage `waitlist` and is
 * simultaneously in the **All** and **Tours** cohorts — Tours because its published predicates are
 * `has_active_tour = true AND tour_date = next:7:days`, deliberately carrying NO stage predicate
 * ("that kept Waitlist families out"). No stage→view mapping can produce that, and a mapping that
 * tried would have to invent it.
 *
 * So membership is EVALUATED, never inferred. Stage may rank a destination; it may not create one.
 *
 * ── THIS MODULE ADDS NO SEMANTICS OF ITS OWN ──
 *
 * Every judgement is delegated to the machinery the Work View runtime already uses, so Search and the
 * view itself cannot disagree about who is in it:
 *
 *   lens Row Grain      `resolveLensRowGrain`               (declared, else stage-derived)
 *   lens stage set      `lensStageKeys`                     (one reading, shared)
 *   child membership    `childMatchesLens`                  (the provider's rule, restated in memory)
 *   family membership   `recordMatchesWorkView`             (the SAME predicate evaluator as the rows)
 *   family Mission      `resolveContextMissionStages`       (EPP, not raw stage_key)
 *   can it compose      `*StageDestinationOperability`      (the answer's own refusal rule)
 *
 * ── GRAIN IS A MEMBERSHIP RULE, NOT A PRESENTATION DETAIL ──
 *
 * A child is not a member of a family-grain lens. The row in **All** is the Kurzman Family, not
 * Lennon; sending a search for Lennon there would land the operator on a family row and call it
 * Lennon — the same wrong-subject substitution the reported defect makes. The platform states this
 * already, in `childGrainScope.ts`: "a family lens is not a place a child can be, so it is not a
 * destination to offer."
 *
 * The consequence is asymmetric and intended: a household does not inherit its children's lenses, and
 * children do not inherit their household's.
 */

import { childMatchesLens } from "@/lib/runtime/provisioning/childGrainScope";
import {
    childStageDestinationOperability,
    familyStageDestinationOperability,
} from "@/lib/runtime/provisioning/workViewDestinationOperability";
import { resolveLensRowGrain } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { lensStageKeys } from "@/lib/lifecycle/lensStageKeys";
import { recordWorkViewMembership } from "@/lib/lifecycle/operationalProjection";
import {
    effectiveParticipantStageKeysFromRow,
    resolveContextMissionStages,
} from "@/lib/process/engine/resolveContextMissionStages";
import type { SearchConfiguredProcess } from "@/lib/search/searchProcessConfiguration";

/** The grain at which a subject occupies operational work. */
export type MembershipSubjectGrain = "child" | "family";

/**
 * One truthful, permission-safe, operationally-composable membership.
 *
 * `membershipReason` is DIAGNOSTIC — it explains the evaluation to a configuration owner and is not
 * operator-facing copy. Nothing downstream may render it as an explanation of someone's situation.
 */
export type SearchOperationalMembership = {
    processKey: string;
    processLabel: string;
    workViewId: string;
    workViewLabel: string;
    /** The grain the lens rows at — the subject the destination will actually select. */
    rowGrain: MembershipSubjectGrain;
    /**
     * THE WORK VIEW ROW IDENTITY — what the runtime selects on, and what the membership guard matches
     * against (`subjectRows[].entityId` in the provisioning answer).
     *
     *   child grain    `process_instances.id`   the PARTICIPATION
     *   family grain   `opportunities.id`       the case
     *
     * Deliberately NOT the durable child id. One child can hold two participations across two leads,
     * and those are two different rows — so the durable id names no single row, and sending it would
     * reproduce the very failure this field exists to remove: a plausible identity that matches
     * nothing in the evaluated page, refused as `subject_unavailable`.
     */
    operationalMemberId: string;
    membershipReason: string;
};

export type MembershipSubject = {
    grain: MembershipSubjectGrain;
    /**
     * The subject's own effective stage. For a child this is the participation's stage (falling back
     * to its family case, exactly as the provider resolves it); for a family it is the context stage.
     */
    stageKey: string | null;
    /**
     * The canonical Work View row identity for this subject AT THIS GRAIN — the participation id for
     * a child, the case id for a family.
     *
     * Absent means Search cannot say how the runtime would select this member, and no destination is
     * emitted. That is the added truth gate: membership can be true while the way to *reach* it is
     * unknown, and offering it anyway is what produced "That record isn't in this Work View".
     */
    memberRowId?: string | null;
    /**
     * The subject's materialized operational row — required for FAMILY membership, because family
     * predicates read fields the queue attaches (`has_active_tour`, tour wall date, …), not raw
     * columns. Absent row ⇒ no family membership is claimed: unproven is not the same as true.
     */
    row?: Record<string, unknown> | null;
};

/**
 * Every Work View of one process that this subject actually belongs to AND can compose in.
 *
 * Returns `[]` rather than throwing for every absence — an unknown is never an offer. Ordering
 * follows the tenant's configured display order, which the canonical reader already normalized.
 */
export function resolveOperationalMemberships(params: {
    process: SearchConfiguredProcess;
    subject: MembershipSubject;
}): SearchOperationalMembership[] {
    const { process, subject } = params;

    // PERMISSION FIRST. A membership the operator cannot reach is not a membership Search may reveal:
    // naming the cohort would itself disclose where the subject is.
    if (!process.operator_has_access) return [];
    if (!process.work_views.length) return [];

    // THE ADDED TRUTH GATE: a destination Search cannot say how to SELECT is not a destination.
    // Membership can be true while the row identity is unknown (a participation Search never read, a
    // family whose row was not materialized) — and offering it then is exactly what delivered the
    // operator to "That record isn't in this Work View".
    const memberRowId = (subject.memberRowId ?? "").trim();
    if (!memberRowId) return [];

    const out: SearchOperationalMembership[] = [];

    for (const view of process.work_views) {
        if (view.visible_in_runtime === false) continue;

        // An unresolvable lens is EXCLUDED rather than assumed. Guessing its grain here is exactly the
        // defaulting that sends a subject to a surface which then refuses itself.
        const grain = resolveLensRowGrain(view, process.stages);
        if (!grain.ok) continue;
        if (grain.grain !== subject.grain) continue;

        const decided =
            subject.grain === "child"
                ? decideChild(subject, view, process)
                : decideFamily(subject, view, process);
        if (!decided) continue;

        out.push({
            processKey: process.key,
            processLabel: process.label,
            workViewId: view.id,
            workViewLabel: view.label,
            rowGrain: grain.grain,
            operationalMemberId: memberRowId,
            membershipReason: decided,
        });
    }

    return out;
}

/**
 * A child's membership was already decided by the provider, and not by an opportunity predicate — a
 * child row carries none of the fields those predicates read. So the question asked here is the one
 * the provider answered: is the child's effective stage in the lens's stage set (and a
 * stage-independent child lens holds every live participation by definition)?
 */
function decideChild(
    subject: MembershipSubject,
    view: Parameters<typeof lensStageKeys>[0],
    process: SearchConfiguredProcess,
): string | null {
    const isMember = childMatchesLens({ stageKey: subject.stageKey }, view, {
        stageKeysForView: lensStageKeys,
    });
    if (!isMember) return null;

    const operable = childStageDestinationOperability(subject.stageKey, process.stages);
    if (!operable.ok) return null;

    const stages = lensStageKeys(view);
    return stages.length
        ? `child stage "${subject.stageKey}" is in the lens stage set [${stages.join(",")}]`
        : "stage-independent child lens — a live participation is in it by definition";
}

/**
 * A family's membership runs the lens's predicates over its materialized row through the SAME
 * evaluator the rows and counts use, so Search cannot report a cohort the view would not.
 *
 * Operability is asked of the MISSION stage (EPP-derived), not the raw context stage — that is the
 * stage the surface would actually compose, and asking about a different one would answer a question
 * nobody navigates to.
 */
function decideFamily(
    subject: MembershipSubject,
    view: Parameters<typeof lensStageKeys>[0],
    process: SearchConfiguredProcess,
): string | null {
    const row = subject.row ?? null;
    // No materialized row ⇒ the predicates cannot be evaluated. Silence, not a guess.
    if (!row) return null;

    // `fullySupported` matters here in a way it does not for a count. Unsupported fields/operators
    // FAIL OPEN under AND — a count would rather over-include than hide work — but an unevaluated
    // predicate cannot be evidence of membership. Offering the destination anyway would send the
    // operator to a view that does not contain the subject, which is the whole defect.
    const membership = recordWorkViewMembership(row, view);
    if (!membership.pass || !membership.fullySupported) return null;

    const mission = resolveContextMissionStages({
        contextStageKey: subject.stageKey,
        effectiveParticipantStageKeys: effectiveParticipantStageKeysFromRow(row),
        workViewLensStageKeys: lensStageKeys(view),
    });
    const missionStage =
        process.stages.find((s) => s.key === mission.primaryMissionStageKey) ?? null;

    const operable = familyStageDestinationOperability(missionStage, {
        missionDerivedFromEffectiveParticipants: mission.derivedFromEffectiveParticipants,
    });
    if (!operable.ok) return null;

    const predicates = view.filters_v1?.length ?? 0;
    return predicates
        ? `family row satisfies ${predicates} configured predicate(s)`
        : "catch-all lens — every record in the process population is in it";
}
