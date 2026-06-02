"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";

export type LifecycleSetupStepId =
    | "required"
    | "statuses"
    | "queue"
    | "actions"
    | "forms"
    | "attention";

export type LifecycleSetupStep = {
    id: LifecycleSetupStepId;
    title: string;
    summary: string;
    manageHref?: string;
    manageLabel?: string;
    content: ReactNode;
};

export default function LifecycleStageSetupWizard({
    stageLabel,
    steps,
    initialStep = "required",
}: {
    stageLabel: string;
    steps: LifecycleSetupStep[];
    initialStep?: LifecycleSetupStepId;
}) {
    const [expandedStep, setExpandedStep] = useState<LifecycleSetupStepId>(initialStep);

    const toggle = useCallback(
        (id: LifecycleSetupStepId) => {
            setExpandedStep((prev) => (prev === id ? prev : id));
        },
        []
    );

    return (
        <section className="space-y-2" data-testid="lifecycle-stage-setup-wizard">
            <div className="rounded-xl border border-alloy-forge/12 bg-white/70 px-4 py-3">
                <h3 className="text-sm font-semibold text-alloy-midnight">Set up {stageLabel}</h3>
                <p className="mt-0.5 text-xs text-alloy-midnight/55">
                    Work through each step in order. Only one section is open at a time.
                </p>
            </div>

            <ol className="space-y-1" data-testid="lifecycle-setup-steps">
                {steps.map((step, index) => {
                    const isExpanded = expandedStep === step.id;
                    return (
                        <li
                            key={step.id}
                            className="overflow-hidden rounded-xl border border-alloy-forge/12 bg-white/85"
                            data-testid={`lifecycle-setup-step-${step.id}`}
                            data-expanded={isExpanded ? "true" : "false"}
                        >
                            <button
                                type="button"
                                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-alloy-stone/5"
                                aria-expanded={isExpanded}
                                onClick={() => toggle(step.id)}
                                data-testid={`lifecycle-setup-step-toggle-${step.id}`}
                            >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-alloy-stone/20 text-[11px] font-semibold text-alloy-midnight/70">
                                    {index + 1}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-alloy-midnight">{step.title}</span>
                                    {!isExpanded ? (
                                        <span className="mt-0.5 block truncate text-xs text-alloy-midnight/50">
                                            {step.summary}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="shrink-0 text-xs text-alloy-midnight/40">{isExpanded ? "−" : "+"}</span>
                            </button>
                            {isExpanded ? (
                                <div
                                    className="max-h-[320px] overflow-y-auto border-t border-alloy-forge/10 px-4 py-3 text-sm"
                                    data-testid={`lifecycle-setup-step-body-${step.id}`}
                                >
                                    {step.manageHref ? (
                                        <div className="mb-2 flex justify-end">
                                            <Link
                                                href={step.manageHref}
                                                className="text-[11px] font-medium text-alloy-pine hover:underline"
                                            >
                                                {step.manageLabel ?? "Advanced"}
                                            </Link>
                                        </div>
                                    ) : null}
                                    {step.content}
                                </div>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
