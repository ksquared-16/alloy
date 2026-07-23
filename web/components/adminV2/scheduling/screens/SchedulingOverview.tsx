"use client";

/**
 * Scheduling Overview — the Work-mode landing. Answers "what needs scheduling
 * attention today?" with operational launch surfaces, each with a real destination:
 * Needs Placement, Starts This Week, Rooms Near Capacity, Ratio Risks, plus the
 * decision + starts zones and an honest recent-changes strip. Counts are real (or an
 * honest empty state); nothing is a dead card.
 */

import type { ReactNode } from "react";
import { ArrowRight, CalendarClock, LayoutGrid, TriangleAlert, UserPlus } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";

export type OverviewChild = { agreementId: string; customerMemberId: string; name: string; startDate?: string | null };
export type OverviewStart = { agreementId: string; name: string; startDate: string };
export type TodayActivity = { placementsToday: number; schedulesCreatedToday: number; schedulesModifiedToday: number };

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
    onNavigateRoster,
}: {
    loading: boolean;
    siteName: string;
    unplaced: OverviewChild[];
    starts: OverviewStart[];
    summary: RosterSummary;
    activity: TodayActivity | null;
    onNavigateRoster: (focusRoomId?: string, filter?: string) => void;
}) {
    const toDecide = unplaced.length;
    const nearCap = summary.roomsNearCapacity.length;
    const ratioRisks = summary.ratioRisks.length;

    const activityItems: WorkspaceOperationalHealthItem[] = [
        { key: "placements", label: "Placements", value: String(activity?.placementsToday ?? 0), tone: "pine" },
        { key: "created", label: "Schedules created", value: String(activity?.schedulesCreatedToday ?? 0), tone: "pine" },
        { key: "modified", label: "Schedules modified", value: String(activity?.schedulesModifiedToday ?? 0), tone: "midnight" },
        { key: "starting", label: "Starting soon", value: String(starts.length), tone: "midnight" },
        { key: "ratio", label: "Ratio warnings", value: String(ratioRisks), tone: ratioRisks > 0 ? "ember" : "pine" },
        { key: "capacity", label: "Near capacity", value: String(nearCap), tone: nearCap > 0 ? "gold" : "pine" },
    ];

    return (
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5" data-scheduling-overview="true">
            <div>
                <p className={WS_EYEBROW}>Needs attention today</p>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <LaunchCard
                        testId="needs-placement"
                        icon={<UserPlus className="h-4 w-4" strokeWidth={2} />}
                        value={String(toDecide)}
                        label="Needs placement"
                        hint={toDecide > 0 ? "Place into a room" : "All placed"}
                        tone={toDecide > 0 ? "ember" : "pine"}
                        onClick={() => onNavigateRoster(undefined, "unplaced")}
                    />
                    <LaunchCard
                        testId="starts-this-week"
                        icon={<CalendarClock className="h-4 w-4" strokeWidth={2} />}
                        value={String(starts.length)}
                        label="Starts this week"
                        hint="See the week"
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

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_1fr]">
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
                        <p className="text-[12.5px] text-alloy-slate">All children at {siteName} have a room. Nothing to decide.</p>
                    ) : (
                        <ul className="flex flex-col">
                            {unplaced.map((c) => (
                                <li
                                    key={c.agreementId}
                                    className="flex items-center gap-3 border-b border-alloy-stone/8 py-2 last:border-b-0"
                                >
                                    <span className="h-7 w-0.5 shrink-0 rounded-full bg-alloy-bend-pine" aria-hidden />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-semibold text-alloy-midnight">{c.name} needs a room</span>
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

                <Zone title="Starts this week" testId="starts">
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

            <div
                className="rounded-xl border border-dashed border-alloy-stone/25 bg-alloy-stone/[0.03] px-4 py-3"
                data-scheduling-overview-zone="recent-changes"
            >
                <p className="text-[12px] font-semibold text-alloy-midnight/70">Recent schedule changes</p>
                <p className="mt-0.5 text-[11.5px] text-alloy-slate">
                    Placements and schedule changes made recently will appear here as the change history feed comes online.
                </p>
            </div>
        </div>
    );
}
