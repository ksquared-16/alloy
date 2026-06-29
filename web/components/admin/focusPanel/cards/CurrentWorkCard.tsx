"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardInlineOverlay from "@/components/admin/focusPanel/cards/CardInlineOverlay";
import {
    buildCurrentWorkCardEvidence,
    inferWorkItemOwner,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type {
    OperationalContext,
    OperationalWorkItem,
} from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    /** Owner card: receives cross-card handoffs to a specific work item. */
    coordination?: FocusPanelCoordination;
};

/**
 * Current Work operational card (Work archetype). Answers "What needs to happen
 * next on this record?". It INSTRUCTS — it never becomes a centered Focus Card.
 * Collapsed, it shows the 2-second answer (primary item + due). The full queue
 * appears as a card-anchored INLINE OVERLAY that covers the card below WITHOUT
 * moving the base surface. Clicking an item HANDS OFF to the card that OWNS its
 * truth (Contact family → Household, enrollment → Children); ownerless items are
 * inert guidance. Pure over `context.signals.work` (no fetch).
 *
 * @see docs/platform/operator/card-archetypes.md (Work)
 * @see docs/sprints/06_2026/focus-panel-inline-overlay-finalization
 */
export default function CurrentWorkCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(() => buildCurrentWorkCardEvidence(context), [context]);
    const [overlayOpen, setOverlayOpen] = useState(false);

    const openWorkItem = (item: OperationalWorkItem) => {
        const owner = inferWorkItemOwner(item);
        if (owner && coordination) {
            setOverlayOpen(false);
            coordination.requestFocus(owner.card, owner.focus);
        }
    };

    const hasItems = !evidence.isEmpty && evidence.items.length > 0;

    // Collapsed body = the 2-second answer only (the insight + supporting line carry
    // the primary item and its due). The full queue lives in the inline overlay.
    const body = evidence.isEmpty ? (
        <div className="alloy-os-household__summary" data-work-empty="true">
            <p className="alloy-os-household__row-detail">All caught up — nothing needs action</p>
        </div>
    ) : null;

    const footerAction = hasItems ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setOverlayOpen((v) => !v)}
            data-work-action="view"
            aria-expanded={overlayOpen}
        >
            View →
        </button>
    ) : null;

    return (
        <div
            className="alloy-os-household alloy-os-currentwork"
            data-work-card="true"
            data-work-card-perspective={evidence.isEmpty ? "empty" : "diagnostic"}
            data-fp-overlay-open={overlayOpen ? "true" : undefined}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={evidence.supportingLine}
                iconName={model.iconName}
                tier={model.tier}
                archetype="status"
                statusChip={evidence.statusChip}
                statusTone={evidence.statusTone}
                density="compact"
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {body}
            </UniversalCard>
            <CardInlineOverlay
                open={overlayOpen && hasItems}
                onClose={() => setOverlayOpen(false)}
                title="Current work"
                dataOverlay="current-work"
            >
                <div className="alloy-os-household__rows" data-work-list>
                    {evidence.items.map((item) => (
                        <WorkRow
                            key={item.id}
                            item={item}
                            onFocus={inferWorkItemOwner(item) ? () => openWorkItem(item) : undefined}
                        />
                    ))}
                </div>
            </CardInlineOverlay>
        </div>
    );
}

function workTone(item: OperationalWorkItem): "risk" | "work" | "neutral" {
    if (item.urgency === "overdue") return "risk";
    if (item.urgency === "today" || item.state === "open") return "work";
    return "neutral";
}

function WorkRow({ item, onFocus }: { item: OperationalWorkItem; onFocus?: () => void }) {
    const tone = workTone(item);
    const lead = item.urgency === "overdue" ? "!" : item.state === "open" ? "●" : "○";
    const pointsTo = onFocus ? inferWorkItemOwner(item) : null;
    const inner = (
        <>
            <span
                className={clsx("alloy-os-household__avatar", `alloy-os-card-lead--${tone}`)}
                aria-hidden
            >
                {lead}
            </span>
            <span className="alloy-os-household__row-main min-w-0">
                <span className="alloy-os-household__row-name">{item.label}</span>
                {item.dueLabel ? (
                    <span
                        className={clsx(
                            "alloy-os-household__row-detail",
                            item.urgency === "overdue" && "alloy-os-card-detail--risk",
                        )}
                    >
                        {item.dueLabel}
                    </span>
                ) : null}
            </span>
            {pointsTo ? (
                <span className="alloy-os-readiness__pointer" aria-hidden>
                    {pointsTo.card === "household" ? "Household" : "Children"} →
                </span>
            ) : null}
        </>
    );
    if (onFocus) {
        return (
            <button
                type="button"
                className="alloy-os-household__row alloy-os-currentwork__row"
                data-work-row={item.id}
                data-work-tone={tone}
                onClick={onFocus}
            >
                {inner}
            </button>
        );
    }
    return (
        <div
            className="alloy-os-household__row alloy-os-currentwork__row"
            data-work-row={item.id}
            data-work-tone={tone}
        >
            {inner}
        </div>
    );
}
