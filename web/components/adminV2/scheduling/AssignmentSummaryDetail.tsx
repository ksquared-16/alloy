"use client";

/**
 * Assignment list + Assignment detail — Focus Panel States B & C.
 *
 * State B (list): Primary-first rows + child-day Timeline (all assignments).
 * State C (detail): Compact property grid + supporting sections — Timeline stays on the list.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BadgeCheck, Wallet } from "lucide-react";

import AssignmentTimeline from "@/components/adminV2/scheduling/AssignmentTimeline";
import {
    assignmentFinancialPlaceholder,
    buildAssignmentTimelineForWeekday,
    pickTimelineWeekday,
    sortAssignmentsForDisplay,
} from "@/lib/operationalAssignments/assignmentTimeline";
import {
    formatCompactScheduleEffective,
    formatCompactScheduleHours,
    formatCompactScheduleWeekdays,
} from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";
import type { Assignment, ScheduleHistoryEntry } from "@/lib/scheduling/projection/schedulingProjectionTypes";

const T = {
    pine: "#00A283",
    forge: "#273F52",
    muted: "#59678b",
    slate: "#4b5563",
    border: "#e5e9ef",
    mid40: "rgba(39,63,82,.40)",
};

const TONE: Record<string, { fg: string; bg: string }> = {
    neutral: { fg: T.muted, bg: "rgba(89,103,139,.10)" },
    info: { fg: "#00458C", bg: "rgba(0,69,140,.10)" },
    success: { fg: T.pine, bg: "rgba(0,162,131,.10)" },
    warning: { fg: "#9a6700", bg: "rgba(208,173,80,.14)" },
    accent: { fg: T.pine, bg: "rgba(0,162,131,.14)" },
};

function typeTone(a: Assignment) {
    return TONE[a.assignmentType.visualTone ?? "neutral"] ?? TONE.neutral;
}

function Empty({ children }: { children: ReactNode }) {
    return <div style={{ fontSize: 12.5, color: T.muted, fontStyle: "italic" }}>{children}</div>;
}

/** Alloy Primary badge — Lucide, not Unicode star. */
function PrimaryBadge() {
    return (
        <span
            data-primary-badge="true"
            title="Primary assignment"
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: T.pine,
                background: "rgba(0,162,131,.10)",
                border: "1px solid rgba(0,162,131,.28)",
                padding: "2px 7px",
                borderRadius: 999,
                lineHeight: 1.2,
            }}
        >
            <BadgeCheck size={11} strokeWidth={2.25} aria-hidden />
            Primary
        </span>
    );
}

function TypeChip({ assignment }: { assignment: Assignment }) {
    const tone = typeTone(assignment);
    const label = assignment.assignmentType.label?.trim() || "Assignment";
    return (
        <span
            data-assignment-type={assignment.assignmentType.key ?? "unknown"}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                color: tone.fg,
                background: tone.bg,
                padding: "3px 8px",
                borderRadius: 999,
            }}
        >
            {label}
        </span>
    );
}

function PropCell({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div data-assignment-prop={label} style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span
                style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: ".05em",
                    textTransform: "uppercase",
                    color: T.mid40,
                }}
            >
                {label}
            </span>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.forge, lineHeight: 1.3 }}>{children}</div>
        </div>
    );
}

function ScanSegment({ children }: { children: ReactNode }) {
    return <span style={{ fontSize: 11.5, color: T.slate, whiteSpace: "nowrap" }}>{children}</span>;
}

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.mid40 }}>
            {children}
        </span>
    );
}

type Scan = {
    program: string | null;
    room: string | null;
    days: string | null;
    effective: string | null;
    time: string | null;
    financial: string;
};

function assignmentScanSegments(a: Assignment): Scan {
    return {
        program: a.room.program?.trim() || null,
        room: a.room.name?.trim() || null,
        days: formatCompactScheduleWeekdays(a.weekdays),
        effective: formatCompactScheduleEffective({
            effectiveFrom: a.effectiveFrom,
            effectiveTo: a.effectiveTo,
            openEnded: a.openEnded,
        }),
        time: formatCompactScheduleHours(a.arriveTime, a.departTime),
        financial: assignmentFinancialPlaceholder(a),
    };
}

function joinScan(parts: Array<string | null | undefined>): ReactNode {
    const filled = parts.filter((p): p is string => Boolean(p && String(p).trim()));
    if (filled.length === 0) return null;
    return filled.map((part, i) => (
        <span key={`${part}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {i > 0 ? <ScanSegment>·</ScanSegment> : null}
            <ScanSegment>{part}</ScanSegment>
        </span>
    ));
}

export type AssignmentListActions = {
    onEdit?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onSetPrimary?: (id: string) => void;
    onArchive?: (id: string) => void;
    archiveBlockedReasonFor?: (a: Assignment) => string | null;
    busy?: boolean;
};

/** Compact list of concurrent assignments + child-day Timeline (State B). */
export function AssignmentSummaryList({
    assignments,
    onOpenAssignment,
    onCreate,
    listActions,
}: {
    assignments: Assignment[];
    onOpenAssignment: (id: string) => void;
    onCreate?: () => void;
    listActions?: AssignmentListActions;
}) {
    const sorted = useMemo(() => sortAssignmentsForDisplay(assignments), [assignments]);
    const todayWeekday = useMemo(() => new Date().getUTCDay(), []);
    const [weekday, setWeekday] = useState(() => pickTimelineWeekday(assignments, todayWeekday));
    const timeline = useMemo(
        () => buildAssignmentTimelineForWeekday(assignments, weekday),
        [assignments, weekday]
    );
    const dayChoices = useMemo(() => {
        const set = new Set<number>();
        for (const a of assignments) for (const d of a.weekdays) set.add(d);
        return [...set].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
    }, [assignments]);

    if (sorted.length === 0) {
        return (
            <div data-assignment-summary="empty" style={{ display: "grid", gap: 10 }}>
                <Empty>No assignments yet.</Empty>
                {onCreate ? (
                    <button type="button" onClick={onCreate} data-schedule-create-new="true" style={linkBtn}>
                        + Add Assignment
                    </button>
                ) : null}
            </div>
        );
    }

    return (
        <div data-assignment-summary="true" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <SectionLabel>Assignments</SectionLabel>
                    {onCreate ? (
                        <button
                            type="button"
                            onClick={onCreate}
                            data-schedule-create-new="true"
                            style={{ ...linkBtn, fontSize: 11 }}
                        >
                            + Add Assignment
                        </button>
                    ) : null}
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 5 }}>
                    {sorted.map((a) => {
                        const scan = assignmentScanSegments(a);
                        const archiveBlocked = listActions?.archiveBlockedReasonFor?.(a) ?? null;
                        return (
                            <li key={a.id}>
                                <div
                                    data-assignment-row={a.id}
                                    style={{
                                        display: "grid",
                                        gap: 5,
                                        width: "100%",
                                        boxSizing: "border-box",
                                        padding: "7px 10px",
                                        borderRadius: 10,
                                        border: `1px solid ${T.border}`,
                                        background: "#fff",
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => onOpenAssignment(a.id)}
                                        style={{
                                            all: "unset",
                                            display: "grid",
                                            gap: 4,
                                            cursor: "pointer",
                                            minWidth: 0,
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                            {a.isPrimary ? <PrimaryBadge /> : null}
                                            <TypeChip assignment={a} />
                                            <span
                                                style={{
                                                    marginLeft: "auto",
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: T.muted,
                                                    textTransform: "capitalize",
                                                    flex: "0 0 auto",
                                                }}
                                                data-assignment-status={a.status}
                                            >
                                                {a.status}
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: "2px 0",
                                                alignItems: "center",
                                                minWidth: 0,
                                            }}
                                            data-assignment-scan={a.id}
                                        >
                                            {joinScan([
                                                scan.program,
                                                scan.room,
                                                scan.days,
                                                scan.effective,
                                                scan.time,
                                            ])}
                                            {scan.financial !== "—" ? (
                                                <span
                                                    style={{
                                                        marginLeft: "auto",
                                                        color: T.muted,
                                                        fontSize: 10.5,
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {scan.financial}
                                                </span>
                                            ) : null}
                                        </div>
                                    </button>
                                    {listActions ? (
                                        <div
                                            data-assignment-row-actions={a.id}
                                            style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 2 }}
                                        >
                                            {listActions.onEdit ? (
                                                <button
                                                    type="button"
                                                    disabled={listActions.busy}
                                                    onClick={() => listActions.onEdit?.(a.id)}
                                                    style={rowActionBtn}
                                                >
                                                    Edit
                                                </button>
                                            ) : null}
                                            {!a.isPrimary && listActions.onSetPrimary ? (
                                                <button
                                                    type="button"
                                                    disabled={listActions.busy}
                                                    onClick={() => listActions.onSetPrimary?.(a.id)}
                                                    style={rowActionBtn}
                                                >
                                                    Make primary
                                                </button>
                                            ) : null}
                                            {listActions.onDuplicate ? (
                                                <button
                                                    type="button"
                                                    disabled={listActions.busy || !a.assignmentType.id}
                                                    onClick={() => listActions.onDuplicate?.(a.id)}
                                                    style={rowActionBtn}
                                                    title={
                                                        a.assignmentType.id
                                                            ? undefined
                                                            : "Unavailable until this assignment has an Assignment Type"
                                                    }
                                                >
                                                    Duplicate
                                                </button>
                                            ) : null}
                                            {listActions.onArchive && !a.isPrimary ? (
                                                <button
                                                    type="button"
                                                    disabled={listActions.busy}
                                                    onClick={() => listActions.onArchive?.(a.id)}
                                                    style={{ ...rowActionBtn, color: "#9a3412" }}
                                                >
                                                    Archive
                                                </button>
                                            ) : null}
                                            {a.isPrimary && archiveBlocked ? (
                                                <button
                                                    type="button"
                                                    disabled
                                                    data-archive-blocked="primary"
                                                    title={archiveBlocked}
                                                    style={{
                                                        ...rowActionBtn,
                                                        color: T.muted,
                                                        cursor: "not-allowed",
                                                        opacity: 0.7,
                                                    }}
                                                >
                                                    Archive
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <section data-assignment-list-timeline="true" style={{ display: "grid", gap: 8 }}>
                <SectionLabel>Day timeline</SectionLabel>
                {dayChoices.length > 1 ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {dayChoices.map((d) => {
                            const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                            const on = d === weekday;
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setWeekday(d)}
                                    style={{
                                        ...pillBtn,
                                        background: on ? "rgba(0,162,131,.10)" : "#fff",
                                        color: on ? T.pine : T.muted,
                                        border: on
                                            ? "1px solid rgba(0,162,131,.35)"
                                            : `1px solid ${T.border}`,
                                    }}
                                >
                                    {labels[d]}
                                </button>
                            );
                        })}
                    </div>
                ) : null}
                <AssignmentTimeline model={timeline} />
            </section>
        </div>
    );
}

/** Compact billing line — no empty Fees/Funding/Subsidy/Price grid. */
function FinancialSummarySection({ assignment }: { assignment: Assignment }) {
    const relationship = assignmentFinancialPlaceholder(assignment);
    const hasLink = relationship !== "—" && relationship !== "Not linked";

    return (
        <section data-assignment-financial="true" style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.mid40 }}>
                <Wallet size={12.5} strokeWidth={2} />
                <SectionLabel>Financial</SectionLabel>
            </div>
            <div
                style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1px solid ${T.border}`,
                    background: "#fff",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: hasLink ? T.forge : T.muted,
                    lineHeight: 1.4,
                }}
            >
                {hasLink
                    ? relationship
                    : "Billing not linked yet — amounts and rates are owned by Billing."}
            </div>
        </section>
    );
}

function HistorySection({ entries }: { entries: ScheduleHistoryEntry[] }) {
    if (entries.length === 0) {
        return (
            <section data-assignment-history="true" style={{ display: "grid", gap: 6 }}>
                <SectionLabel>History</SectionLabel>
                <Empty>No prior assignments on record.</Empty>
            </section>
        );
    }

    return (
        <section data-assignment-history="true" style={{ display: "grid", gap: 6 }}>
            <SectionLabel>History</SectionLabel>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                {entries.map((e, i) => (
                    <li
                        key={`${e.effectiveFrom}-${i}`}
                        data-history-entry={e.effectiveFrom}
                        style={{
                            fontSize: 12,
                            color: T.slate,
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: `1px solid ${T.border}`,
                            background: "#fff",
                        }}
                    >
                        <span style={{ fontWeight: 600, color: T.forge }}>{e.effectiveFrom}</span>
                        {e.effectiveTo ? <span style={{ color: T.muted }}> → {e.effectiveTo}</span> : null}
                        <span style={{ marginLeft: 8 }}>{e.summary}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** Canonical Assignment Detail — compact properties; Timeline lives on the list. */
export function AssignmentDetailView({
    assignment,
    history = [],
    onBack,
    onEdit,
    onSetPrimary,
    onDuplicate,
    onArchive,
    archiveBlockedReason,
    busy,
}: {
    assignment: Assignment;
    /** @deprecated Timeline is on the Assignments list; retained for call-site compat. */
    siblings?: Assignment[];
    history?: ScheduleHistoryEntry[];
    onBack: () => void;
    onEdit?: () => void;
    onSetPrimary?: () => void;
    onDuplicate?: () => void;
    onArchive?: () => void;
    archiveBlockedReason?: string | null;
    busy?: boolean;
}) {
    const hours = formatCompactScheduleHours(assignment.arriveTime, assignment.departTime);
    const days = formatCompactScheduleWeekdays(assignment.weekdays);
    const starts = formatCompactScheduleEffective({
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: null,
        openEnded: true,
    });
    const ends =
        assignment.openEnded || !assignment.effectiveTo
            ? "Open"
            : formatCompactScheduleEffective({
                  effectiveFrom: assignment.effectiveTo,
                  effectiveTo: null,
                  openEnded: true,
              });
    const roomText = assignment.room.name?.trim() || null;
    const programText = assignment.room.program?.trim() || null;
    const effects = [
        assignment.assignmentType.attendanceParticipation === "expected" ? "Attendance" : null,
        assignment.assignmentType.staffingParticipation === "demand"
            ? "Staff demand"
            : assignment.assignmentType.staffingParticipation === "supply"
              ? "Staff supply"
              : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div data-assignment-detail={assignment.id} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={onBack} style={linkBtn}>
                    ← All assignments
                </button>
                {assignment.isPrimary ? <PrimaryBadge /> : null}
                <TypeChip assignment={assignment} />
            </div>

            <div
                data-assignment-props="true"
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px 14px",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${T.border}`,
                    background: "#fff",
                }}
            >
                <PropCell label="Program">{programText ?? "—"}</PropCell>
                <PropCell label="Room">{roomText ?? <Empty>Pending</Empty>}</PropCell>
                <PropCell label="State">
                    <span style={{ textTransform: "capitalize" }}>{assignment.status}</span>
                </PropCell>
                <PropCell label="Days">{days ?? <Empty>Not set</Empty>}</PropCell>
                <PropCell label="Time">{hours ?? <Empty>Not set</Empty>}</PropCell>
                <PropCell label="Starts">{starts ?? "—"}</PropCell>
                <PropCell label="Ends">{ends ?? "—"}</PropCell>
            </div>

            <section data-assignment-operational-effects="true" style={{ display: "grid", gap: 6 }}>
                <SectionLabel>Operational effects</SectionLabel>
                <div
                    style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: `1px solid ${T.border}`,
                        background: "#fff",
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: T.forge,
                    }}
                >
                    {effects || "—"}
                </div>
            </section>

            <FinancialSummarySection assignment={assignment} />

            <HistorySection entries={history} />

            <section
                data-assignment-actions="true"
                style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: "grid", gap: 8 }}
            >
                <SectionLabel>Actions</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {onEdit ? (
                        <button type="button" disabled={busy} onClick={onEdit} style={primaryBtn(Boolean(busy))}>
                            Edit Assignment
                        </button>
                    ) : null}
                    {!assignment.isPrimary && onSetPrimary ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onSetPrimary}
                            style={onEdit ? linkBtn : primaryBtn(Boolean(busy))}
                        >
                            Make Primary
                        </button>
                    ) : null}
                    {onDuplicate ? (
                        <button type="button" disabled={busy} onClick={onDuplicate} style={linkBtn}>
                            Duplicate
                        </button>
                    ) : null}
                    {onArchive && !assignment.isPrimary ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onArchive}
                            style={{ ...linkBtn, color: "#9a3412" }}
                        >
                            Archive
                        </button>
                    ) : null}
                    {assignment.isPrimary && archiveBlockedReason ? (
                        <button
                            type="button"
                            disabled
                            data-archive-blocked="primary"
                            title={archiveBlockedReason}
                            style={{ ...linkBtn, color: T.muted, cursor: "not-allowed", opacity: 0.7 }}
                        >
                            Archive
                        </button>
                    ) : null}
                </div>
                {assignment.isPrimary && archiveBlockedReason ? (
                    <p
                        data-archive-blocked-reason="true"
                        style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.4 }}
                    >
                        {archiveBlockedReason}
                    </p>
                ) : null}
                {!onDuplicate && !assignment.assignmentType.id ? (
                    <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.4 }}>
                        Duplicate is unavailable until this assignment has an Assignment Type.
                    </p>
                ) : null}
            </section>
        </div>
    );
}

const linkBtn: CSSProperties = {
    all: "unset",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color: T.pine,
};

const rowActionBtn: CSSProperties = {
    all: "unset",
    cursor: "pointer",
    fontSize: 10.5,
    fontWeight: 600,
    color: T.pine,
};

const pillBtn: CSSProperties = {
    all: "unset",
    cursor: "pointer",
    fontSize: 10.5,
    fontWeight: 600,
    padding: "4px 8px",
    borderRadius: 8,
};

function primaryBtn(busy: boolean): CSSProperties {
    return {
        all: "unset",
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.6 : 1,
        background: T.pine,
        color: "#fff",
        fontSize: 12.5,
        fontWeight: 700,
        padding: "8px 14px",
        borderRadius: 10,
    };
}
