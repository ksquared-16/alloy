"use client";

import type { RecordLifecycleRailModel, RecordLifecycleRailStepState } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";

function stepDotClass(state: RecordLifecycleRailStepState, clickable: boolean): string {
    switch (state) {
        case "complete":
            return "border-[rgb(0,162,131)] bg-[rgb(0,162,131)] text-white";
        case "current":
            return clickable
                ? "border-alloy-blue bg-alloy-blue text-white ring-2 ring-alloy-blue/20 cursor-pointer hover:ring-alloy-blue/35"
                : "border-alloy-blue bg-alloy-blue text-white ring-2 ring-alloy-blue/20";
        case "future":
            return "border-alloy-stone/25 bg-white text-alloy-midnight/40 ring-1 ring-alloy-stone/15";
        default:
            return clickable
                ? "border-alloy-stone/30 bg-white text-alloy-midnight/55 ring-1 ring-alloy-stone/15 cursor-pointer hover:border-alloy-blue/35"
                : "border-alloy-stone/25 bg-white text-alloy-midnight/45 ring-1 ring-alloy-stone/15";
    }
}

function stepLabelClass(state: RecordLifecycleRailStepState, clickable: boolean): string {
    switch (state) {
        case "complete":
            return "font-medium text-alloy-midnight/75";
        case "current":
            return "font-semibold text-alloy-midnight/90";
        case "future":
            return "text-alloy-midnight/40";
        default:
            return clickable ? "font-medium text-alloy-midnight/60 hover:text-alloy-blue" : "text-alloy-midnight/50";
    }
}

function connectorClass(state: RecordLifecycleRailStepState): string {
    if (state === "complete") return "bg-[rgb(0,162,131)]/45";
    if (state === "current") return "bg-alloy-blue/35";
    return "bg-alloy-stone/20";
}

/** Compact horizontal lifecycle rail — shared visual for opportunity, child, and future record drawers. */
export default function RecordLifecycleRail({
    model,
    onStepClick,
    interactive = false,
    "data-testid": dataTestId = "record-lifecycle-rail",
    "aria-label": ariaLabel = "Lifecycle",
}: {
    model: RecordLifecycleRailModel;
    onStepClick?: (stepKey: string) => void;
    interactive?: boolean;
    "data-testid"?: string;
    "aria-label"?: string;
}) {
    if (!model.steps.length) return null;

    return (
        <nav
            className="rounded-lg border border-alloy-stone/12 bg-white/80 px-2 py-1.5 shadow-sm ring-1 ring-alloy-stone/8"
            aria-label={ariaLabel}
            data-testid={dataTestId}
            data-record-lifecycle-rail="true"
        >
            <ol className="flex w-full min-w-0 list-none items-start overflow-x-auto pb-0.5">
                {model.steps.map((step, index) => {
                    const isLast = index === model.steps.length - 1;
                    const clickable = interactive && Boolean(onStepClick) && step.state !== "future";
                    const StepLabelTag = clickable ? "button" : "span";
                    return (
                        <li
                            key={step.key}
                            className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-1"
                            data-lifecycle-step={step.key}
                            data-lifecycle-step-state={step.state}
                        >
                            <div className="flex w-full items-center">
                                {clickable ? (
                                    <button
                                        type="button"
                                        onClick={() => onStepClick?.(step.key)}
                                        className={`mx-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold leading-none ${stepDotClass(step.state, true)}`}
                                        aria-label={step.label}
                                    />
                                ) : (
                                    <span
                                        className={`mx-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold leading-none ${stepDotClass(step.state, false)}`}
                                        aria-hidden
                                    >
                                        {step.state === "complete" ? "✓" : index + 1}
                                    </span>
                                )}
                                {!isLast ? (
                                    <span
                                        className={`ml-1 mr-0 h-0.5 min-w-[0.35rem] flex-1 rounded-full ${connectorClass(step.state)}`}
                                        aria-hidden
                                    />
                                ) : null}
                            </div>
                            <StepLabelTag
                                {...(clickable
                                    ? {
                                          type: "button" as const,
                                          onClick: () => onStepClick?.(step.key),
                                      }
                                    : {})}
                                className={`max-w-[5.5rem] text-center text-[10px] leading-tight tracking-wide ${stepLabelClass(step.state, clickable)} ${clickable ? "cursor-pointer" : ""}`}
                            >
                                {step.label}
                            </StepLabelTag>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
