"use client";

/**
 * THE OPERATIONAL SUBJECT — one owner: committed Focus.
 *
 * Governing: the Product Office findings (Record of Attention) + alloy-runtime-kernel.md §K3.
 * "Operational Subject is the Runtime expression of Record of Attention."
 *
 * WHY THIS EXISTS. The inline Focus Panel used to read its subject from `AdminDrawerContext`, which
 * made the drawer a SECOND owner of Record of Attention. Certification proved it: D1 resolved the
 * subject (U-P4), K3 committed it, the queue rendered it — and the panel still showed "Select a
 * record to begin", because it was asking a different owner. Bridging the two with
 * `useEffect(openDrawer(...))` produced 4418 duplicate requests: two owners synchronising is a loop,
 * not a fix. So the second owner is deleted rather than reconciled.
 *
 * The drawer keeps PRESENTATION (open/close chrome, render slots, scroll). It no longer decides WHO
 * the operator is working on. That answer comes from the committed snapshot and nowhere else.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type {
    SubjectIdentityTruth,
    FocusPanelSummaryDocProjection,
} from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";

export type OperationalSubject = {
    /** Record of Attention — the committed subject, from the frozen snapshot. Null = none committed. */
    subjectId: string | null;
    /**
     * HOW the operator arrived at this subject — and therefore what "resolved" means for it.
     *
     * `operational`  chosen from an evaluated cohort. The subject has a stage, and the panel's
     *                Situation → Decision → Action is the whole point of it being open.
     * `contextual`   NAMED. No cohort was selected, so there is no stage context to assert. The record
     *                still composes; what is absent is the operational framing, not the record.
     *
     * This exists because {@link isOperationallyResolved} requires a `situation`, and a contextual
     * subject truthfully has none — leaving the panel to report itself permanently unresolved and paint
     * a spinner over a record that had in fact arrived. Absence of a stage is not absence of a subject.
     */
    attentionKind: "operational" | "contextual";
    /**
     * Record of Truth entity type for the committed subject.
     *
     * R2: read from the answer's resolved `subjectGrain`, never inferred. This was
     * `subjectId ? "opportunity" : null` — a hardcode asserting "a committed subject is an opportunity",
     * which is false for any lens whose stages declare `child`.
     */
    entityType: OperationalSubjectType | null;
    /**
     * The SUBJECT GRAIN the answer resolved, threaded and never re-derived. This context is the single
     * subject owner, so it is also the single place the grain reaches the panel.
     */
    subjectGrain: { grain: OperationalGrain; subjectType: OperationalSubjectType } | null;
    /**
     * INSTANT-IDENTITY SEED — the committed subject's family name + status, from the SAME committed
     * queue row it was selected from (never the drawer store). Lets the Focus Panel pending header
     * show the real identity on cold open instead of the generic entity noun ("Lead"), while the
     * record VM resolves. Null when the subject is not a matchable queue row (nothing to seed) or
     * nothing is committed. This is a display hint threaded through the single subject owner — it is
     * not a second owner and never gates or resolves anything.
     */
    identitySeed: OpportunityDrawerQueuePreviewSeed | null;
    /**
     * The FIRST-SIGHT operational truth, straight from the committed D1 snapshot.
     *
     * The Focus Panel used to derive Situation/Decision/Action from its record VM — a FETCH — so it
     * rendered "named but unresolved" chrome after Operational Commit and gated the terminal on a
     * Settlement request. D1 already carries all of this (U-P5/U-O4/U-O5). The panel reads it here.
     * Null only when nothing is committed (empty/error terminals).
     */
    situation: {
        stageKey: string;
        stageLabel: string;
        /** Why this stage exists — the Situation half of Situation → Decision → Action. */
        purpose: string | null;
        /**
         * The subject's OWN required work at this stage. NULL when the stage configures none for this
         * subject — a child whose effective stage is a family-segment stage has no work of its own
         * there, and showing the family's template under the child's name would be the substitution
         * the child grain exists to prevent.
         */
        workTemplateLabel: string | null;
        required: boolean | null;
    } | null;
    /** Decision context — the lens the operator entered from, and their scope within it. */
    decision: {
        workViewId: string;
        workViewLabel: string;
        scopeState: "in_scope" | "no_active_view" | "out_of_scope";
        /** When out_of_scope — destination Work View label for the Open-in affordance. */
        destinationViewId?: string | null;
        destinationViewLabel?: string | null;
    } | null;
    /** U-O5 — capability, not decoration. */
    action: { actionRef: string; label: string } | null;
    /**
     * WHY there is no action, when there is none — and therefore that the question was ANSWERED.
     *
     * A null `action` used to mean only one thing (the answer had not resolved yet), because the
     * family path refuses rather than committing without one. A child surface can be fully
     * operational with no action at all: Firefly configures none for its child-grain stages, and a
     * child riding a family-segment stage has none of its own. Without this field that legitimate
     * state is indistinguishable from "still loading", and the panel spins forever on a subject that
     * is completely resolved.
     *
     * Null when an action IS present, or when the answer genuinely has not resolved.
     */
    actionAbsence: { code: string; message: string } | null;
    /**
     * COMMIT-CRITICAL CURRENT WORK — the stage-work runtime projection (progress, requirements,
     * blocked/status, work items) carried by the D1 answer (`focusPanelStageWork.stage_work_runtime`).
     * The Current Work widget renders from THIS at commit, so the first meaningful operator action is
     * possible from the provisioning answer ALONE. The drawer VM only ENRICHES the surrounding cards.
     * Null when the answer did not resolve it (the panel degrades to the drawer-VM load).
     */
    stageWorkRuntime: StageWorkRuntimeProjection | null;
    /**
     * Commit-critical Current Work companions to `stageWorkRuntime` — the published stage config
     * (operating plan + catalog + field rules) and the work-intent runtime the canonical
     * `CurrentWorkCard` reads. Carried by the answer's `focusPanelStageWork` slice so the ATOMIC
     * commit-critical Focus Panel renders the SAME card the resolved VM does (A). Null when the answer
     * did not resolve them (the panel degrades to the drawer-VM load).
     */
    publishedStageInputs: PublishedStageInputsForCurrentWork | null;
    workIntentRuntime: WorkIntentRuntimeProjection | null;
    /**
     * A — commit-critical Household + Children snapshot (primary contact + children roster), carried by
     * the answer so those cards render MEANINGFUL at commit rather than blank reserved cells. Null when
     * the answer did not resolve it (the cards reserve; the drawer VM fills them).
     */
    subjectIdentityTruth: SubjectIdentityTruth | null;
    /**
     * A — the published Summary composition for the committed scope, carried by the answer so the
     * committed panel presents the PUBLISHED composition immediately (no default-doc first frame, no
     * post-commit reflow). `{doc: null}` = resolved, nothing published applies (code default). Null =
     * the answer did not resolve it (the doc provider degrades to its own fetch).
     */
    summaryDocSeed: FocusPanelSummaryDocProjection | null;
};

const EMPTY: OperationalSubject = {
    subjectId: null, attentionKind: "operational", entityType: null, subjectGrain: null, identitySeed: null, situation: null,
    decision: null, action: null, actionAbsence: null,
    stageWorkRuntime: null, publishedStageInputs: null, workIntentRuntime: null, subjectIdentityTruth: null,
    summaryDocSeed: null,
};
const Ctx = createContext<OperationalSubject>(EMPTY);

/** Fed from the committed model — never from the drawer, never resolved locally. */
export function OperationalSubjectProvider({
    subjectId,
    attentionKind = "operational",
    identitySeed,
    situation,
    decision,
    action,
    actionAbsence,
    stageWorkRuntime,
    publishedStageInputs,
    workIntentRuntime,
    subjectIdentityTruth,
    summaryDocSeed,
    subjectGrain,
    children,
}: {
    subjectId: string | null;
    /** See {@link OperationalSubject.attentionKind}. Omitted = operational, as every caller was. */
    attentionKind?: OperationalSubject["attentionKind"];
    subjectGrain?: { grain: OperationalGrain; subjectType: OperationalSubjectType } | null;
    identitySeed?: OpportunityDrawerQueuePreviewSeed | null;
    situation?: OperationalSubject["situation"];
    decision?: OperationalSubject["decision"];
    action?: OperationalSubject["action"];
    actionAbsence?: OperationalSubject["actionAbsence"];
    stageWorkRuntime?: StageWorkRuntimeProjection | null;
    publishedStageInputs?: PublishedStageInputsForCurrentWork | null;
    workIntentRuntime?: WorkIntentRuntimeProjection | null;
    subjectIdentityTruth?: SubjectIdentityTruth | null;
    summaryDocSeed?: FocusPanelSummaryDocProjection | null;
    children: ReactNode;
}) {
    const value = useMemo<OperationalSubject>(
        () => ({
            subjectId,
            attentionKind,
            // R2: the answer decides what the subject IS. `subjectGrain` is absent only on paths that
            // predate the answer carrying it (enriched/drawer-VM producer, fixtures), where the historical
            // family shape is the compatible reading — never a grain guess for a child answer, which
            // always supplies it.
            entityType: subjectId ? subjectGrain?.subjectType ?? "opportunity" : null,
            subjectGrain: subjectGrain ?? null,
            identitySeed: identitySeed ?? null,
            situation: situation ?? null,
            decision: decision ?? null,
            action: action ?? null,
            actionAbsence: actionAbsence ?? null,
            stageWorkRuntime: stageWorkRuntime ?? null,
            publishedStageInputs: publishedStageInputs ?? null,
            workIntentRuntime: workIntentRuntime ?? null,
            subjectIdentityTruth: subjectIdentityTruth ?? null,
            summaryDocSeed: summaryDocSeed ?? null,
        }),
        [subjectId, attentionKind, subjectGrain, identitySeed, situation, decision, action, actionAbsence, stageWorkRuntime, publishedStageInputs, workIntentRuntime, subjectIdentityTruth, summaryDocSeed],
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * OPERATIONAL resolution — the D4 meaning. True when the committed snapshot has given the panel a
 * subject, its current business state, and a truthful action. Deliberately independent of any
 * Settlement fetch: Detail/History arriving later must never make the operator's panel "unresolved".
 */
export function isOperationallyResolved(s: OperationalSubject): boolean {
    // CONTEXTUAL ATTENTION IS RESOLVED WHEN THE SUBJECT IS PRESENT — there is no further question.
    //
    // Situation → Decision → Action describes a subject's position in a COHORT, and no cohort was
    // selected here. Requiring a `situation` would report the panel unresolved forever and paint a
    // spinner over a subject that had already arrived — the same failure the clause below fixed for
    // children, one grain over. Having no stage is not the same as not having arrived.
    if (s.attentionKind === "contextual") return s.subjectId != null;
    // Resolution is that the ACTION QUESTION HAS BEEN ANSWERED — not that the answer was "yes".
    // Requiring `action != null` outright made "this stage configures no action for a child", a fully
    // resolved and perfectly ordinary state, render as a permanent loading spinner. The family path is
    // unchanged by this: it always carries an action, and never an absence.
    if (s.subjectId == null || s.situation == null) return false;
    if (s.action != null || s.actionAbsence != null) return true;
    // Child stages often author Work Templates without a primary action_ref. What's Next still
    // commits from stage-work / situation. Treating that as unresolved drops commitCritical after
    // Settlement and lets the family Lead mission (Contact Family) paint on a Waitlist child.
    return s.subjectGrain?.grain === "child";
}

/** The one read for "who is the operator working on". */
export function useOperationalSubject(): OperationalSubject {
    return useContext(Ctx);
}
