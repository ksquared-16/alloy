"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
    BadgeCheck,
    Cake,
    CalendarClock,
    CalendarDays,
    Clock,
    DoorOpen,
    GraduationCap,
    type LucideIcon,
} from "lucide-react";

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
 * Children operational card — second reference implementation of the Universal Card
 * Lifecycle.
 *
 *   - Summary   — roster: each child as a scannable mini-profile (avatar, name, age,
 *                 program, room, schedule, status).
 *   - Focus     — one child's current truth in the same strong schedule/program
 *                 structure as Edit (schedule days + times, program, room, start date).
 *   - Edit      — that structure as a clearly-labeled READ-ONLY PREVIEW. Children have
 *                 NO save adapter and the card has NO mutation prop, so it never fakes
 *                 persistence.
 *   - Expanded  — same question, more breadth: a report of schedule / future / program /
 *                 status history (honest empty states until that data exists).
 *
 * No perspective change performs a fetch. @see docs/platform/operator/universal-card-lifecycle.md
 */
export default function ChildrenCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(() => buildChildrenCardEvidence(context), [context]);

    const [rosterOpen, setRosterOpen] = useState(false);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

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

    // Nav grammar: LEFT = back / out · RIGHT = the single deeper action (Edit). History
    // is a quiet in-body action (see FocusedChild), never jammed into the footer.
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
        body = (
            <FocusedChild
                child={focused}
                editing={editing}
                historyOpen={historyOpen}
                onOpenHistory={CAPS.supportsExpanded ? () => setHistoryOpen(true) : undefined}
            />
        );
    } else {
        lifecycle = "summary";
        body = (
            <div className="alloy-os-children__roster" data-children-roster>
                {evidence.children.map((child) => (
                    <ChildSummaryRow key={child.id} child={child} onFocus={() => focusChild(child.id)} />
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

function Ico({ icon: Icon }: { icon: LucideIcon }) {
    return (
        <span className="alloy-os-child-truth__icon" aria-hidden>
            <Icon size={15} strokeWidth={1.75} />
        </span>
    );
}

/** Summary: a scannable per-child mini-profile — details stack under the name. */
function ChildSummaryRow({ child, onFocus }: { child: ChildrenEvidenceChild; onFocus: () => void }) {
    const meta: { icon: LucideIcon; value: string }[] = [];
    if (child.dobAge) meta.push({ icon: Cake, value: child.dobAge });
    if (child.program) meta.push({ icon: GraduationCap, value: child.program });
    if (child.room) meta.push({ icon: DoorOpen, value: child.room });
    if (child.schedule) meta.push({ icon: CalendarDays, value: child.schedule });
    return (
        <button
            type="button"
            className="alloy-os-children__summary-row"
            onClick={onFocus}
            data-children-child={child.id}
        >
            <CardAvatar name={child.name} imageUrl={child.imageUrl} size={36} />
            <span className="alloy-os-children__summary-main min-w-0">
                <span className="alloy-os-children__summary-head">
                    <span className="alloy-os-household__row-name">{child.name}</span>
                    <StatusPill child={child} />
                </span>
                <span className="alloy-os-children__summary-meta">
                    {meta.map((m, i) => (
                        <span key={i} className="alloy-os-children__summary-line">
                            <Ico icon={m.icon} />
                            <span>{m.value}</span>
                        </span>
                    ))}
                    {child.missingLine ? (
                        <span className="alloy-os-children__summary-line alloy-os-card-detail--risk" data-children-missing={child.id}>
                            {child.missingLine}
                        </span>
                    ) : null}
                </span>
            </span>
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

function TruthRow({ icon, label, value }: { icon: LucideIcon; label: string; value: string | null }) {
    return (
        <div className="alloy-os-child-truth__row" data-child-truth={label}>
            <Ico icon={icon} />
            <span className="alloy-os-child-truth__label">{label}</span>
            <span className={clsx("alloy-os-child-truth__value", !value && "alloy-os-child-truth__value--empty")}>
                {value ?? "Not set"}
            </span>
        </div>
    );
}

const WEEKDAYS = ["M", "T", "W", "T", "F"] as const;

/** Split a schedule label into its day part and its time part (best-effort, preview). */
function splitSchedule(schedule: string | null): { daysText: string | null; timesText: string | null } {
    if (!schedule) return { daysText: null, timesText: null };
    const parts = schedule.split("·").map((s) => s.trim()).filter(Boolean);
    const timeIdx = parts.findIndex((p) => /\d/.test(p) && /[:apm]/i.test(p));
    const timesText = timeIdx >= 0 ? parts[timeIdx]! : null;
    const daysText = parts.filter((_, i) => i !== timeIdx).join(" · ") || schedule;
    return { daysText, timesText };
}

/** Heuristic: which weekday chips a schedule label implies. */
function scheduleDaySelection(daysText: string | null): boolean[] {
    if (!daysText) return [false, false, false, false, false];
    const s = daysText.toLowerCase();
    if (/(m\s*[–-]\s*f|mon\s*[–-]\s*fri|full|daily|every day|5 day)/.test(s)) {
        return [true, true, true, true, true];
    }
    return ["mon", "tue", "wed", "thu", "fri"].map((n) => s.includes(n));
}

/** Schedule day chips + times — shared by Focus + Edit (same strong structure). */
function ChildScheduleBlock({ child }: { child: ChildrenEvidenceChild }) {
    const { daysText, timesText } = splitSchedule(child.schedule);
    const days = scheduleDaySelection(daysText);
    return (
        <div className="alloy-os-child-edit__section" data-child-schedule>
            <span className="alloy-os-child-edit__label">Schedule</span>
            <div className="alloy-os-child-edit__chips" role="group" aria-label="Schedule days">
                {WEEKDAYS.map((d, i) => (
                    <span key={i} className={clsx("alloy-os-child-edit__chip", days[i] && "alloy-os-child-edit__chip--on")}>
                        {d}
                    </span>
                ))}
            </div>
            {timesText ? (
                <div className="alloy-os-child-truth__row alloy-os-child-edit__times" data-child-truth="Times">
                    <Ico icon={Clock} />
                    <span className="alloy-os-child-truth__label">Times</span>
                    <span className="alloy-os-child-truth__value">{timesText}</span>
                </div>
            ) : null}
        </div>
    );
}

/** The child's enrollment truth — schedule block + program/room/start. */
function ChildEnrollmentBody({ child }: { child: ChildrenEvidenceChild }) {
    return (
        <div className="alloy-os-child-edit" data-children-enrollment={child.id}>
            <ChildScheduleBlock child={child} />
            <TruthRow icon={GraduationCap} label="Program" value={child.program} />
            <TruthRow icon={DoorOpen} label="Room" value={child.room} />
            <TruthRow icon={CalendarClock} label="Start date" value={child.startDate} />
        </div>
    );
}

/** Expanded: a report of breadth/history — materially different from Focus. */
function ChildHistoryReport({ child }: { child: ChildrenEvidenceChild }) {
    const groups: { key: string; title: string; columns: [string, string, string]; rows: [string, string, string][]; empty: string }[] = [
        { key: "schedule_history", title: "Schedule history", columns: ["Effective", "Schedule", "Status"], rows: [], empty: "No schedule changes recorded yet" },
        { key: "future_schedules", title: "Future schedules", columns: ["Starts", "Schedule", "Status"], rows: [], empty: "No future schedules planned" },
        { key: "program_history", title: "Program history", columns: ["Effective", "Program", "Status"], rows: [], empty: "No program changes recorded yet" },
        {
            key: "status_history",
            title: "Status history",
            columns: ["When", "Status", "Source"],
            rows: child.status ? [["Current", child.status, "Enrollment"]] : [],
            empty: "No status history yet",
        },
    ];
    return (
        <div className="alloy-os-child-report" data-children-history={child.id}>
            {groups.map((g) => (
                <section key={g.key} className="alloy-os-child-report__group" data-children-history-group={g.key}>
                    <p className="alloy-os-child-report__title">{g.title}</p>
                    <div className="alloy-os-child-report__table">
                        <div className="alloy-os-child-report__row alloy-os-child-report__row--head">
                            {g.columns.map((c) => (
                                <span key={c}>{c}</span>
                            ))}
                        </div>
                        {g.rows.length > 0 ? (
                            g.rows.map((r, i) => (
                                <div key={i} className="alloy-os-child-report__row">
                                    {r.map((cell, j) => (
                                        <span key={j}>{cell}</span>
                                    ))}
                                </div>
                            ))
                        ) : (
                            <p className="alloy-os-child-report__empty">{g.empty}</p>
                        )}
                    </div>
                </section>
            ))}
        </div>
    );
}

function FocusedChild({
    child,
    editing,
    historyOpen,
    onOpenHistory,
}: {
    child: ChildrenEvidenceChild;
    editing: boolean;
    historyOpen: boolean;
    onOpenHistory?: () => void;
}) {
    return (
        <div
            className="alloy-os-household__focused"
            data-children-focused-child={child.id}
            data-children-edit={editing ? "true" : undefined}
        >
            <div className="alloy-os-child-focus__header">
                <CardAvatar name={child.name} imageUrl={child.imageUrl} size={40} />
                <div className="alloy-os-child-focus__id min-w-0">
                    <span className="alloy-os-household__group-title">{child.name}</span>
                    {child.dobAge ? (
                        <span className="alloy-os-child-focus__sub">
                            <Cake size={13} strokeWidth={1.75} /> {child.dobAge}
                        </span>
                    ) : null}
                </div>
                <StatusPill child={child} />
            </div>

            {historyOpen ? (
                <ChildHistoryReport child={child} />
            ) : editing ? (
                <div data-children-edit-preview={child.id} data-children-edit-readonly="true">
                    <ChildEnrollmentBody child={child} />
                    <p className="alloy-os-card-edit__notice" data-card-edit-notice="true">
                        Preview — schedule/program editing isn’t saveable yet
                    </p>
                </div>
            ) : (
                <>
                    <ChildEnrollmentBody child={child} />
                    <ChildFlags child={child} />
                    {onOpenHistory ? (
                        <button
                            type="button"
                            className="alloy-os-child-history-link"
                            onClick={onOpenHistory}
                            data-children-action="expand-history"
                        >
                            <BadgeCheck size={13} strokeWidth={1.75} /> Schedule &amp; status history →
                        </button>
                    ) : null}
                </>
            )}
        </div>
    );
}
