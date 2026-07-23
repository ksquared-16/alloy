"use client";

/**
 * Scheduling Studio — Scheduling administration on the shared workspace shell.
 *
 * Sections: Schedule Patterns (create/edit/duplicate/archive) · Planning (future
 * seasonal/bulk/generation landing) · Calculations (operator explanation of the governed
 * Operational Calculations Scheduling consumes). Studio administers Scheduling in place —
 * it never redirects operators back to Settings, and it never redefines a calculation.
 */

import { CalendarClock, FunctionSquare, Layers, Sparkles, Wand2 } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";
import type { SchedulingStudioView } from "@/app/adminV2/scheduling/schedulingSections";
import { presentCalculation, presentFamily } from "@/app/adminV2/scheduling/calculationPresentation";
import SchedulingPatterns, {
    type StudioPattern,
    type PatternEditorConfig,
    type PatternMutation,
} from "@/components/adminV2/scheduling/screens/SchedulingPatterns";

export type { StudioPattern };

export type StudioCalculation = {
    key: string;
    family: string;
    purpose: string;
    resultKind: string;
    status: string;
    logicOwner: string;
    consumers: string[];
    expectationBindable: boolean;
};

export default function SchedulingStudio({
    view,
    patterns,
    calculations,
    editorConfig,
    loading,
    siteName,
    onMutatePattern,
}: {
    view: SchedulingStudioView;
    patterns: StudioPattern[];
    calculations: StudioCalculation[];
    editorConfig: PatternEditorConfig;
    loading: boolean;
    siteName: string;
    onMutatePattern: (m: PatternMutation) => Promise<{ ok: boolean; error?: string }>;
}) {
    return (
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4" data-scheduling-studio={view}>
            {view === "patterns" ? (
                <SchedulingPatterns
                    patterns={patterns}
                    editorConfig={editorConfig}
                    loading={loading}
                    siteName={siteName}
                    onMutate={onMutatePattern}
                />
            ) : null}

            {view === "planning" ? <PlanningLanding /> : null}

            {view === "calculations" ? <CalculationsCatalogue calculations={calculations} loading={loading} /> : null}
        </div>
    );
}

// ── Planning — a coherent landing (never a redirect back to Work) ─────────────
function PlanningLanding() {
    const capabilities = [
        {
            icon: <CalendarClock className="h-4 w-4" strokeWidth={2} />,
            title: "Seasonal planning",
            body: "Plan a summer or school-year schedule ahead of time, then promote it when the term begins.",
        },
        {
            icon: <Layers className="h-4 w-4" strokeWidth={2} />,
            title: "Bulk scheduling",
            body: "Apply a schedule pattern to many children at once instead of one child at a time.",
        },
        {
            icon: <Wand2 className="h-4 w-4" strokeWidth={2} />,
            title: "Future schedule generation",
            body: "Generate next term's room assignments from current enrollment and room capacity.",
        },
        {
            icon: <Sparkles className="h-4 w-4" strokeWidth={2} />,
            title: "Planning scenarios",
            body: "Compare what-if plans — a new room, a ratio change — before committing any of them.",
        },
    ];
    return (
        <div>
            <p className={WS_EYEBROW}>Planning</p>
            <p className="mt-1 max-w-2xl text-[12.5px] text-alloy-slate">
                Planning is where scheduling work is shaped <em>before</em> it becomes operational — proposed schedules,
                seasonal terms, and bulk changes. Today's proposed (pre-enrollment) schedules already flow through the
                child record; the tools below build on that as Scheduling matures.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {capabilities.map((c) => (
                    <WorkspaceCard key={c.title} className="p-4" data-scheduling-planning-capability={c.title.toLowerCase().replace(/\s+/g, "-")}>
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-alloy-bend-pine/10 text-alloy-bend-pine">
                                {c.icon}
                            </span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-[13px] font-semibold text-alloy-midnight">{c.title}</p>
                                    <span className="rounded-full bg-alloy-stone/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                        Planned
                                    </span>
                                </div>
                                <p className="mt-1 text-[11.5px] leading-snug text-alloy-slate">{c.body}</p>
                            </div>
                        </div>
                    </WorkspaceCard>
                ))}
            </div>
        </div>
    );
}

// ── Calculations — operator explanation surface (not an engineering registry) ──
function CalculationsCatalogue({ calculations, loading }: { calculations: StudioCalculation[]; loading: boolean }) {
    return (
        <div>
            <p className={WS_EYEBROW}>How Scheduling decides</p>
            <p className="mt-1 max-w-2xl text-[12.5px] text-alloy-slate">
                Placement, room health, ratios, and occupancy are decided by governed calculations. Scheduling reads
                them — it never redefines them. This is what each one determines.
            </p>
            {loading && calculations.length === 0 ? (
                <p className="mt-3 text-[12px] text-alloy-slate">Loading…</p>
            ) : (
                <div className="mt-3 flex flex-col gap-4">
                    {groupByFamily(calculations).map(([family, list]) => (
                        <div key={family}>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-slate">
                                {presentFamily(family)}
                            </p>
                            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                                {list.map((c) => {
                                    const p = presentCalculation(c.key, c.purpose);
                                    return (
                                        <WorkspaceCard key={c.key} flat className="p-4" data-scheduling-calculation={c.key}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/10 text-alloy-bend-pine">
                                                        <FunctionSquare className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-[13px] font-semibold text-alloy-midnight">{p.name}</p>
                                                        <p className="mt-0.5 text-[11.5px] leading-snug text-alloy-slate">{p.description}</p>
                                                    </div>
                                                </div>
                                                <span
                                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                                        c.status === "active"
                                                            ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                                            : "bg-alloy-stone/40 text-alloy-midnight/60"
                                                    }`}
                                                >
                                                    {c.status}
                                                </span>
                                            </div>
                                            {p.inputs && p.inputs.length > 0 ? (
                                                <div className="mt-2.5 flex flex-wrap gap-1.5 pl-9">
                                                    {p.inputs.map((inp) => (
                                                        <span
                                                            key={inp}
                                                            className="rounded-md bg-alloy-stone/30 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70"
                                                        >
                                                            {inp}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}
                                            <p className="mt-2.5 pl-9 text-[10px] text-alloy-midnight/45">
                                                Owned by {presentFamily(c.family)} · <code className="text-alloy-midnight/40">{c.key}</code>
                                            </p>
                                        </WorkspaceCard>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function groupByFamily(calcs: StudioCalculation[]): [string, StudioCalculation[]][] {
    const map = new Map<string, StudioCalculation[]>();
    for (const c of calcs) {
        const list = map.get(c.family) ?? [];
        list.push(c);
        map.set(c.family, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
