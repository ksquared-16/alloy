"use client";

/**
 * Assignment list + Assignment detail — Focus Panel States B & C.
 *
 * State B (list): Day filter above compact rows (rows ARE the day timeline).
 * State C (detail): Compact white surface; History is a focused drill-in.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BadgeCheck, MoreHorizontal } from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ASSIGNMENT_LIST_DAY_FILTERS,
    assignmentFinancialPlaceholder,
    buildAssignmentTimelineForWeekday,
    filterAssignmentsForDay,
} from "@/lib/operationalAssignments/assignmentTimeline";
import { resolveAssignmentLifecycleState } from "@/lib/operationalAssignments/assignmentLifecycleState";
import {
    formatCompactScheduleEffective,
    formatCompactScheduleHours,
    formatCompactScheduleWeekdays,
} from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";
import type { Assignment, ScheduleHistoryEntry } from "@/lib/scheduling/projection/schedulingProjectionTypes";

const LIFECYCLE_COLOR: Record<string, string> = {
    blue: "#00458C",
    pine: "#00A283",
    muted: "#59678b",
    gold: "#9a6700",
};

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

const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
    const label = assignment.assignmentType.label?.trim() || "Untitled type";
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

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.mid40 }}>
            {children}
        </span>
    );
}

function softDivider(): CSSProperties {
    return { borderTop: `1px solid ${T.border}`, paddingTop: 10, marginTop: 2 };
}

function operationalIdentity(a: Assignment): string | null {
    const room = a.room.name?.trim() || null;
    const program = a.room.program?.trim() || null;
    if (room && program && program.toLowerCase() !== room.toLowerCase()) return `${room} · ${program}`;
    return room || program || null;
}

/** Type-level eligibility labels are not an operator financial relationship. */
function hasRealFinancial(a: Assignment): boolean {
    const relationship = assignmentFinancialPlaceholder(a).trim();
    if (!relationship || relationship === "—" || relationship === "Not linked") return false;
    if (/^(billing eligible|recurring billing eligible|tuition|no billing)$/i.test(relationship)) {
        return false;
    }
    return true;
}

function isBillingEligibleQuiet(a: Assignment): boolean {
    return a.billing.participation === "eligible" && !hasRealFinancial(a);
}

function formatDetailEffective(a: Assignment): string | null {
    const raw = formatCompactScheduleEffective({
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
        openEnded: a.openEnded,
    });
    if (!raw) return null;
    if (a.openEnded || !a.effectiveTo) return `Starts ${raw}`;
    return raw;
}

export type AssignmentListActions = {
    onEdit?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onSetPrimary?: (id: string) => void;
    onArchive?: (id: string) => void;
    archiveBlockedReasonFor?: (a: Assignment) => string | null;
    busy?: boolean;
};

/** Compact list of concurrent assignments with day filter above (State B). */
export function AssignmentSummaryList({
    assignments,
    onOpenAssignment,
    onCreate,
    listActions,
    dayFilter = null,
    onDayFilterChange,
}: {
    assignments: Assignment[];
    onOpenAssignment: (id: string) => void;
    onCreate?: () => void;
    listActions?: AssignmentListActions;
    /** null = All; 0–6 = weekday. Controlled so singular drill-in can preserve selection. */
    dayFilter?: number | null;
    onDayFilterChange?: (day: number | null) => void;
}) {
    const [internalDay, setInternalDay] = useState<number | null>(dayFilter ?? null);
    const activeDay = onDayFilterChange ? dayFilter ?? null : internalDay;
    const setActiveDay = (next: number | null) => {
        if (onDayFilterChange) onDayFilterChange(next);
        else setInternalDay(next);
    };

    const visible = useMemo(() => filterAssignmentsForDay(assignments, activeDay), [assignments, activeDay]);

    const overlapById = useMemo(() => {
        const map = new Map<string, boolean>();
        if (activeDay == null) return map;
        const model = buildAssignmentTimelineForWeekday(assignments, activeDay);
        for (const seg of model.segments) {
            if (seg.overlapsPrevious) map.set(seg.assignmentId, true);
        }
        return map;
    }, [assignments, activeDay]);

    const dayFilterBar = (
        <div
            role="tablist"
            aria-label="Filter assignments by day"
            data-assignment-day-filter="true"
            style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
        >
            {ASSIGNMENT_LIST_DAY_FILTERS.map((chip) => {
                const on = activeDay === chip.key;
                return (
                    <button
                        key={String(chip.key)}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        data-day-filter={chip.key == null ? "all" : chip.key}
                        onClick={() => setActiveDay(chip.key)}
                        style={{
                            ...pillBtn,
                            background: on ? "rgba(0,162,131,.10)" : "#fff",
                            color: on ? T.pine : T.muted,
                            border: on ? "1px solid rgba(0,162,131,.35)" : `1px solid ${T.border}`,
                        }}
                    >
                        {chip.label}
                    </button>
                );
            })}
        </div>
    );

    const headerRow = (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>Assignments</SectionLabel>
            {onCreate ? (
                <button type="button" onClick={onCreate} data-schedule-create-new="true" style={{ ...linkBtn, fontSize: 11 }}>
                    + Add Assignment
                </button>
            ) : null}
        </div>
    );

    if (assignments.length === 0) {
        return (
            <div data-assignment-summary="empty" style={{ display: "grid", gap: 10 }}>
                {headerRow}
                <Empty>No assignments yet.</Empty>
            </div>
        );
    }

    return (
        <div data-assignment-summary="true" style={{ display: "grid", gap: 10, paddingBottom: 14 }}>
            {headerRow}
            {dayFilterBar}

            {visible.length === 0 ? (
                <div
                    data-assignment-day-empty={activeDay == null ? "all" : activeDay}
                    style={{
                        padding: "14px 12px",
                        borderRadius: 10,
                        background: "#fff",
                        border: `1px solid ${T.border}`,
                    }}
                >
                    <Empty>
                        {activeDay == null
                            ? "No assignments in this view."
                            : `No assignments on ${DAY_FULL[activeDay]}.`}
                    </Empty>
                </div>
            ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: "0 0 4px", display: "grid", gap: 7 }}>
                    {visible.map((a) => {
                        const identity = operationalIdentity(a);
                        const days = formatCompactScheduleWeekdays(a.weekdays);
                        const time = formatCompactScheduleHours(a.arriveTime, a.departTime);
                        const effective = formatCompactScheduleEffective({
                            effectiveFrom: a.effectiveFrom,
                            effectiveTo: a.effectiveTo,
                            openEnded: a.openEnded,
                        });
                        // List stays operational — financial relationship belongs on detail when real.
                        const overlaps = overlapById.get(a.id) === true;
                        const dayScoped = activeDay != null;

                        return (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    data-assignment-row={a.id}
                                    onClick={() => onOpenAssignment(a.id)}
                                    style={{
                                        all: "unset",
                                        display: "grid",
                                        gap: dayScoped ? 3 : 4,
                                        width: "100%",
                                        boxSizing: "border-box",
                                        padding: "7px 10px",
                                        borderRadius: 10,
                                        border: overlaps
                                            ? "1px solid rgba(154,103,0,.35)"
                                            : `1px solid ${T.border}`,
                                        background: "#fff",
                                        cursor: "pointer",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                        {a.isPrimary ? <PrimaryBadge /> : null}
                                        <TypeChip assignment={a} />
                                        {overlaps ? (
                                            <span
                                                data-assignment-overlap="true"
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: "#9a6700",
                                                    letterSpacing: ".02em",
                                                }}
                                            >
                                                Overlap
                                            </span>
                                        ) : null}
                                        {(() => {
                                            const life = resolveAssignmentLifecycleState({
                                                commitmentKind: a.commitmentKind,
                                                status: a.status,
                                                effectiveFrom: a.effectiveFrom,
                                                effectiveTo: a.effectiveTo,
                                                openEnded: a.openEnded,
                                                asOf: new Date().toISOString().slice(0, 10),
                                            });
                                            return (
                                                <span
                                                    style={{
                                                        marginLeft: "auto",
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        color: LIFECYCLE_COLOR[life.tone] ?? T.muted,
                                                        flex: "0 0 auto",
                                                    }}
                                                    data-assignment-status={life.label.toLowerCase()}
                                                    data-assignment-lifecycle={life.label}
                                                >
                                                    {life.label}
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    {identity ? (
                                        <div
                                            data-assignment-identity={a.id}
                                            style={{
                                                fontSize: dayScoped ? 13 : 12.5,
                                                fontWeight: 600,
                                                color: T.forge,
                                                lineHeight: 1.25,
                                            }}
                                        >
                                            {identity}
                                        </div>
                                    ) : null}

                                    <div
                                        data-assignment-scan={a.id}
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: "2px 10px",
                                            alignItems: "baseline",
                                            fontSize: dayScoped ? 12.5 : 11.5,
                                            color: T.slate,
                                            fontWeight: dayScoped ? 600 : 500,
                                        }}
                                    >
                                        {dayScoped ? (
                                            time ? <span data-assignment-time="true">{time}</span> : null
                                        ) : (
                                            <>
                                                {days ? <span>{days}</span> : null}
                                                {time ? <span data-assignment-time="true">{time}</span> : null}
                                                {effective ? <span style={{ color: T.muted, fontWeight: 500 }}>{effective}</span> : null}
                                            </>
                                        )}
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Row-level actions stay off the list — detail owns Edit / Archive / Duplicate. */}
            {listActions ? <span data-assignment-list-actions-owner="detail" hidden /> : null}
        </div>
    );
}

/** Canonical Assignment Detail — meaning first; Edit is the visual peer. */
export function AssignmentDetailView({
    assignment,
    history = [],
    onEdit,
    onSetPrimary,
    onDuplicate,
    onArchive,
    archiveBlockedReason,
    onDelete,
    onPromote,
    promoteBlockedReason,
    busy,
    asOf,
}: {
    assignment: Assignment;
    /** @deprecated Retained for call-site compat; timeline lives on the list. */
    siblings?: Assignment[];
    history?: ScheduleHistoryEntry[];
    /** Back-to-Assignments is owned by the host's header (ONE header Back affordance per drill-in state). */
    onEdit?: () => void;
    onSetPrimary?: () => void;
    onDuplicate?: () => void;
    onArchive?: () => void;
    archiveBlockedReason?: string | null;
    /** Proposed-only: permanently remove the assignment from planning projections. */
    onDelete?: () => void;
    onPromote?: () => void;
    promoteBlockedReason?: string | null;
    busy?: boolean;
    /** Org-local as-of for lifecycle resolution (YYYY-MM-DD). */
    asOf?: string | null;
}) {
    const [historyOpen, setHistoryOpen] = useState(false);

    const hours = formatCompactScheduleHours(assignment.arriveTime, assignment.departTime);
    const days = formatCompactScheduleWeekdays(assignment.weekdays);
    const effective = formatDetailEffective(assignment);
    const roomText = assignment.room.name?.trim() || null;
    const programText = assignment.room.program?.trim() || null;
    const lifecycle = resolveAssignmentLifecycleState({
        commitmentKind: assignment.commitmentKind,
        status: assignment.status,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo,
        openEnded: assignment.openEnded,
        asOf: asOf?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    });
    const isPlanning = assignment.commitmentKind === "proposed" || lifecycle.label === "Proposed";
    const kindLabel = assignment.assignmentType.label?.trim() || "Assignment";
    const scheduleLine = [days, hours].filter(Boolean).join(" · ");
    const effects = [
        isPlanning ? "Proposed only — not attendance or billing truth" : null,
        !isPlanning && assignment.assignmentType.attendanceParticipation === "expected"
            ? "Attendance"
            : null,
        !isPlanning && assignment.assignmentType.staffingParticipation === "demand"
            ? "Ratios"
            : !isPlanning && assignment.assignmentType.staffingParticipation === "supply"
              ? "Staffing"
              : null,
        !isPlanning && assignment.assignmentType.attendanceParticipation === "expected" ? "Reporting" : null,
    ]
        .filter(Boolean)
        .join(" · ");

    const duplicateBlocked = !assignment.assignmentType.id;
    const isProposed = assignment.commitmentKind === "proposed";
    const archiveBlocked = Boolean(assignment.isPrimary && archiveBlockedReason);

    if (historyOpen) {
        return (
            <div data-assignment-history-surface={assignment.id} style={{ display: "grid", gap: 12 }}>
                <button type="button" onClick={() => setHistoryOpen(false)} style={linkBtn} data-assignment-history-back="true">
                    ← Back to assignment
                </button>
                <SectionLabel>History</SectionLabel>
                {history.length === 0 ? (
                    <Empty>No history for this assignment yet.</Empty>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                        {history.map((e, i) => (
                            <li
                                key={`${e.effectiveFrom}-${i}`}
                                data-history-entry={e.effectiveFrom}
                                style={{
                                    fontSize: 12,
                                    color: T.slate,
                                    padding: "8px 0",
                                    borderBottom: i === history.length - 1 ? "none" : `1px solid ${T.border}`,
                                }}
                            >
                                <span style={{ fontWeight: 600, color: T.forge }}>{e.effectiveFrom}</span>
                                {e.effectiveTo ? <span style={{ color: T.muted }}> → {e.effectiveTo}</span> : null}
                                <div style={{ marginTop: 2 }}>{e.summary}</div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    return (
        <div
            data-assignment-detail={assignment.id}
            style={{
                display: "grid",
                gap: 12,
                padding: "4px 2px 8px",
                background: "#fff",
            }}
        >
            <header data-assignment-detail-header="true" style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                        data-assignment-kind-title="true"
                        style={{ fontSize: 16, fontWeight: 700, color: T.forge, lineHeight: 1.2 }}
                    >
                        {kindLabel}
                    </span>
                    {assignment.isPrimary ? <PrimaryBadge /> : null}
                    <span
                        data-assignment-status={lifecycle.label.toLowerCase()}
                        data-assignment-lifecycle={lifecycle.label}
                        style={{
                            marginLeft: "auto",
                            fontSize: 12,
                            fontWeight: 700,
                            color: LIFECYCLE_COLOR[lifecycle.tone] ?? T.muted,
                        }}
                    >
                        {lifecycle.label}
                    </span>
                </div>

                <div data-assignment-detail-summary="true" style={{ display: "grid", gap: 4 }}>
                    {roomText ? (
                        <div data-assignment-room="true" style={{ fontSize: 15, fontWeight: 700, color: T.forge }}>
                            {roomText}
                        </div>
                    ) : null}
                    {programText && programText.toLowerCase() !== (roomText ?? "").toLowerCase() ? (
                        <div data-assignment-program="true" style={{ fontSize: 12.5, fontWeight: 500, color: T.slate }}>
                            {programText}
                        </div>
                    ) : null}
                    {scheduleLine ? (
                        <div data-assignment-schedule-line="true" style={{ fontSize: 13, fontWeight: 500, color: T.forge }}>
                            {scheduleLine}
                        </div>
                    ) : null}
                    {effective ? (
                        <div data-assignment-effective="true" style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>
                            {effective}
                        </div>
                    ) : null}
                </div>
            </header>

            {effects ? (
                <section data-assignment-operational-effects="true" style={softDivider()}>
                    <SectionLabel>Operational effects</SectionLabel>
                    <div style={{ marginTop: 6, fontSize: 12.5, color: T.forge, fontWeight: 500 }}>{effects}</div>
                </section>
            ) : null}

            {!isPlanning && hasRealFinancial(assignment) ? (
                <section data-assignment-financial="true" style={softDivider()}>
                    <SectionLabel>Financial</SectionLabel>
                    <div style={{ marginTop: 6, fontSize: 12.5, color: T.forge, fontWeight: 500 }}>
                        {assignmentFinancialPlaceholder(assignment)}
                    </div>
                </section>
            ) : !isPlanning && isBillingEligibleQuiet(assignment) ? (
                <div data-assignment-financial-quiet="true" style={{ ...softDivider(), fontSize: 11.5, color: T.muted }}>
                    Recurring tuition eligible
                </div>
            ) : null}

            <button
                type="button"
                data-assignment-view-history="true"
                onClick={() => setHistoryOpen(true)}
                style={{ ...linkBtn, ...softDivider(), width: "fit-content" }}
            >
                View history
            </button>

            <section data-assignment-actions="true" style={softDivider()}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    {onEdit ? (
                        <button type="button" disabled={busy} onClick={onEdit} style={primaryBtn(Boolean(busy))}>
                            Edit Assignment
                        </button>
                    ) : null}
                    {onPromote ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onPromote}
                            data-assignment-promote="true"
                            style={linkBtn}
                        >
                            Promote Proposed Assignment
                        </button>
                    ) : promoteBlockedReason ? (
                        <span data-promote-blocked="true" style={{ fontSize: 11.5, color: T.muted }}>
                            {promoteBlockedReason}
                        </span>
                    ) : null}
                    {!assignment.isPrimary && onSetPrimary ? (
                        <button type="button" disabled={busy} onClick={onSetPrimary} style={linkBtn}>
                            Make Primary
                        </button>
                    ) : null}

                    <div style={{ marginLeft: "auto" }}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                data-assignment-overflow="true"
                                aria-label="More actions"
                                style={{
                                    all: "unset",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    border: `1px solid ${T.border}`,
                                    color: T.slate,
                                }}
                            >
                                <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            side="bottom"
                            collisionPadding={12}
                            data-assignment-overflow-menu="true"
                            className="min-w-[168px] z-[9999]"
                        >
                            {onDuplicate ? (
                                <DropdownMenuItem
                                    disabled={busy || duplicateBlocked}
                                    title={
                                        duplicateBlocked
                                            ? "Duplicate requires an Assignment Type on this assignment"
                                            : undefined
                                    }
                                    onSelect={() => onDuplicate()}
                                >
                                    Duplicate
                                </DropdownMenuItem>
                            ) : null}
                            {onArchive && !assignment.isPrimary && !isProposed ? (
                                <DropdownMenuItem
                                    disabled={busy}
                                    className="text-[#9a3412] focus:text-[#9a3412]"
                                    onSelect={() => onArchive()}
                                >
                                    Archive
                                </DropdownMenuItem>
                            ) : null}
                            {archiveBlocked && !isProposed ? (
                                <DropdownMenuItem
                                    disabled
                                    data-archive-blocked="primary"
                                    title={archiveBlockedReason ?? undefined}
                                >
                                    Archive
                                </DropdownMenuItem>
                            ) : null}
                            {onDelete && isProposed ? (
                                <DropdownMenuItem
                                    disabled={busy}
                                    data-assignment-delete-proposed="true"
                                    className="text-[#9a3412] focus:text-[#9a3412]"
                                    onSelect={() => onDelete()}
                                >
                                    Delete Proposed Assignment
                                </DropdownMenuItem>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                </div>
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
