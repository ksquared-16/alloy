"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildChildrenCardEvidence,
    type ChildrenEvidenceChild,
} from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    useReportPerspective,
    useDismissSignal,
    type FocusPanelCoordination,
    type FocusPanelPerspectiveLevel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import CardEditPlaceholder from "@/components/admin/focusPanel/cards/CardEditPlaceholder";

type Props = {
    model: FocusPanelCardModel;
    /** Forward-facing card boundary — Children observes this, never the drawer VM. */
    context: OperationalContext;
    receded?: boolean;
    /** Owner card: receives cross-card handoffs (e.g. from Readiness). */
    coordination?: FocusPanelCoordination;
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
export default function ChildrenCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(() => buildChildrenCardEvidence(context), [context]);

    const [expanded, setExpanded] = useState(false);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);

    // Cross-card handoff: when Readiness (or another card) points here, open the
    // requested child as a Perspective Change (expand + focus). No fetch.
    const request = coordination?.request;
    const requestNonce = request?.card === "children" ? request.nonce : null;
    useEffect(() => {
        if (request?.card !== "children") return;
        setExpanded(true);
        setFocusedId(request.focus ?? null);
        setEditing(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce]);

    const isEmpty = evidence.count === 0;
    const focused =
        !isEmpty && focusedId ? evidence.children.find((c) => c.id === focusedId) ?? null : null;

    const focusChild = (id: string) => {
        setFocusedId(id);
        setEditing(false);
    };

    // Report depth so the host raises this card above the surface. ANY open state
    // (roster expand, a focused child, edit) elevates as a centered Focus Card — a
    // truth card NEVER expands height inline (no row reflow).
    const level: FocusPanelPerspectiveLevel =
        editing && focused ? "edit" : focused || expanded ? "focused" : "base";
    useReportPerspective(coordination, "children", level);
    useDismissSignal(coordination, "children", () => {
        setEditing(false);
        setFocusedId(null);
        setExpanded(false);
    });

    const density = !isEmpty && (expanded || focused) ? "expanded" : "compact";
    const statusTone = evidence.hasAttention ? "at-risk" : "neutral";
    const statusChip = isEmpty ? null : evidence.hasAttention ? "Needs info" : `${evidence.count}`;

    const footerAction = isEmpty ? null : editing && focused ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setEditing(false)}
            data-children-action="cancel-edit"
        >
            ← Back to {focused.name.split(" ")[0]}
        </button>
    ) : focused ? (
        <div className="alloy-os-card-nav">
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setFocusedId(null)}
                data-children-action="back"
            >
                ← All children
            </button>
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setEditing(true)}
                data-children-edit-trigger={focused.id}
            >
                {deeperEditLabel(focused)} →
            </button>
        </div>
    ) : expanded ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setExpanded(false)}
            data-children-action="collapse"
        >
            ← Back to panel
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
    let perspective: "collapsed" | "expanded" | "focused" | "edit" | "empty";
    if (isEmpty) {
        perspective = "empty";
        body = (
            <div className="alloy-os-household__summary" data-children-empty="true">
                <p className="alloy-os-household__row-detail">No children linked to this record yet</p>
            </div>
        );
    } else if (focused) {
        perspective = editing ? "edit" : "focused";
        body = <FocusedChild child={focused} editing={editing} />;
    } else if (expanded) {
        perspective = "expanded";
        body = (
            <div className="alloy-os-household__groups" data-children-evidence>
                {evidence.children.map((child) => (
                    <ChildEvidenceBlock
                        key={child.id}
                        child={child}
                        onFocus={() => focusChild(child.id)}
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
                        onFocus={() => focusChild(child.id)}
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
    // Answer-first: the operational sentence (or what's missing), age as metadata.
    const detail = child.detailLine ?? child.missingLine;
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
                {detail ? (
                    <span
                        className={clsx(
                            "alloy-os-household__row-detail",
                            !child.detailLine && child.missingLine && "alloy-os-card-detail--risk",
                        )}
                    >
                        {detail}
                    </span>
                ) : null}
            </span>
            <StatusPill child={child} />
        </button>
    );
}

/** Operational evidence as a sentence + quiet metadata — not a labeled field grid. */
function ChildEvidenceSentence({ child }: { child: ChildrenEvidenceChild }) {
    return (
        <div className="alloy-os-card-evidence" data-children-evidence-sentence={child.id}>
            {child.detailLine ? (
                <p className="alloy-os-card-evidence__line">{child.detailLine}</p>
            ) : (
                <p className="alloy-os-card-evidence__line alloy-os-card-evidence__line--muted">
                    No program or schedule set yet
                </p>
            )}
            {child.missingLine ? (
                <p className="alloy-os-card-evidence__line alloy-os-card-detail--risk">
                    {child.missingLine}
                </p>
            ) : null}
            {child.dobAge ? (
                <p className="alloy-os-card-evidence__meta">{child.dobAge}</p>
            ) : null}
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
            <ChildEvidenceSentence child={child} />
            <ChildFlags child={child} />
        </section>
    );
}

/** Directional deeper-action label — names the most relevant editable gap. */
function deeperEditLabel(child: ChildrenEvidenceChild): string {
    if (!child.program) return "Set program";
    if (!child.schedule) return "Resolve schedule";
    if (!child.startDate) return "Set desired start";
    return "Edit enrollment";
}

function FocusedChild({
    child,
    editing,
}: {
    child: ChildrenEvidenceChild;
    editing: boolean;
}) {
    return (
        <div
            className="alloy-os-household__focused"
            data-children-focused-child={child.id}
            data-children-edit={editing ? "true" : undefined}
        >
            <div className="alloy-os-household__focused-header">
                <span className="alloy-os-household__group-title">{child.name}</span>
                <StatusPill child={child} />
            </div>
            {editing ? (
                <CardEditPlaceholder
                    title={`Edit ${child.name.split(" ")[0]}'s enrollment`}
                    fields={[
                        { label: "Program", value: child.program },
                        { label: "Room", value: child.room },
                        { label: "Schedule", value: child.schedule },
                        { label: "Desired start", value: child.startDate },
                    ]}
                />
            ) : (
                <>
                    <ChildEvidenceSentence child={child} />
                    <ChildFlags child={child} />
                </>
            )}
        </div>
    );
}
