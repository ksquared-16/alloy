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
        workTemplateLabel: string;
        required: boolean;
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
    subjectId: null, entityType: null, subjectGrain: null, identitySeed: null, situation: null,
    decision: null, action: null,
    stageWorkRuntime: null, publishedStageInputs: null, workIntentRuntime: null, subjectIdentityTruth: null,
    summaryDocSeed: null,
};
const Ctx = createContext<OperationalSubject>(EMPTY);

/** Fed from the committed model — never from the drawer, never resolved locally. */
export function OperationalSubjectProvider({
    subjectId,
    identitySeed,
    situation,
    decision,
    action,
    stageWorkRuntime,
    publishedStageInputs,
    workIntentRuntime,
    subjectIdentityTruth,
    summaryDocSeed,
    subjectGrain,
    children,
}: {
    subjectId: string | null;
    subjectGrain?: { grain: OperationalGrain; subjectType: OperationalSubjectType } | null;
    identitySeed?: OpportunityDrawerQueuePreviewSeed | null;
    situation?: OperationalSubject["situation"];
    decision?: OperationalSubject["decision"];
    action?: OperationalSubject["action"];
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
            stageWorkRuntime: stageWorkRuntime ?? null,
            publishedStageInputs: publishedStageInputs ?? null,
            workIntentRuntime: workIntentRuntime ?? null,
            subjectIdentityTruth: subjectIdentityTruth ?? null,
            summaryDocSeed: summaryDocSeed ?? null,
        }),
        [subjectId, subjectGrain, identitySeed, situation, decision, action, stageWorkRuntime, publishedStageInputs, workIntentRuntime, subjectIdentityTruth, summaryDocSeed],
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * OPERATIONAL resolution — the D4 meaning. True when the committed snapshot has given the panel a
 * subject, its current business state, and a truthful action. Deliberately independent of any
 * Settlement fetch: Detail/History arriving later must never make the operator's panel "unresolved".
 */
export function isOperationallyResolved(s: OperationalSubject): boolean {
    return s.subjectId != null && s.situation != null && s.action != null;
}

/** The one read for "who is the operator working on". */
export function useOperationalSubject(): OperationalSubject {
    return useContext(Ctx);
}
