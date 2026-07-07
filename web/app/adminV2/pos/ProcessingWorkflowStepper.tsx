"use client";

/** Four-step document → native form operator flow (presentation only). */
const STEPS = [
    { key: "import", label: "Import" },
    { key: "review", label: "Review" },
    { key: "generate", label: "Generate" },
    { key: "edit", label: "Edit form" },
] as const;

export type ProcessingWorkflowStep = (typeof STEPS)[number]["key"];

export default function ProcessingWorkflowStepper({ active }: { active: ProcessingWorkflowStep }) {
    const activeIndex = STEPS.findIndex((s) => s.key === active);
    return (
        <ol className="flex flex-wrap items-center gap-1.5" aria-label="Document to form workflow">
            {STEPS.map((step, i) => {
                const done = i < activeIndex;
                const current = i === activeIndex;
                return (
                    <li key={step.key} className="flex items-center gap-1.5">
                        <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                current
                                    ? "bg-alloy-juniper text-white"
                                    : done
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-stone-100 text-stone-500"
                            }`}
                        >
                            <span className="tabular-nums">{i + 1}</span>
                            {step.label}
                        </span>
                        {i < STEPS.length - 1 ? <span className="text-[10px] text-stone-300">→</span> : null}
                    </li>
                );
            })}
        </ol>
    );
}
