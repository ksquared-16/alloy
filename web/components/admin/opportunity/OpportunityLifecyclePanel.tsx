"use client";

import type { OpportunityLifecycleStage } from "@/lib/admin/statusDefinitionLifecycle";

type Props = {
    record: Record<string, unknown>;
};

function stageBadgeClass(stage: OpportunityLifecycleStage | null): string {
    switch (stage) {
        case "success":
            return "bg-emerald-50 text-emerald-900 border-emerald-200";
        case "failure":
            return "bg-stone-100 text-stone-800 border-stone-300";
        case "decision":
            return "bg-sky-50 text-sky-950 border-sky-200";
        case "execution":
            return "bg-amber-50 text-amber-950 border-amber-200";
        case "qualification":
            return "bg-violet-50 text-violet-950 border-violet-200";
        case "intake":
            return "bg-slate-50 text-slate-900 border-slate-200";
        default:
            return "bg-white text-alloy-midnight/90 border-alloy-stone/30";
    }
}

/**
 * Growth / CRM: shows effective lifecycle stage (including derived “decision” when priced),
 * configured status label, and lightweight next-step guidance.
 */
export default function OpportunityLifecyclePanel({ record }: Props) {
    const stage = (record._effective_lifecycle_stage as OpportunityLifecycleStage | null | undefined) ?? null;
    const title = String(record._lifecycle_stage_title ?? "").trim() || "Pipeline";
    const meaning = String(record._lifecycle_stage_meaning ?? "").trim();
    const nextStep = record._lifecycle_next_step as { title?: string; lines?: string[] } | undefined;
    const statusKey = record.status_key != null && String(record.status_key).trim() !== "" ? String(record.status_key).trim() : null;
    const statusLabel =
        record._status_display != null && String(record._status_display).trim() !== ""
            ? String(record._status_display).trim()
            : statusKey;

    return (
        <section
            className="rounded-lg border border-admin-border bg-white/90 p-3 mb-2 shadow-sm"
            data-opportunity-lifecycle-panel="true"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-wide text-alloy-midnight/55">Lifecycle</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${stageBadgeClass(stage)}`}
                        >
                            {title}
                        </span>
                        {statusKey || statusLabel ? (
                            <span className="text-xs text-alloy-midnight/80">
                                <span className="text-alloy-midnight/50">Status · </span>
                                <span className="font-medium">{statusLabel ?? "—"}</span>
                            </span>
                        ) : null}
                    </div>
                    {meaning ? <p className="mt-2 text-sm text-alloy-midnight/80 leading-snug">{meaning}</p> : null}
                </div>
            </div>
            {nextStep?.lines?.length ? (
                <div className="mt-3 rounded-md border border-alloy-stone/25 bg-alloy-stone/10 px-2.5 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-alloy-midnight/55">
                        {nextStep.title?.trim() || "Next step"}
                    </p>
                    <ul className="mt-1 list-disc pl-4 text-sm text-alloy-midnight/85 space-y-0.5">
                        {nextStep.lines.map((line, i) => (
                            <li key={i}>{line}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}
