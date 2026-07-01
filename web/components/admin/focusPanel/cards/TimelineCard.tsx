"use client";

import { useMemo, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardInlineOverlay from "@/components/admin/focusPanel/cards/CardInlineOverlay";
import {
    buildTimelineCardEvidence,
    type TimelineEvent,
} from "@/lib/adminV2/runtime/focusPanel/timeline/buildTimelineCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
};

const SUMMARY_MAX = 3;

/**
 * Timeline card (Timeline archetype). Answers "What has recently happened?".
 *
 * Summary density: max 3 events visible. Expanded view shows all 5 via an inline
 * overlay. Presentational only — "View all →" has no route. No inline edit, no
 * Focus depth. Pure derivation over the Operational Context.
 *
 * @see docs/platform/operator/universal-card-archetypes.md (Timeline)
 */
export default function TimelineCard({ model, context, receded = false }: Props) {
    const evidence = useMemo(() => buildTimelineCardEvidence(context), [context]);
    const [overlayOpen, setOverlayOpen] = useState(false);

    const visibleEvents =
        model.density === "micro" || model.density === "compact"
            ? evidence.events.slice(0, SUMMARY_MAX)
            : evidence.events;

    const hasMore = evidence.events.length > visibleEvents.length;

    const body = evidence.isEmpty ? (
        <div className="alloy-os-timeline__empty" data-timeline-empty="true">
            <p className="alloy-os-household__row-detail">No recent activity on this record</p>
        </div>
    ) : (
        <div className="alloy-os-timeline__events" data-timeline-events>
            {visibleEvents.map((event, i) => (
                <EventRow key={i} event={event} />
            ))}
        </div>
    );

    const footerAction =
        hasMore && !evidence.isEmpty ? (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setOverlayOpen((v) => !v)}
                data-timeline-action="view-all"
                aria-expanded={overlayOpen}
            >
                View all →
            </button>
        ) : null;

    return (
        <div
            className="alloy-os-timeline"
            data-timeline-card="true"
            data-fp-overlay-open={overlayOpen ? "true" : undefined}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={evidence.supportingLine}
                iconName={model.iconName}
                tier={model.tier}
                archetype="timeline"
                statusChip={evidence.statusChip}
                statusTone={evidence.statusTone}
                density={model.density}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {body}
            </UniversalCard>
            <CardInlineOverlay
                open={overlayOpen && evidence.hasEvents}
                onClose={() => setOverlayOpen(false)}
                title="Recent Activity"
                dataOverlay="timeline"
            >
                <div className="alloy-os-timeline__events" data-timeline-overlay-events>
                    {evidence.events.map((event, i) => (
                        <EventRow key={i} event={event} />
                    ))}
                </div>
            </CardInlineOverlay>
        </div>
    );
}

function EventRow({ event }: { event: TimelineEvent }) {
    return (
        <div className="alloy-os-timeline__event" data-timeline-event>
            <span className="alloy-os-timeline__event-when">{event.when}</span>
            <span className="alloy-os-timeline__event-body min-w-0">
                <span className="alloy-os-timeline__event-label">{event.label}</span>
                {event.detail ? (
                    <span className="alloy-os-timeline__event-detail">{event.detail}</span>
                ) : null}
            </span>
        </div>
    );
}
