"use client";

import {
    ArrowRight,
    Bell,
    Calendar,
    CheckCircle2,
    CheckSquare,
    GitBranch,
    ListTodo,
    Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ProcessingLandingActionCard from "@/app/adminV2/pos/ProcessingLandingActionCard";
import { SurfaceHeaderKpiCard } from "@/components/presentation/workspace/WorkspaceHeader";
import { formatOperationalTaskDueDisplay } from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import { normalizeOperationalTaskTitleDisplay } from "@/lib/agent/taskAssist/normalizeOperationalTaskTitleDisplay";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    fetchOperationalTasksSummary,
    fetchWorkspaceOperationalTasks,
    readJson,
    type OperationalTaskWorkspaceFilter,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    getCachedWorkspaceOperationalTasks,
    prefetchWorkspaceOperationalTasks,
} from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import type { WorkspaceHeaderKpiVm } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";

type TaskCounts = {
    open: number;
    due_today: number;
    due_soon: number;
    overdue: number;
    completed_today: number;
};

function formatAge(iso: string | null): string {
    if (!iso) return "Recently";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Recently";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${Math.max(mins, 1)}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isToday(iso: string): boolean {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
}

function taskInitial(task: MyTasksTaskRow): string {
    const label = task.entity_label?.trim() || task.household_label?.trim() || task.title?.trim() || "?";
    return label.charAt(0).toUpperCase();
}

function taskRecordLabel(task: MyTasksTaskRow): string {
    return task.entity_label?.trim() || task.household_label?.trim() || normalizeOperationalTaskTitleDisplay(task.title);
}

const OVERVIEW_KPIS = (counts: TaskCounts): WorkspaceHeaderKpiVm[] => [
    {
        slot: 1,
        label: "Open Tasks",
        icon: "clipboard",
        accent: "pine",
        formattedValue: String(counts.open),
        status: "healthy",
        sourceKey: null,
        drillHref: null,
    },
    {
        slot: 2,
        label: "Due today Tasks",
        icon: "calendar",
        accent: "gold",
        formattedValue: String(counts.due_today),
        status: "warning",
        sourceKey: null,
        drillHref: null,
    },
    {
        slot: 3,
        label: "Due soon Tasks",
        icon: "bolt",
        accent: "gold",
        formattedValue: String(counts.due_soon),
        status: "warning",
        sourceKey: null,
        drillHref: null,
    },
    {
        slot: 4,
        label: "Overdue Tasks",
        icon: "shield",
        accent: "ember",
        formattedValue: String(counts.overdue),
        status: "critical",
        sourceKey: null,
        drillHref: null,
    },
    {
        slot: 5,
        label: "Completed Today",
        icon: "book",
        accent: "midnight",
        formattedValue: String(counts.completed_today),
        status: "unknown",
        sourceKey: null,
        drillHref: null,
    },
];

const QUICK_NAV: { filter: OperationalTaskWorkspaceFilter; label: string; icon: ReactNode }[] = [
    { filter: "open", label: "Open tasks", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
    { filter: "due_today", label: "Due today", icon: <Calendar className="h-3.5 w-3.5" aria-hidden /> },
    { filter: "overdue", label: "Overdue tasks", icon: <Bell className="h-3.5 w-3.5" aria-hidden /> },
    { filter: "completed", label: "Completed tasks", icon: <CheckSquare className="h-3.5 w-3.5" aria-hidden /> },
];

export default function WorkItemsOverviewLanding({
    onOpenQueue,
    onOpenTask,
    onNewTask,
    onNavigateFilter,
}: {
    onOpenQueue: () => void;
    onOpenTask: (taskId: string, filter?: OperationalTaskWorkspaceFilter) => void;
    onNewTask: () => void;
    onNavigateFilter: (filter: OperationalTaskWorkspaceFilter) => void;
}) {
    const [counts, setCounts] = useState<TaskCounts | null>(null);
    const [openTasks, setOpenTasks] = useState<MyTasksTaskRow[]>(
        () => (getCachedWorkspaceOperationalTasks("open") as MyTasksTaskRow[] | null) ?? []
    );
    const [completedTasks, setCompletedTasks] = useState<MyTasksTaskRow[]>([]);

    useEffect(() => {
        prefetchWorkspaceOperationalTasks("open");
        prefetchWorkspaceOperationalTasks("completed");
        prefetchWorkspaceOperationalTasks("due_today");

        let cancelled = false;
        void (async () => {
            try {
                const [summaryRes, dueTodayRes, completedRes, openRes] = await Promise.all([
                    fetchOperationalTasksSummary(),
                    fetchWorkspaceOperationalTasks("due_today"),
                    fetchWorkspaceOperationalTasks("completed"),
                    fetchWorkspaceOperationalTasks("open"),
                ]);

                const summaryJson = await readJson<{ ok?: boolean; counts?: { open: number; due_soon: number; overdue: number } }>(
                    summaryRes
                );
                const dueTodayJson = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[] }>(dueTodayRes);
                const completedJson = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[] }>(completedRes);
                const openJson = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[] }>(openRes);

                if (cancelled) return;

                const dueTodayRows = Array.isArray(dueTodayJson.tasks) ? dueTodayJson.tasks : [];
                const completedRows = Array.isArray(completedJson.tasks) ? completedJson.tasks : [];
                const openRows = Array.isArray(openJson.tasks) ? openJson.tasks : [];

                setOpenTasks(openRows);
                setCompletedTasks(completedRows);

                if (summaryRes.ok && summaryJson.ok && summaryJson.counts) {
                    setCounts({
                        open: summaryJson.counts.open,
                        due_soon: summaryJson.counts.due_soon,
                        overdue: summaryJson.counts.overdue,
                        due_today: dueTodayRows.length,
                        completed_today: completedRows.filter((t) => isToday(t.created_at)).length,
                    });
                }
            } catch {
                /* non-fatal */
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const recentOpen = useMemo(() => openTasks.slice(0, 4), [openTasks]);
    const recentCompleted = useMemo(() => completedTasks.slice(0, 4), [completedTasks]);

    const kpiItems = counts ? OVERVIEW_KPIS(counts) : OVERVIEW_KPIS({ open: 0, due_today: 0, due_soon: 0, overdue: 0, completed_today: 0 });

    return (
        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 lg:p-5" data-testid="work-items-overview-landing">
            <div className="mx-auto max-w-6xl space-y-5">
                <section className="grid gap-3 md:grid-cols-3">
                    <ProcessingLandingActionCard
                        tier="primary"
                        testId="work-items-create-action-card"
                        icon={<Plus className="h-5 w-5" aria-hidden strokeWidth={2.25} />}
                        title="Create a new task"
                        description="Add a follow-up or reminder for yourself or your team."
                        cta="New task"
                        onClick={onNewTask}
                    />
                    <ProcessingLandingActionCard
                        tier="secondary"
                        testId="work-items-continue-work-card"
                        icon={<ListTodo className="h-5 w-5" aria-hidden />}
                        title="Continue current work"
                        description="Pick up where you left off in the queue."
                        cta="View my work"
                        onClick={onOpenQueue}
                    />
                    <ProcessingLandingActionCard
                        tier="tertiary"
                        testId="work-items-processes-card"
                        icon={<GitBranch className="h-5 w-5" aria-hidden />}
                        title="Business processes"
                        description="Work organized by process and stage."
                        cta="View processes"
                        onClick={onOpenQueue}
                    />
                </section>

                <section data-adminv2-tasks-summary="true">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/35">
                        Today&apos;s activity
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        {kpiItems.map((kpi) => (
                            <SurfaceHeaderKpiCard
                                key={kpi.slot}
                                kpi={kpi}
                                interactive={false}
                                variant="work-unit"
                                density="compact"
                            />
                        ))}
                    </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-3">
                    <ContinuePanel title="Continue where you left off" action="View all" onAction={onOpenQueue}>
                        {recentOpen.length === 0 ? (
                            <EmptyHint>No open tasks yet — create one to get started.</EmptyHint>
                        ) : (
                            <ul className="space-y-1.5">
                                {recentOpen.map((task) => {
                                    const badge = operationalTaskUrgencyBadge(task);
                                    return (
                                        <li key={task.id}>
                                            <button
                                                type="button"
                                                onClick={() => onOpenTask(task.id)}
                                                className="group flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-alloy-stone/[0.04]"
                                            >
                                                <span
                                                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-alloy-juniper/10 text-[11px] font-bold text-alloy-juniper"
                                                    aria-hidden
                                                >
                                                    {taskInitial(task)}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[13px] font-semibold text-alloy-midnight">
                                                        {normalizeOperationalTaskTitleDisplay(task.title)}
                                                    </span>
                                                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-alloy-midnight/50">
                                                        <span>{taskRecordLabel(task)}</span>
                                                        <span aria-hidden>·</span>
                                                        <span>Due {formatOperationalTaskDueDisplay(task.due_at)}</span>
                                                    </span>
                                                </span>
                                                {badge.urgency === "due_soon" || badge.urgency === "overdue" ? (
                                                    <span
                                                        className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                ) : null}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </ContinuePanel>

                    <ContinuePanel title="Recently completed" action="View all" onAction={() => onNavigateFilter("completed")}>
                        {recentCompleted.length === 0 ? (
                            <EmptyHint>Completed tasks appear here.</EmptyHint>
                        ) : (
                            <ul className="space-y-1.5">
                                {recentCompleted.map((task) => (
                                    <li key={task.id}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenTask(task.id, "completed")}
                                            className="group flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-alloy-stone/[0.04]"
                                        >
                                            <CheckCircle2
                                                className="mt-0.5 h-4 w-4 shrink-0 text-alloy-bend-pine"
                                                aria-hidden
                                                strokeWidth={2}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-semibold text-alloy-midnight">
                                                    {normalizeOperationalTaskTitleDisplay(task.title)}
                                                </span>
                                                <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">
                                                    Completed {formatAge(task.created_at)}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ContinuePanel>

                    <section>
                        <header className="mb-3 flex items-center justify-between gap-2">
                            <h2 className="text-[13px] font-semibold text-alloy-midnight/70">Quick navigation</h2>
                        </header>
                        <ul className="divide-y divide-alloy-stone/12 overflow-hidden rounded-xl bg-white shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
                            {QUICK_NAV.map((item) => (
                                <li key={item.filter}>
                                    <button
                                        type="button"
                                        onClick={() => onNavigateFilter(item.filter)}
                                        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-alloy-stone/[0.03]"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="text-alloy-midnight/40">{item.icon}</span>
                                            <span className="text-[12px] font-medium text-alloy-midnight/70">{item.label}</span>
                                        </span>
                                        <ArrowRight className="h-3.5 w-3.5 text-alloy-midnight/25" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    );
}

function ContinuePanel({
    title,
    action,
    onAction,
    children,
}: {
    title: string;
    action: string;
    onAction: () => void;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-alloy-stone/15 bg-white px-4 py-3">
            <header className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-alloy-midnight">{title}</h2>
                <button type="button" onClick={onAction} className="text-[11px] font-semibold text-alloy-bend-pine hover:underline">
                    {action} →
                </button>
            </header>
            {children}
        </section>
    );
}

function EmptyHint({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-lg border border-dashed border-alloy-stone/20 px-3 py-8 text-center text-[12px] text-alloy-midnight/45">
            {children}
        </div>
    );
}
