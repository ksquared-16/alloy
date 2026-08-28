"use client";

import { useMemo } from "react";

import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { adaptBusinessProcessEvidenceToProcessCard } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";
import ProcessCard from "@/components/operationalCards/ProcessCard";
import { buildCurrentWorkActivityPreviewItemsFromContext } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import { currentWorkActivityRowKey } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActivityRowKey";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

/** Two identities per stage, then a count. A busy family must not destroy the rail. */
const MAX_MARKERS_PER_STAGE = 2;

/**
 * THE BUSINESS PROCESS CARD — where this record has been, where it is, and what to do about it.
 *
 * ── IT COMPOSES; IT DOES NOT OWN ──
 *
 * Every fact arrives decided. Stages and their order come from the department lifecycle;
 * the case's stage from the operational context; participants and their stages from the
 * participation rows; work from Current Work; activity from the canonical activity projection.
 * `buildBusinessProcessCardEvidence` does that composition — this file only phrases it.
 *
 * ── THE CASE MARKER IS THE CASE'S ──
 *
 * Participant markers sit UNDER a stage; they never decide which stage is `current`. A case at Tour
 * with a child at Waitlist shows exactly that: the case marker at Tour, the child's marker at
 * Waitlist. Any other behaviour would let one child's state rewrite the family's position.
 *
 * ── PLACEMENT IS BY KEY ──
 *
 * The evidence places participants by `stageKey`. A participant it could not place is not dropped —
 * it is reported, so a missing marker looks like the gap it is instead of a smaller family.
 */
export default function BusinessProcessCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(
        () =>
            buildBusinessProcessCardEvidence(context, {
                // THE CANONICAL CARRIER. The case remains the panel subject; this only says which
                // participant is the operator's current concern. Absent is ordinary and means no
                // emphasis — never "pick one".
                selectedParticipantId: context.participantScope?.participationId ?? null,
            }),
        [context],
    );

    const viewerTimeZone = useAdminViewerTimezone();
    // The SAME canonical projection the Focus Panel activity mode reads. No Process-local activity
    // store and no separate fetch.
    const activity = useMemo(
        () =>
            buildCurrentWorkActivityPreviewItemsFromContext(context, {
                timeZone: viewerTimeZone,
                limit: 25,
            }),
        [context, viewerTimeZone],
    );

    /*
     * CANONICAL ACTIONS, RESOLVED BY THE PROVIDER.
     *
     * Business Process replaced Journey + What's Next precisely so progression and the work's
     * commands live together, and the card was rendering no actions at all. These are the registry's
     * own resolved actions for this record — primary first, then secondary — never a hardcoded
     * Waitlist button. The registry decides emphasis; the card only renders it.
     */
    const actions = useMemo(() => {
        const slots = context.recordHeaderActions ?? null;
        if (!slots) return [];
        return [
            /*
             * EXACTLY ONE FILLED ACTION.
             *
             * The registry's `primary` slot can hold several, and marking all of them primary put
             * two filled green buttons side by side — the approved specimen fills one and outlines
             * the rest. Emphasis is a ranking, not a category: if everything is primary, nothing is.
             * The registry still decides the ORDER and which action leads; this only decides how
             * many earn the fill.
             */
            ...(slots.primary ?? []).map((a, i) => ({ key: a.key, label: a.label, primary: i === 0 })),
            ...(slots.secondary ?? []).map((a) => ({ key: a.key, label: a.label, primary: false })),
        ];
    }, [context.recordHeaderActions]);

    const processEvidence = useMemo(
        () =>
            adaptBusinessProcessEvidenceToProcessCard({
                evidence,
                subjectLabel: context.subject?.label ?? null,
                // `occurredAt` is already the formatted, viewer-timezone string the previous card
                // rendered; the locked component calls that field `when`.
                activity: activity.map((a) => ({ id: a.id ?? null, label: a.label, when: a.occurredAt ?? "" })),
                actions,
            }),
        [evidence, context.subject?.label, activity, actions],
    );

    /*
     * ONE PRESENTATION. This file no longer draws a card — it supplies canonical evidence to the
     * locked component the design lab renders from fixtures. Maintaining a production approximation
     * beside the approved specimen is what QA failed, and the only way that cannot recur is for
     * there to be nothing here to drift.
     */
    return (
        <ProcessCard
            evidence={processEvidence}
            receded={receded}
            fallbackTitle={model.title}
            onViewAllActivity={() => coordination?.openFocusPanelMode?.("activity")}
        />
    );
}
