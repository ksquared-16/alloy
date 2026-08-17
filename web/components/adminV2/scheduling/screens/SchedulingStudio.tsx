"use client";

/**
 * Assignments Studio — assignment administration on the shared workspace shell.
 *
 * Sections: Types (inventory) · Patterns (schedule shapes) · Templates (future) ·
 * Validation (governed rules inventory). Studio administers Assignments in place.
 */

import { CalendarClock, FunctionSquare, Layers, ShieldCheck, Sparkles, Wand2 } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";
import type { OperationsStudioSection as SchedulingStudioView } from "@/app/adminV2/operations/operationsSections";
import { presentCalculation, presentFamily } from "@/app/adminV2/scheduling/calculationPresentation";
import SchedulingPatterns, {
    type StudioPattern,
    type PatternEditorConfig,
    type PatternMutation,
} from "@/components/adminV2/scheduling/screens/SchedulingPatterns";
import AssignmentTypesStudioPanel from "@/components/adminV2/scheduling/screens/AssignmentTypesStudioPanel";
import type { AssignmentTypeAdminRecord } from "@/lib/operationalAssignments/assignmentTypeService";

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
    assignmentTypes,
    calculations,
    editorConfig,
    loading,
    siteName,
    sites,
    onMutatePattern,
    onAssignmentTypesChanged,
}: {
    view: SchedulingStudioView;
    patterns: StudioPattern[];
    assignmentTypes: AssignmentTypeAdminRecord[];
    calculations: StudioCalculation[];
    editorConfig: PatternEditorConfig;
    loading: boolean;
    siteName: string;
    sites: { id: string; name: string }[];
    onMutatePattern: (m: PatternMutation) => Promise<{ ok: boolean; error?: string }>;
    onAssignmentTypesChanged: () => void;
}) {
    return (
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4" data-scheduling-studio={view}>
            {view === "types" ?
                <AssignmentTypesStudioPanel
                    types={assignmentTypes}
                    loading={loading}
                    siteName={siteName}
                    sites={sites}
                    onChanged={onAssignmentTypesChanged}
                    operationalRooms={editorConfig.operationalRooms}
                />
            : null}

            {view === "patterns" ?
                <SchedulingPatterns
                    patterns={patterns}
                    editorConfig={editorConfig}
                    loading={loading}
                    siteName={siteName}
                    onMutate={onMutatePattern}
                />
            : null}

            {view === "templates" ? <TemplatesLanding /> : null}

            {view === "validation" ?
                <ValidationInventory calculations={calculations} loading={loading} />
            : null}
        </div>
    );
}

function TemplatesLanding() {
    const capabilities = [
        {
            icon: <Layers className="h-4 w-4" strokeWidth={2} />,
            title: "Assignment templates",
            body: "Reusable assignment shapes (room + type + pattern + effective window) applied across children.",
        },
        {
            icon: <CalendarClock className="h-4 w-4" strokeWidth={2} />,
            title: "Seasonal templates",
            body: "Term-bound templates promoted when enrollment opens.",
        },
        {
            icon: <Wand2 className="h-4 w-4" strokeWidth={2} />,
            title: "Bulk apply",
            body: "Apply a template to a cohort from the Actions tab.",
        },
        {
            icon: <Sparkles className="h-4 w-4" strokeWidth={2} />,
            title: "Staff templates",
            body: "Future staff assignment templates share this inventory.",
        },
    ];
    return (
        <div data-assignment-studio-templates="true">
            <p className={WS_EYEBROW}>Templates</p>
            <p className="mt-1 max-w-2xl text-[12.5px] text-alloy-slate">
                Templates package assignment defaults for bulk and seasonal work. Inventory only in Phase 2C-B — authoring
                ships with bulk Actions.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {capabilities.map((c) => (
                    <WorkspaceCard key={c.title} className="p-4">
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

function ValidationInventory({ calculations, loading }: { calculations: StudioCalculation[]; loading: boolean }) {
    const validationCalcs = calculations.filter((c) => c.expectationBindable || c.family === "validation");
    const list = validationCalcs.length > 0 ? validationCalcs : calculations;
    return (
        <div data-assignment-studio-validation="true">
            <p className={WS_EYEBROW}>Validation &amp; governed rules</p>
            <p className="mt-1 max-w-2xl text-[12.5px] text-alloy-slate">
                Assignments consume Operational Calculations for placement eligibility, ratio checks, and capacity —
                the workspace never redefines them. This inventory explains what validates assignment operations.
            </p>
            {loading && list.length === 0 ?
                <p className="mt-3 text-[12px] text-alloy-slate">Loading…</p>
            :   <div className="mt-3 flex flex-col gap-4">
                    {groupByFamily(list).map(([family, items]) => (
                        <div key={family}>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-slate">
                                {presentFamily(family)}
                            </p>
                            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                                {items.map((c) => {
                                    const p = presentCalculation(c.key, c.purpose);
                                    return (
                                        <WorkspaceCard key={c.key} flat className="p-4" data-assignment-validation-rule={c.key}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-start gap-2">
                                                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/10 text-alloy-bend-pine">
                                                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-[13px] font-semibold text-alloy-midnight">{p.name}</p>
                                                        <p className="mt-0.5 text-[11.5px] leading-snug text-alloy-slate">{p.description}</p>
                                                    </div>
                                                </div>
                                                <span
                                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                                        c.status === "active" ?
                                                            "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                                        :   "bg-alloy-stone/40 text-alloy-midnight/60"
                                                    }`}
                                                >
                                                    {c.status === "active" ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                            <details className="mt-2.5 pl-9 text-[10px] text-alloy-midnight/45">
                                                <summary className="cursor-pointer select-none font-medium text-alloy-midnight/50">
                                                    Advanced details
                                                </summary>
                                                <p className="mt-1">
                                                    <FunctionSquare className="mr-1 inline h-3 w-3 opacity-50" aria-hidden />
                                                    <code className="text-alloy-midnight/40">{c.key}</code>
                                                </p>
                                            </details>
                                        </WorkspaceCard>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            }
        </div>
    );
}

function groupByFamily(calcs: StudioCalculation[]): [string, StudioCalculation[]][] {
    const map = new Map<string, StudioCalculation[]>();
    for (const c of calcs) {
        const bucket = map.get(c.family) ?? [];
        bucket.push(c);
        map.set(c.family, bucket);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
