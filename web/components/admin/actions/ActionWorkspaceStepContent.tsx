"use client";

import type { ReactNode } from "react";
import type { ActionWorkspaceStep } from "@/lib/admin/actions/actionWorkspaceTypes";

type Props = {
    step: ActionWorkspaceStep;
    activeStep: ActionWorkspaceStep;
    children: ReactNode;
};

/** Fade/slide transition wrapper — renders only the active step panel. */
export function ActionWorkspaceStepContent({ step, activeStep, children }: Props) {
    if (step !== activeStep) return null;
    return (
        <div
            className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-bottom-2 duration-200"
            data-action-workspace-step-panel={step}
        >
            {children}
        </div>
    );
}
