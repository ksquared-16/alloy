"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildChildrenCardEvidence,
    type ChildrenEvidenceChild,
} from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    /** Forward-facing card boundary — Children observes this, never the drawer VM. */
    context: OperationalContext;
    receded?: boolean;
};

/**
 * Children operational card (Collection archetype). Answers "What is true for each
 * child right now?" — program, room, schedule, enrollment status, desired start.
 *
 * Perspectives are LOCAL UI state: collapsed (roster) → expanded (per-child
 * operational detail) → focused (single child). Focusing a child is the v1 local
 * depth swap; full Subject Change (panel recompose around the child) is the same
 * primitive wired at the runtime later. No perspective change performs a fetch.
 *
 * @see docs/platform/operator/card-archetypes.md (Collection)
 */
export default function ChildrenCard({ model, context, receded = false }: Props) {
    const evidence = useMemo(() => buildChildrenCardEvidence(context), [context]);

    const [expanded, setExpanded] = useState(false);
    const [focusedId, setFocusedId] = useState<string | null>(null);

    const isEmpty = evidence.count === 0;
    const focused =
        !isEmpty && focusedId ? evidence.children.find((c) => c.id === focusedId) ?? null : null;

    const density = !isEmpty && (expanded || focused) ? "expanded" : "compact";
    const statusTone = evidence.hasAttention ? "at-risk" : "neutral";
    const statusChip = isEmpty ? null : evidence.hasAttention ? "Needs info" : `${evidence.count}`;

    const footerAction = isEmpty ? null : focused ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setFocusedId(null)}
            data-children-action="back"
        >
            ← All children
        </button>
    ) : expanded ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setExpanded(false)}
            data-children-action="collapse"
        >
            Show less
        </button>
    ) : (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setExpanded(true)}
            data-children-action="expand"
        >
            View children →
        </button>
    );

    let body: React.ReactNode;
    let perspective: "collapsed" | "expanded" | "focused" | "empty";
    if (isEmpty) {
        perspective = "empty";
        body = (
            <div className="alloy-os-household__summary" data-children-empty="true">
                <p className="alloy-os-household__row-detail">No children linked to this record yet</p>
            </div>
        );
    } else if (focused) {
        perspective = "focused";
        body = <FocusedChild child={focused} />;
    } else if (expanded) {
        perspective = "expanded";
        body = (
            <div className="alloy-os-household__groups" data-children-evidence>
                {evidence.children.map((child) => (
                    <ChildEvidenceBlock
                        key={child.id}
                        child={child}
                        onFocus={() => setFocusedId(child.id)}
                    />
                ))}
            </div>
        );
    } else {
        perspective = "collapsed";
        body = (
            <div className="alloy-os-household__rows" data-children-roster>
                {evidence.children.map((child) => (
                    <ChildSummaryRow
                        key={child.id}
                        child={child}
                        onFocus={() => setFocusedId(child.id)}
                    />
                ))}
            </div>
        );
    }

    return (
        <div
            className="alloy-os-household alloy-os-children"
            data-children-card="true"
            data-children-card-perspective={perspective}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={perspective === "collapsed" ? evidence.supportingLine : null}
                iconName={model.iconName}
                tier={model.tier}
                archetype="collection"
                statusChip={statusChip}
                statusTone={statusTone}
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

function StatusPill({ child }: { child: ChildrenEvidenceChild }) {
    if (!child.status) return null;
    return (
        <span
            className={clsx("alloy-os-card-pill", `alloy-os-card-pill--${child.statusTone}`)}
            data-children-status={child.statusTone}
        >
            {child.status}
        </span>
    );
}

function ChildSummaryRow({
    child,
    onFocus,
}: {
    child: ChildrenEvidenceChild;
    onFocus: () => void;
}) {
    const detail = [child.dobAge, child.program].filter(Boolean).join(" · ");
    return (
        <button
            type="button"
            className="alloy-os-household__row alloy-os-children__row"
            onClick={onFocus}
            data-children-child={child.id}
        >
            <span className="alloy-os-household__avatar" aria-hidden>
                {child.initial}
            </span>
            <span className="alloy-os-household__row-main min-w-0">
                <span className="alloy-os-household__row-name">{child.name}</span>
                {detail ? <span className="alloy-os-household__row-detail">{detail}</span> : null}
            </span>
            <StatusPill child={child} />
        </button>
    );
}

function ChildKvGrid({ child, stacked }: { child: ChildrenEvidenceChild; stacked?: boolean }) {
    const fields: { label: string; value: string | null }[] = [
        { label: "DOB / age", value: child.dobAge },
        { label: "Program", value: child.program },
        { label: "Room", value: child.room },
        { label: "Schedule", value: child.schedule },
        { label: "Start", value: child.startDate },
    ];
    const present = fields.filter((f) => f.value);
    if (present.length === 0) {
        return <p className="alloy-os-household__row-detail">No operational detail set yet</p>;
    }
    return (
        <div className={clsx("alloy-os-card-kv", stacked && "alloy-os-card-kv--stack")}>
            {present.map((f) => (
                <span key={f.label}>
                    <b>{f.label}</b>
                    {f.value}
                </span>
            ))}
        </div>
    );
}

function ChildFlags({ child }: { child: ChildrenEvidenceChild }) {
    if (child.flags.length === 0) return null;
    return (
        <div className="alloy-os-card-flags">
            {child.flags.map((flag) => (
                <span
                    key={flag.label}
                    className={clsx("alloy-os-card-flag", `alloy-os-card-flag--${flag.tone}`)}
                >
                    {flag.label}
                </span>
            ))}
        </div>
    );
}

function ChildEvidenceBlock({
    child,
    onFocus,
}: {
    child: ChildrenEvidenceChild;
    onFocus: () => void;
}) {
    return (
        <section className="alloy-os-child-block" data-children-evidence-child={child.id}>
            <button
                type="button"
                className="alloy-os-household__group-header"
                onClick={onFocus}
                data-children-focus={child.id}
            >
                <span className="alloy-os-household__group-title">{child.name}</span>
                <StatusPill child={child} />
            </button>
            <ChildKvGrid child={child} />
            <ChildFlags child={child} />
        </section>
    );
}

function FocusedChild({ child }: { child: ChildrenEvidenceChild }) {
    return (
        <div className="alloy-os-household__focused" data-children-focused-child={child.id}>
            <div className="alloy-os-household__focused-header">
                <span className="alloy-os-household__group-title">{child.name}</span>
                <StatusPill child={child} />
            </div>
            <ChildKvGrid child={child} stacked />
            <ChildFlags child={child} />
        </div>
    );
}
