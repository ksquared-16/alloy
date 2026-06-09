"use client";

import {
    ACTION_WORKSPACE_STEPS,
    type ActionWorkspaceStep,
} from "@/lib/admin/actions/actionWorkspaceTypes";

const STEP_INDEX: Record<ActionWorkspaceStep, number> = {
    gather: 0,
    review: 1,
    execute: 2,
    success: 3,
};

type Props = {
    activeStep: ActionWorkspaceStep;
    /** Step pills on Midnight Forge header */
    onDark?: boolean;
};

export function ActionWorkspaceStepRail({ activeStep, onDark = false }: Props) {
    const activeIndex = STEP_INDEX[activeStep];

    return (
        <ol
            className="flex flex-wrap items-center gap-2.5"
            data-testid="action-workspace-step-rail"
            aria-label="Action progress"
        >
            {ACTION_WORKSPACE_STEPS.map((step, index) => {
                const isActive = step.key === activeStep;
                const isComplete = index < activeIndex;

                const pillStyle =
                    onDark ?
                        isActive ?
                            {
                                color: "#FFFFFF",
                                border: "1px solid rgba(0, 162, 131, 0.45)",
                                background: "rgba(0, 162, 131, 0.22)",
                                boxShadow: "0 0 20px rgba(0, 162, 131, 0.18)",
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
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wide"
                            data-testid={`action-workspace-step-${step.key}`}
                            aria-current={isActive ? "step" : undefined}
                        >
                            <span className="tabular-nums">{isComplete ? "✓" : index + 1}</span>
                            {step.label}
                        </span>
                        {index < ACTION_WORKSPACE_STEPS.length - 1 ?
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
