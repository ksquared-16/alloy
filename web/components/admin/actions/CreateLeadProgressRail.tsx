"use client";

import {
    CREATE_LEAD_PROGRESS_STEPS,
    type CreateLeadProgressStep,
} from "@/lib/admin/actions/createLeadProgressStep";

const STEP_INDEX: Record<CreateLeadProgressStep, number> = {
    paste: 0,
    review_draft: 1,
    create_lead: 2,
    creating: 2,
    complete: 3,
};

type Props = {
    activeStep: CreateLeadProgressStep;
    onDark?: boolean;
};

export function CreateLeadProgressRail({ activeStep, onDark = false }: Props) {
    const activeIndex = STEP_INDEX[activeStep];
    const terminal = activeStep === "creating" || activeStep === "complete";

    return (
        <ol
            className="flex flex-wrap items-center gap-2.5"
            data-testid="create-lead-progress-rail"
            aria-label="Create lead progress"
        >
            {CREATE_LEAD_PROGRESS_STEPS.map((step, index) => {
                const isActive = !terminal && step.key === activeStep;
                const isComplete = terminal || index < activeIndex;

                const pillStyle =
                    onDark ?
                        isActive ?
                            {
                                color: "#FFFFFF",
                                border: "1px solid rgba(0, 162, 131, 0.45)",
                                background: "rgba(0, 162, 131, 0.22)",
                            }
                        : isComplete ?
                            {
                                color: "rgba(255, 255, 255, 0.85)",
                                border: "1px solid rgba(0, 162, 131, 0.28)",
                                background: "rgba(0, 162, 131, 0.14)",
                            }
                        :   {
                                color: "rgba(255, 255, 255, 0.42)",
                                border: "1px solid rgba(255, 255, 255, 0.10)",
                                background: "rgba(255, 255, 255, 0.04)",
                            }
                    : isActive ?
                        {
                            color: "#00A283",
                            border: "1px solid rgba(0, 162, 131, 0.35)",
                            background: "rgba(0, 162, 131, 0.1)",
                        }
                    : isComplete ?
                        {
                            color: "#007A63",
                            border: "1px solid rgba(0, 162, 131, 0.2)",
                            background: "rgba(0, 162, 131, 0.14)",
                        }
                    :   {
                            color: "rgba(39, 63, 82, 0.55)",
                            border: "1px solid rgba(39, 63, 82, 0.12)",
                            background: "rgba(39, 63, 82, 0.06)",
                        };

                return (
                    <li key={step.key} className="flex items-center gap-2.5">
                        <span
                            style={pillStyle}
                            className="inline-flex cursor-default select-none items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wide"
                            data-testid={`create-lead-progress-${step.key}`}
                            aria-current={isActive ? "step" : undefined}
                            aria-disabled="true"
                        >
                            <span className="tabular-nums">{isComplete ? "✓" : index + 1}</span>
                            {step.label}
                        </span>
                        {index < CREATE_LEAD_PROGRESS_STEPS.length - 1 ?
                            <span
                                className={onDark ? "text-white/20" : "text-alloy-stone/30"}
                                aria-hidden
                            >
                                →
                            </span>
                        :   null}
                    </li>
                );
            })}
        </ol>
    );
}
