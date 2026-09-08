/**
 * CANONICAL EVIDENCE → THE LOCKED PROCESS CARD'S INPUT.
 *
 * ── WHY AN ADAPTER AND NOT A SECOND CARD ──
 *
 * There were two implementations of one approved card: the locked specimen in the design lab and a
 * production approximation that drifted from it. QA failed the difference, correctly — "same
 * information" is not fidelity. There is now ONE presentation
 * (`components/operationalCards/ProcessCard.tsx`), rendered by both the lab and the real Focus
 * Panel, and this is the only thing that differs between them: the lab supplies fixture evidence,
 * production supplies canonical evidence, and both arrive in the same shape.
 *
 * The mapping is deliberately DUMB. It renames and formats; it decides nothing. Every judgement —
 * which stage is current, where a participant sits, whether participants are aligned, what the work
 * line says — was already made by `buildBusinessProcessCardEvidence` from canonical truth. A mapper
 * that re-decided any of that would be a second answer, which is exactly how the two drifted apart.
 */

import type {
    BusinessProcessCardEvidence,
    BusinessProcessParticipant,
} from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import type {
    ProcessAction,
    ProcessActivityRow,
    ProcessChildState,
    ProcessEvidence,
    ProcessStage,
} from "@/lib/cardLab/cardLabTypes";

export type ProcessCardActivityItem = {
    id?: string | null;
    label: string;
    when: string;
};

/**
 * One command as the published Business Process configured it, already resolved through the
 * registered action spine. Emphasis, order and availability all arrive decided — see
 * `projectProcessCardCommands`, which is the only sanctioned producer of this shape.
 */
export type ProcessCardActionInput = {
    key: string;
    label: string;
    /** Configuration's lead command. Exactly one command carries it. */
    primary?: boolean;
    /** Configured but not currently executable, per the action system. */
    disabled?: boolean;
    disabledReason?: string | null;
    /** Executes through the shared command host. */
    onInvoke?: () => void;
    /**
     * Operator intent, ahead of the click — hover, keyboard focus, or opening the group this
     * command sits in. The card reports the gesture; the runtime decides what (if anything) is
     * worth warming for it. Never a side effect the operator can see.
     */
    onIntent?: () => void;
    /** Secondary operations on the same operational concept (see `ProcessAction.menu`). */
    menu?: ProcessCardActionInput[];
};

function childState(p: BusinessProcessParticipant): ProcessChildState {
    return {
        name: p.name,
        // The participant's own state label, which may legitimately differ from the stage's.
        stage: p.stageLabel ?? p.stageKey,
        /*
         * `stageKey` here must match a rendered stage LABEL, because that is what the locked card
         * places markers against. The evidence already resolved the participant onto a real stage,
         * so its label is carried rather than the key — "Waitlisted" and "Waitlist" are different
         * vocabularies and matching one to the other would silently drop a marker.
         */
        stageKey: p.stageLabel ?? p.stageKey,
        since: null,
        scoped: p.scoped,
        imageUrl: p.imageUrl,
        actions: [],
    } as ProcessChildState;
}

export function adaptBusinessProcessEvidenceToProcessCard(input: {
    evidence: BusinessProcessCardEvidence;
    subjectLabel: string | null;
    activity: readonly ProcessCardActivityItem[];
    actions: readonly ProcessCardActionInput[];
}): ProcessEvidence {
    const { evidence } = input;

    const stages: ProcessStage[] = evidence.stages.map((s) => ({
        label: s.label,
        state: s.state,
        // The two bounded annotation slots, exactly as configuration filled them. Empty is a real
        // answer: a process that declares no annotations renders none.
        primarySupport: s.primarySupport,
        secondarySupport: s.secondarySupport,
    }));

    /*
     * PARTICIPANTS ARE ALWAYS CARRIED, and the card decides how to show them.
     *
     * The locked component collapses markers to the aligned summary when every participant sits at
     * the case's stage, and renders individual markers when they diverge. Filtering here would take
     * that decision away from the presentation and is why the aligned summary never rendered.
     */
    const childStates: ProcessChildState[] = evidence.participants.map(childState);

    const activity: ProcessActivityRow[] = input.activity.map((a) => ({
        id: a.id ?? null,
        label: a.label,
        when: a.when,
    }));

    /*
     * IDENTITY IS CARRIED, NOT REBUILT. The command's `key` is what execution and the shared
     * workspace's intent match key on; dropping it here would leave the card matching commands by
     * their label, which configuration is free to rename.
     */
    const actions: ProcessAction[] = input.actions.map((a) => ({
        key: a.key,
        label: a.label,
        primary: a.primary,
        disabled: a.disabled,
        disabledReason: a.disabledReason ?? null,
        onInvoke: a.onInvoke,
        // Intent travels with the command. Dropping it here is invisible — the card still renders
        // and still executes — and the only symptom is that every command opens cold.
        onIntent: a.onIntent,
        ...(a.menu?.length
            ? {
                  menu: a.menu.map((m) => ({
                      key: m.key,
                      label: m.label,
                      primary: m.primary,
                      disabled: m.disabled,
                      disabledReason: m.disabledReason ?? null,
                      onInvoke: m.onInvoke,
                      onIntent: m.onIntent,
                  })),
              }
            : {}),
    }));

    return {
        // Lab-only specimen label; never rendered inside the card.
        caseLabel: "",
        subjectLabel: input.subjectLabel ?? "",
        // The lens is deliberately not carried: it renders as a chip and nothing else, and it must
        // never reach the stage.
        sourceWorkView: null,
        childStates,
        /*
         * THE PROCESS NAME — and emphatically not `evidence.processLabel`.
         *
         * `processLabel` is sourced from `context.businessProcess.label`, which is the current
         * STAGE. Passing it titled the card "WAITLIST" directly above a rail whose current column
         * already said Waitlist. The name is now carried separately, resolved from the department's
         * configured lifecycle process — the same record the rail's stages come from — so the card
         * titles itself "ENROLLMENT", as the approved specimen does.
         *
         * Still falls back to the registered card identity when a department declares no process:
         * an unnamed process is a real state, and the card must not assert a name it does not have.
         */
        processLabel: evidence.processName ?? "",
        stages,
        currentStageLabel: evidence.caseStageLabel ?? "",
        workLine: evidence.currentWork?.answerLine ?? "",
        dueLine: evidence.currentWork?.supportingLine ?? null,
        actions,
        stillNeeded: evidence.currentWork?.stillNeeded ?? [],
        activity,
        participantsLabel: evidence.participantsLabel,
    };
}
