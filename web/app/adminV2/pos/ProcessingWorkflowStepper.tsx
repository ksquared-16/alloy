"use client";

/** Four-step document → native form operator flow (presentation only). */
const STEPS = [
    { key: "import", label: "Import" },
    { key: "review", label: "Review" },
    { key: "generate", label: "Generate" },
    { key: "edit", label: "Edit" },
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
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                                current
                                    ? "bg-alloy-bend-pine text-white"
                                    : done
                                      ? "bg-alloy-bend-pine/[0.12] text-alloy-bend-pine ring-1 ring-alloy-bend-pine/20"
                                      : "bg-alloy-stone/[0.08] text-alloy-midnight/40"
                            }`}
                        >
                            <span className="tabular-nums">{i + 1}</span>
                            {step.label}
                        </span>
                        {i < STEPS.length - 1 ? <span className="text-[10px] text-alloy-midnight/20">→</span> : null}
                    </li>
                );
            })}
        </ol>
    );
}
