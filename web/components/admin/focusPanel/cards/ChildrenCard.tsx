"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import {
    buildChildrenCardEvidence,
    type ChildrenEvidenceChild,
} from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import { cardCapabilities } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLifecycle";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    focusPanelCardBackLabel,
    type FocusPanelCoordination,
    type FocusPanelPerspectiveLevel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    /** Forward-facing card boundary — Children observes this, never the drawer VM. */
    context: OperationalContext;
    receded?: boolean;
    /** Owner card: receives cross-card handoffs (e.g. from Readiness). */
    coordination?: FocusPanelCoordination;
};

const CAPS = cardCapabilities("children");

/**
 * Children operational card (Collection archetype) — second reference implementation
 * of the Universal Card Lifecycle.
 *
 * Lifecycle (capability-driven, see focusPanelCardLifecycle.ts):
 *   - Summary   — roster: each child's quick operational answer.
 *   - Focus     — one child's current truth (profile, DOB/age, program, room, schedule,
 *                 status, start date, flags).
 *   - Edit      — schedule/program-shaped inline surface. Children have NO save adapter
 *                 yet, so this is a clearly-labeled READ-ONLY PREVIEW — it never fakes
 *                 persistence (there is no `mutation` prop).
 *   - Expanded  — the same question with more breadth/history (schedule/program/status
 *                 history), honest empty states until that data exists.
 *
 * No perspective change performs a fetch. @see docs/platform/operator/universal-card-lifecycle.md
 */
export default function ChildrenCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(() => buildChildrenCardEvidence(context), [context]);

    const [rosterOpen, setRosterOpen] = useState(false);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    // Cross-card handoff: when Readiness (or Household) points here, open the requested
    // child as a Perspective Change (focus). No fetch.
    const request = coordination?.request;
    const requestNonce = request?.card === "children" ? request.nonce : null;
    useEffect(() => {
        if (request?.card !== "children") return;
        setRosterOpen(true);
        setFocusedId(request.focus ?? null);
        setEditing(false);
        setHistoryOpen(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce]);

    const isEmpty = evidence.count === 0;
    const focused =
        !isEmpty && focusedId ? evidence.children.find((c) => c.id === focusedId) ?? null : null;

    const focusChild = (id: string) => {
        setFocusedId(id);
        setEditing(false);
        setHistoryOpen(false);
    };

    // Report depth so the host raises this card. ANY open state elevates as a centered
    // Focus Card — a truth card never expands height inline (no row reflow).
    const level: FocusPanelPerspectiveLevel =
        editing && focused ? "edit" : focused || rosterOpen ? "focused" : "base";
    useReportPerspective(coordination, "children", level);
    useDismissSignal(coordination, "children", () => {
        setEditing(false);
        setHistoryOpen(false);
        setFocusedId(null);
        setRosterOpen(false);
    });

    const density = !isEmpty && (rosterOpen || focused) ? "expanded" : "compact";
    const statusTone = evidence.hasAttention ? "at-risk" : "neutral";
    const statusChip = isEmpty ? null : evidence.hasAttention ? "Needs info" : `${evidence.count}`;

    // Where a card-to-card handoff came FROM (e.g. Household). Back returns there.
    const backOrigin = editing ? null : coordination?.previousFocus ?? null;
    const backToSourceButton = backOrigin ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => coordination?.back?.()}
            data-children-action="back-to-source"
        >
            ← Back to {focusPanelCardBackLabel(backOrigin.card)}
        </button>
    ) : null;

    let footerAction: React.ReactNode;
    if (isEmpty) {
        footerAction = null;
    } else if (editing && focused) {
        footerAction = (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setEditing(false)}
                data-children-action="cancel-edit"
            >
                ← Back to {focused.name.split(" ")[0]}
            </button>
        );
    } else if (historyOpen && focused) {
        footerAction = (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setHistoryOpen(false)}
                data-children-action="collapse-history"
            >
                ← Back to {focused.name.split(" ")[0]}
            </button>
        );
    } else if (focused) {
        footerAction = (
            <div className="alloy-os-card-nav">
                {backToSourceButton ?? (
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => setFocusedId(null)}
                        data-children-action="back"
                    >
                        ← All children
                    </button>
                )}
                <div className="alloy-os-card-nav__deeper">
                    {CAPS.supportsExpanded ? (
                        <button
                            type="button"
                            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                            onClick={() => setHistoryOpen(true)}
                            data-children-action="expand-history"
                        >
                            History →
                        </button>
                    ) : null}
                    {CAPS.supportsInlineEdit ? (
                        <button
                            type="button"
                            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                            onClick={() => setEditing(true)}
                            data-children-edit-trigger={focused.id}
                        >
                            {deeperEditLabel(focused)} →
                        </button>
                    ) : null}
                </div>
            </div>
        );
    } else if (rosterOpen) {
        footerAction =
            backToSourceButton ?? (
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    onClick={() => setRosterOpen(false)}
                    data-children-action="collapse"
                >
                    ← Back to panel
                </button>
            );
    } else {
        footerAction = (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => setRosterOpen(true)}
                data-children-action="expand"
            >
                View children →
            </button>
        );
    }

    // Lifecycle state (capability-driven), surfaced for the runtime + tests.
    let lifecycle: "empty" | "summary" | "focus" | "edit" | "expanded";
    let body: React.ReactNode;
    if (isEmpty) {
        lifecycle = "empty";
        body = (
            <div className="alloy-os-household__summary" data-children-empty="true">
                <p className="alloy-os-household__row-detail">No children linked to this record yet</p>
            </div>
        );
    } else if (focused) {
        lifecycle = editing ? "edit" : historyOpen ? "expanded" : "focus";
        body = <FocusedChild child={focused} editing={editing} historyOpen={historyOpen} />;
    } else {
        lifecycle = "summary";
        body = (
            <div className="alloy-os-household__rows" data-children-roster>
                {evidence.children.map((child) => (
                    <ChildSummaryRow key={child.id} child={child} onFocus={() => focusChild(child.id)} expanded={rosterOpen} />
                ))}
            </div>
        );
    }

    return (
        <div
            className="alloy-os-household alloy-os-children"
            data-children-card="true"
            data-children-card-perspective={lifecycle === "summary" ? (rosterOpen ? "expanded" : "collapsed") : lifecycle}
            data-children-lifecycle={lifecycle}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={lifecycle === "summary" && !rosterOpen ? evidence.supportingLine : null}
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
    expanded,
}: {
    child: ChildrenEvidenceChild;
    onFocus: () => void;
    expanded: boolean;
}) {
    // Answer-first: the operational sentence (or what's missing). When the roster is
    // expanded, age metadata joins the line for a fuller quick answer.
    const detail = child.detailLine ?? child.missingLine;
    return (
        <button
            type="button"
            className="alloy-os-household__row alloy-os-children__row"
            onClick={onFocus}
            data-children-child={child.id}
        >
            <CardAvatar name={child.name} imageUrl={child.imageUrl} size={28} />
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
                {expanded && child.dobAge ? (
                    <span className="alloy-os-household__row-detail alloy-os-children__row-age">{child.dobAge}</span>
                ) : null}
            </span>
            <StatusPill child={child} />
        </button>
    );
}

function ChildFlags({ child }: { child: ChildrenEvidenceChild }) {
    if (child.flags.length === 0) return null;
    return (
        <div className="alloy-os-card-flags">
            {child.flags.map((flag) => (
                <span key={flag.label} className={clsx("alloy-os-card-flag", `alloy-os-card-flag--${flag.tone}`)}>
                    {flag.label}
                </span>
            ))}
        </div>
    );
}

/** Directional deeper-action label — names the most relevant editable gap. */
function deeperEditLabel(child: ChildrenEvidenceChild): string {
    if (!child.program) return "Set program";
    if (!child.schedule) return "Resolve schedule";
    if (!child.startDate) return "Set desired start";
    return "Edit schedule";
}

/** One labeled truth row (quiet icon + label + value or "Not set"). */
function TruthRow({ icon, label, value }: { icon: string; label: string; value: string | null }) {
    return (
        <div className="alloy-os-child-truth__row" data-child-truth={label}>
            <span className="alloy-os-child-truth__icon" aria-hidden>
                {icon}
            </span>
            <span className="alloy-os-child-truth__label">{label}</span>
            <span className={clsx("alloy-os-child-truth__value", !value && "alloy-os-child-truth__value--empty")}>
                {value ?? "Not set"}
            </span>
        </div>
    );
}

/** Focus: the child's current operational truth, read as grouped evidence. */
function ChildTruthList({ child }: { child: ChildrenEvidenceChild }) {
    return (
        <div className="alloy-os-child-truth" data-children-truth={child.id}>
            <TruthRow icon="🎂" label="Age / DOB" value={child.dobAge} />
            <TruthRow icon="📚" label="Program" value={child.program} />
            <TruthRow icon="🏠" label="Room" value={child.room} />
            <TruthRow icon="🗓" label="Schedule" value={child.schedule} />
            <TruthRow icon="✅" label="Status" value={child.status} />
            <TruthRow icon="📅" label="Start date" value={child.startDate} />
        </div>
    );
}

const WEEKDAYS = ["M", "T", "W", "T", "F"] as const;

/** Heuristic: which weekday chips a schedule label implies (preview only). */
function scheduleDaySelection(schedule: string | null): boolean[] {
    if (!schedule) return [false, false, false, false, false];
    const s = schedule.toLowerCase();
    if (/(m\s*[–-]\s*f|mon\s*[–-]\s*fri|full|daily|every day|5 day)/.test(s)) {
        return [true, true, true, true, true];
    }
    const names = ["mon", "tue", "wed", "thu", "fri"];
    return names.map((n) => s.includes(n));
}

/**
 * Edit: a schedule/program-shaped surface. Children have NO save adapter yet, so this
 * is a clearly-labeled READ-ONLY PREVIEW — disabled controls + a notice, never a fake
 * save. The shape mirrors what live editing will become.
 */
function ChildEnrollmentPreview({ child }: { child: ChildrenEvidenceChild }) {
    const days = scheduleDaySelection(child.schedule);
    return (
        <div className="alloy-os-child-edit" data-children-edit-preview={child.id} data-children-edit-readonly="true">
            <div className="alloy-os-child-edit__section">
                <span className="alloy-os-child-edit__label">Schedule</span>
                <div className="alloy-os-child-edit__chips" role="group" aria-label="Schedule days (preview)">
                    {WEEKDAYS.map((d, i) => (
                        <span
                            key={i}
                            className={clsx("alloy-os-child-edit__chip", days[i] && "alloy-os-child-edit__chip--on")}
                            aria-disabled="true"
                        >
                            {d}
                        </span>
                    ))}
                </div>
            </div>
            <TruthRow icon="📚" label="Program" value={child.program} />
            <TruthRow icon="🏠" label="Room" value={child.room} />
            <TruthRow icon="📅" label="Desired start" value={child.startDate} />
            <p className="alloy-os-card-edit__notice" data-card-edit-notice="true">
                Preview — schedule/program editing isn’t saveable yet
            </p>
        </div>
    );
}

/** Expanded: same question, more breadth/history. Honest empty states until data exists. */
function ChildHistorySection({ child }: { child: ChildrenEvidenceChild }) {
    const sections: { key: string; title: string; empty: string }[] = [
        { key: "schedule_history", title: "Schedule history", empty: "No schedule changes recorded yet" },
        { key: "future_schedules", title: "Future schedules", empty: "No future schedules planned" },
        { key: "program_history", title: "Program history", empty: "No program changes recorded yet" },
        { key: "status_history", title: "Status history", empty: child.status ? `Current: ${child.status}` : "No status history yet" },
    ];
    return (
        <div className="alloy-os-child-history" data-children-history={child.id}>
            {sections.map((s) => (
                <section key={s.key} className="alloy-os-child-history__group" data-children-history-group={s.key}>
                    <p className="alloy-os-child-history__title">{s.title}</p>
                    <p className="alloy-os-child-history__empty">{s.empty}</p>
                </section>
            ))}
        </div>
    );
}

function FocusedChild({
    child,
    editing,
    historyOpen,
}: {
    child: ChildrenEvidenceChild;
    editing: boolean;
    historyOpen: boolean;
}) {
    return (
        <div
            className="alloy-os-household__focused"
            data-children-focused-child={child.id}
            data-children-edit={editing ? "true" : undefined}
        >
            <div className="alloy-os-child-focus__header">
                <CardAvatar name={child.name} imageUrl={child.imageUrl} size={40} />
                <div className="min-w-0">
                    <span className="alloy-os-household__group-title">{child.name}</span>
                    {child.dobAge ? <span className="alloy-os-child-focus__sub">{child.dobAge}</span> : null}
                </div>
                <StatusPill child={child} />
            </div>
            {editing ? (
                <ChildEnrollmentPreview child={child} />
            ) : historyOpen ? (
                <ChildHistorySection child={child} />
            ) : (
                <>
                    <ChildTruthList child={child} />
                    <ChildFlags child={child} />
                </>
            )}
        </div>
    );
}
