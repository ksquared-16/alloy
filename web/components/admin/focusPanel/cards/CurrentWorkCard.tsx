"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { buildCurrentWorkCardEvidence } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    OperationalContext,
    OperationalWorkItem,
} from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
};

/**
 * Current Work operational card (Work archetype). Answers "What needs to happen
 * next on this record?". Overview shows the single most-urgent item; Evidence
 * expands the full work list; Focused shows one item's detail — all local UI over
 * `context.signals.work` (no fetch on expand).
 *
 * @see docs/platform/operator/card-archetypes.md (Work)
 */
export default function CurrentWorkCard({ model, context, receded = false }: Props) {
    const evidence = useMemo(() => buildCurrentWorkCardEvidence(context), [context]);

    const [expanded, setExpanded] = useState(false);
    const [focusedId, setFocusedId] = useState<string | null>(null);

    const focused =
        !evidence.isEmpty && focusedId
            ? evidence.items.find((i) => i.id === focusedId) ?? null
            : null;

    const density = !evidence.isEmpty && (expanded || focused) ? "expanded" : "compact";

    const footerAction = evidence.isEmpty ? null : focused ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setFocusedId(null)}
            data-work-action="back"
        >
            ← All work
        </button>
    ) : expanded ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setExpanded(false)}
            data-work-action="collapse"
        >
            Show less
        </button>
    ) : evidence.items.length > 1 ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setExpanded(true)}
            data-work-action="expand"
        >
            View work →
        </button>
    ) : null;

    let body: React.ReactNode;
    let perspective: "collapsed" | "expanded" | "focused" | "empty";
    if (evidence.isEmpty) {
        perspective = "empty";
        body = (
            <div className="alloy-os-household__summary" data-work-empty="true">
                <p className="alloy-os-household__row-detail">All caught up — nothing needs action</p>
            </div>
        );
    } else if (focused) {
        perspective = "focused";
        body = <FocusedWorkItem item={focused} />;
    } else if (expanded) {
        perspective = "expanded";
        body = (
            <div className="alloy-os-household__rows" data-work-list>
                {evidence.items.map((item) => (
                    <WorkRow key={item.id} item={item} onFocus={() => setFocusedId(item.id)} />
                ))}
            </div>
        );
    } else {
        perspective = "collapsed";
        body =
            evidence.items.length > 0 ? (
                <div className="alloy-os-household__rows" data-work-primary>
                    {evidence.items.slice(0, 1).map((item) => (
                        <WorkRow key={item.id} item={item} onFocus={() => setFocusedId(item.id)} />
                    ))}
                </div>
            ) : null;
    }

    return (
        <div
            className="alloy-os-household alloy-os-currentwork"
            data-work-card="true"
            data-work-card-perspective={perspective}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={perspective === "collapsed" ? evidence.supportingLine : null}
                iconName={model.iconName}
                tier={model.tier}
                archetype="status"
                statusChip={evidence.statusChip}
                statusTone={evidence.statusTone}
                density={density}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {body}
            </UniversalCard>
        </div>
    );
}

function workTone(item: OperationalWorkItem): "risk" | "work" | "neutral" {
    if (item.urgency === "overdue") return "risk";
    if (item.urgency === "today" || item.state === "open") return "work";
    return "neutral";
}

function WorkRow({ item, onFocus }: { item: OperationalWorkItem; onFocus: () => void }) {
    const tone = workTone(item);
    const lead = item.urgency === "overdue" ? "!" : item.state === "open" ? "●" : "○";
    return (
        <button
            type="button"
            className="alloy-os-household__row alloy-os-currentwork__row"
            data-work-row={item.id}
            data-work-tone={tone}
            onClick={onFocus}
        >
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
        </button>
    );
}

function FocusedWorkItem({ item }: { item: OperationalWorkItem }) {
    const rows: { label: string; value: string | null }[] = [
        { label: "Due", value: item.dueLabel },
        { label: "Source", value: item.source },
        {
            label: "Type",
            value: item.kind === "stage_work" ? "Stage work" : "Operational task",
        },
        {
            label: "State",
            value: item.state === "open" ? "Open" : item.state === "completed" ? "Completed" : "Planned",
        },
    ];
    const present = rows.filter((r) => r.value);
    return (
        <div className="alloy-os-household__focused" data-work-focused={item.id}>
            <div className="alloy-os-household__focused-header">
                <span className="alloy-os-household__group-title">{item.label}</span>
            </div>
            <div className="alloy-os-card-kv alloy-os-card-kv--stack">
                {present.map((r) => (
                    <span key={r.label}>
                        <b>{r.label}</b>
                        {r.value}
                    </span>
                ))}
            </div>
        </div>
    );
}
