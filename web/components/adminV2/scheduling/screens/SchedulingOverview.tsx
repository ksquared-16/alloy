"use client";

/**
 * Assignments Overview — the Work-mode landing. Answers "what needs assignment
 * attention today?" with operational launch surfaces backed by Assignment Platform
 * signals. Room capacity / ratio cards remain scheduling properties of assignments.
 */

import type { ReactNode } from "react";
import { ArrowRight, CalendarClock, LayoutGrid, TriangleAlert, UserPlus } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";
import { WorkspaceOverviewStack } from "@/components/workspace/WorkspaceOverviewLayout";
import { WS_EYEBROW, WS_OVERVIEW_INFO_SPLIT, WS_OVERVIEW_LAUNCH_GRID } from "@/components/workspace/workspaceTokens";

export type OverviewChild = { agreementId: string; customerMemberId: string; name: string; startDate?: string | null };
export type OverviewStart = { agreementId: string; name: string; startDate: string };
export type TodayActivity = { placementsToday: number; schedulesCreatedToday: number; schedulesModifiedToday: number };

/** Light Assignment Platform signals for Overview (derived, not a new engine). */
export type AssignmentAttentionSummary = {
    multipleAssignments: number;
    upcomingAssignments: number;
    futurePrimaryChanges: number;
    missingAssignmentTypes: number;
    childrenMissingAssignments: number;
    assignmentConflicts: number;
    expiringSoon: number;
    changesAwaitingReview: number;
};

export type RosterSummary = {
    roomsNearCapacity: { roomId: string; roomName: string; pct: number }[];
    ratioRisks: { roomId: string; roomName: string; dayLabel: string }[];
    fill: string | null;
    roomsInRatio: string | null;
};

type Tone = "pine" | "gold" | "ember" | "midnight";

const NUM_TONE: Record<Tone, string> = {
    pine: "text-alloy-bend-pine",
    gold: "text-alloy-gold-dark",
    ember: "text-alloy-ember",
    midnight: "text-alloy-midnight",
};
const ICON_WASH: Record<Tone, string> = {
    pine: "bg-alloy-bend-pine/10 text-alloy-bend-pine",
    gold: "bg-alloy-gold-dark/15 text-alloy-gold-dark",
    ember: "bg-alloy-ember/10 text-alloy-ember",
    midnight: "bg-alloy-stone/40 text-alloy-midnight",
};

function fmtDate(ymd: string): string {
    const [, m, d] = ymd.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return m && d ? `${months[m - 1]} ${d}` : ymd;
}

function LaunchCard({
    icon,
    value,
    label,
    hint,
    tone,
    onClick,
    testId,
}: {
    icon: ReactNode;
    value: string;
    label: string;
    hint: string;
    tone: Tone;
    onClick: () => void;
    testId: string;
}) {
    return (
        <WorkspaceCard
            interactive
            padded={false}
            className="cursor-pointer p-4 text-left"
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }}
            data-scheduling-launch-card={testId}
        >
            <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${ICON_WASH[tone]}`}>{icon}</span>
            <div className="flex items-baseline gap-2">
                <span className={`text-[24px] font-semibold leading-none tabular-nums ${NUM_TONE[tone]}`}>{value}</span>
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-alloy-midnight">{label}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-alloy-slate">
                {hint}
                <ArrowRight className="h-3 w-3 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </p>
        </WorkspaceCard>
    );
}

function Zone({ title, action, children, testId }: { title: string; action?: ReactNode; children: ReactNode; testId?: string }) {
    return (
        <section
            className="flex min-h-0 flex-col rounded-xl border border-alloy-stone/18 bg-white p-4 shadow-[0_2px_10px_rgba(24,39,58,0.06)]"
            data-scheduling-overview-zone={testId}
        >
            <header className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-alloy-midnight">{title}</h2>
                {action}
            </header>
            {children}
        </section>
    );
}

export default function SchedulingOverview({
    loading,
    siteName,
    unplaced,
    starts,
    summary,
    activity,
    assignmentAttention,
    onNavigateRoster,
}: {
    loading: boolean;
    siteName: string;
    unplaced: OverviewChild[];
    starts: OverviewStart[];
    summary: RosterSummary;
    activity: TodayActivity | null;
    assignmentAttention?: AssignmentAttentionSummary | null;
    onNavigateRoster: (focusRoomId?: string, filter?: string) => void;
}) {
    const toDecide = unplaced.length;
    const nearCap = summary.roomsNearCapacity.length;
    const ratioRisks = summary.ratioRisks.length;
    const attn = assignmentAttention ?? null;
    const missingAssignments = attn?.childrenMissingAssignments ?? toDecide;
    const multi = attn?.multipleAssignments ?? 0;
    const upcoming = attn?.upcomingAssignments ?? starts.length;
    const futurePrimary = attn?.futurePrimaryChanges ?? 0;
    const missingTypes = attn?.missingAssignmentTypes ?? 0;
    const conflicts = attn?.assignmentConflicts ?? 0;
    const expiring = attn?.expiringSoon ?? 0;
    const awaitingReview = attn?.changesAwaitingReview ?? 0;

    const activityItems: WorkspaceOperationalHealthItem[] = [
        { key: "placements", label: "Placements", value: String(activity?.placementsToday ?? 0), tone: "pine" },
        { key: "created", label: "Assignments created", value: String(activity?.schedulesCreatedToday ?? 0), tone: "pine" },
        { key: "modified", label: "Assignments modified", value: String(activity?.schedulesModifiedToday ?? 0), tone: "midnight" },
        { key: "ratio", label: "Ratio warnings", value: String(ratioRisks), tone: ratioRisks > 0 ? "ember" : "pine" },
        { key: "capacity", label: "Near capacity", value: String(nearCap), tone: nearCap > 0 ? "gold" : "pine" },
    ];

    const assignmentItems: WorkspaceOperationalHealthItem[] = [
        {
            key: "multiple",
            label: "Multiple assignments",
            value: String(multi),
            tone: multi > 0 ? "midnight" : "pine",
        },
        {
            key: "future-primary",
            label: "Future primary changes",
            value: String(futurePrimary),
            tone: futurePrimary > 0 ? "gold" : "pine",
        },
        {
            key: "missing-types",
            label: "Missing Assignment Categories",
            value: String(missingTypes),
            tone: missingTypes > 0 ? "gold" : "pine",
        },
        {
            key: "conflicts",
            label: "Assignment conflicts",
            value: String(conflicts),
            tone: conflicts > 0 ? "ember" : "pine",
        },
        {
            key: "expiring",
            label: "Expiring soon",
            value: String(expiring),
            tone: expiring > 0 ? "gold" : "pine",
        },
        {
            key: "awaiting-review",
            label: "Awaiting review",
            value: String(awaitingReview),
            tone: awaitingReview > 0 ? "midnight" : "pine",
        },
    ];

    return (
        <WorkspaceOverviewStack className="gap-5 space-y-0" data-scheduling-overview="true" testId="scheduling-overview">
            <div>
                <p className={WS_EYEBROW}>Needs attention today</p>
                <div className={`mt-3 ${WS_OVERVIEW_LAUNCH_GRID}`}>
                    <LaunchCard
                        testId="needs-placement"
                        icon={<UserPlus className="h-4 w-4" strokeWidth={2} />}
                        value={String(missingAssignments)}
                        label="Missing assignments"
                        hint={missingAssignments > 0 ? "Children without an assignment" : "All assigned"}
                        tone={missingAssignments > 0 ? "ember" : "pine"}
                        onClick={() => onNavigateRoster(undefined, "unplaced")}
                    />
                    <LaunchCard
                        testId="starts-this-week"
                        icon={<CalendarClock className="h-4 w-4" strokeWidth={2} />}
                        value={String(upcoming)}
                        label="Upcoming assignments"
                        hint="Future effective windows"
                        tone="midnight"
                        onClick={() => onNavigateRoster(undefined, "starts")}
                    />
                    <LaunchCard
                        testId="rooms-near-capacity"
                        icon={<LayoutGrid className="h-4 w-4" strokeWidth={2} />}
                        value={String(nearCap)}
                        label="Rooms near capacity"
                        hint="Open roster"
                        tone={nearCap > 0 ? "gold" : "pine"}
                        onClick={() => onNavigateRoster(summary.roomsNearCapacity[0]?.roomId, "near_capacity")}
                    />
                    <LaunchCard
                        testId="ratio-risks"
                        icon={<TriangleAlert className="h-4 w-4" strokeWidth={2} />}
                        value={String(ratioRisks)}
                        label="Ratio risks"
                        hint="Review ratios"
                        tone={ratioRisks > 0 ? "ember" : "pine"}
                        onClick={() => onNavigateRoster(summary.ratioRisks[0]?.roomId, "ratio_risk")}
                    />
                </div>
            </div>

            <div
                className="rounded-xl border border-alloy-stone/18 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(24,39,58,0.05)]"
                data-assignment-attention="true"
            >
                <WorkspaceOperationalHealth
                    eyebrow="Assignment attention"
                    items={assignmentItems}
                    loading={loading}
                    ariaLabel="Assignment platform attention"
                    data-testid="scheduling-assignment-attention"
                />
            </div>

            <div
                className="rounded-xl border border-alloy-stone/18 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(24,39,58,0.05)]"
                data-scheduling-today-activity="true"
            >
                <WorkspaceOperationalHealth
                    eyebrow="Today's activity"
                    items={activityItems}
                    loading={loading}
                    ariaLabel="Today's scheduling activity"
                    data-testid="scheduling-today-activity"
                />
            </div>

            <div className={WS_OVERVIEW_INFO_SPLIT}>
                <Zone
                    title="Needs a decision"
                    testId="needs-decision"
                    action={
                        <button
                            type="button"
                            className="flex items-center gap-1 text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                            onClick={() => onNavigateRoster()}
                            data-scheduling-open-roster="true"
                        >
                            Rooms &amp; ratios <ArrowRight className="h-3 w-3" aria-hidden />
                        </button>
                    }
                >
                    {loading ? (
                        <p className="text-[12px] text-alloy-slate">Loading…</p>
                    ) : toDecide === 0 ? (
                        <p className="text-[12.5px] text-alloy-slate">All children at {siteName} have an assignment. Nothing to decide.</p>
                    ) : (
                        <ul className="flex flex-col">
                            {unplaced.map((c) => (
                                <li
                                    key={c.agreementId}
                                    className="flex items-center gap-3 border-b border-alloy-stone/8 py-2 last:border-b-0"
                                >
                                    <span className="h-7 w-0.5 shrink-0 rounded-full bg-alloy-bend-pine" aria-hidden />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-semibold text-alloy-midnight">{c.name} needs an assignment</span>
                                        <span className="block text-[11px] text-alloy-slate">
                                            {c.startDate ? `starts ${fmtDate(c.startDate)}` : "ready to place"}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        className="shrink-0 text-[11.5px] font-semibold text-alloy-bend-pine hover:underline"
                                        onClick={() => onNavigateRoster(undefined, "unplaced")}
                                        data-scheduling-place={c.customerMemberId}
                                    >
                                        Place →
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Zone>

                <Zone title="Upcoming starts" testId="starts">
                    {loading ? (
                        <p className="text-[12px] text-alloy-slate">Loading…</p>
                    ) : starts.length === 0 ? (
                        <p className="text-[12.5px] text-alloy-slate">No children start at {siteName} this week.</p>
                    ) : (
                        <ul className="flex flex-col">
                            {starts.map((s) => (
                                <li
                                    key={s.agreementId}
                                    className="flex items-center justify-between gap-3 border-b border-alloy-stone/8 py-2 last:border-b-0"
                                >
                                    <span className="truncate text-[13px] font-medium text-alloy-midnight">{s.name}</span>
                                    <span className="shrink-0 text-[11px] font-medium text-alloy-slate">{fmtDate(s.startDate)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Zone>
            </div>

            {/* Recent changes: omit until an authoritative history feed is wired — no roadmap placeholder. */}
        </WorkspaceOverviewStack>
    );
}
