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
import type { OperationalContextSignals } from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelOperationalProjection } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";
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
    /**
     * The server's operational projection for this subject, COMMIT frame.
     *
     * Same contract the settled drawer VM carries, produced by the same server chokepoint, so the
     * cards render decided truth from the first frame and the switch to settled changes transport
     * rather than authority.
     */
    operationalProjection: FocusPanelOperationalProjection | null;
    workIntentRuntime: WorkIntentRuntimeProjection | null;
    /**
     * A — commit-critical Household + Children snapshot (primary contact + children roster), carried by
     * the answer so those cards render MEANINGFUL at commit rather than blank reserved cells. Null when
     * the answer did not resolve it (the cards reserve; the drawer VM fills them).
     */
    subjectIdentityTruth: SubjectIdentityTruth | null;
/**
 * THE AUTHORITATIVE PARTICIPATION, resolved once on the server and carried to the browser.
 *
 * IDENTITY, NOT PERMISSION. It is the member id and the OCM row that names it, and nothing else —
 * no profile, no photo, no health facts, no authorization answer. Every producer that consumes it
 * still resolves its own grants at request time.
 *
 * It exists because the server already knew this and the browser did not. Measured on deployed
 * 41c67ec17: the document's producers ran Attendance (141ms) and Health (470ms) and put their
 * answers in `operationalProjection`, but the browser decides card readiness from its OWN context,
 * which had no participantScope — so those cards stayed reserved and remounted only when the
 * drawer settled, ~3.5s later, to learn what the answer already carried.
 */
    resolvedParticipant: { participationId: string; customerMemberId: string } | null;
    /** The answer's resolved tour signal; null means not established, not "no tour". */
    resolvedTour: OperationalContextSignals["tour"] | null;
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
    stageWorkRuntime: null, operationalProjection: null, workIntentRuntime: null, subjectIdentityTruth: null,
    resolvedParticipant: null,
    resolvedTour: null,
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
    operationalProjection,
    workIntentRuntime,
    subjectIdentityTruth,
    resolvedParticipant,
    resolvedTour,
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
    operationalProjection?: FocusPanelOperationalProjection | null;
    workIntentRuntime?: WorkIntentRuntimeProjection | null;
    subjectIdentityTruth?: SubjectIdentityTruth | null;
    resolvedParticipant?: { participationId: string; customerMemberId: string } | null;
    resolvedTour?: OperationalContextSignals["tour"] | null;
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
            operationalProjection: operationalProjection ?? null,
            workIntentRuntime: workIntentRuntime ?? null,
            subjectIdentityTruth: subjectIdentityTruth ?? null,
            resolvedParticipant: resolvedParticipant ?? null,
            resolvedTour: resolvedTour ?? null,
            summaryDocSeed: summaryDocSeed ?? null,
        }),
        [subjectId, attentionKind, subjectGrain, identitySeed, situation, decision, action, actionAbsence, stageWorkRuntime, operationalProjection, workIntentRuntime, subjectIdentityTruth, resolvedParticipant, resolvedTour, summaryDocSeed],
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

/**
 * STRUCTURAL resolution — the P0-7.1 meaning. True when the committed snapshot has given the panel
 * enough AUTHORITATIVE DESTINATION information to present the real configured surface structure.
 *
 * ── WHY THIS IS A SEPARATE QUESTION FROM {@link isOperationallyResolved} ──
 *
 * One predicate was answering two questions, and the narrower of the two was winning. Structure and
 * meaning are different facts with different owners:
 *
 *   "what cells does this surface have"   ← the PUBLISHED COMPOSITION (`summaryDocSeed`)
 *   "what do those cells SAY"             ← situation / action / stage work
 *
 * The published composition is what the grid consumes, and it is carried on the provisioning answer
 * record-independently. Knowing it is sufficient to commit the real configured structure; the cards
 * then say what they truthfully can, using the reserved/resolving presentation P0-7.4 already
 * deployed. Nothing here invents business meaning to fill a cell.
 *
 * ── THE BRANCH THIS ACTUALLY OPENS ──
 *
 * `isOperationallyResolved` returns false for a FAMILY-grain subject that has a situation but no
 * configured action and no `actionAbsence` — a real, ordinary state. In that window the published
 * composition is already in hand and the panel still rendered its cold "Thinking…" owner, because
 * the only gate available asked a semantic question about a structural decision. Structure was
 * withheld by predicate, not by geometry: the audit established the grid itself needs no card data.
 *
 * On the common child-grain path both predicates flip together, because `situation` and
 * `summaryDocSeed` arrive on the SAME provisioning answer (`op`). That is measured, not assumed —
 * so this split is a correctness and contract change, not a claimed speed-up on that path. What it
 * guarantees is that structure can never again be gated on a fact structure does not need.
 */
export function isStructurallyResolved(s: OperationalSubject): boolean {
    if (s.subjectId == null) return false;
    // The published composition IS the structure. Without it there is no authoritative configured
    // card set to present, and fabricating one is exactly the false construction the doctrine bans.
    return s.summaryDocSeed != null;
}

/**
 * SEMANTIC resolution — the same question {@link isOperationallyResolved} has always asked, under
 * the name the doctrine now uses for it. Deliberately an alias rather than a replacement: the
 * original name is referenced by deployed certification and by the D4 contract, and renaming it
 * would be a doctrine edit this slice has no authority to make.
 */
export function isSemanticallyResolved(s: OperationalSubject): boolean {
    return isOperationallyResolved(s);
}

/** The one read for "who is the operator working on". */
export function useOperationalSubject(): OperationalSubject {
    return useContext(Ctx);
}
