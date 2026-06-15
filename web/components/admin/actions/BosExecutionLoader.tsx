"use client";

import { useEffect, useState } from "react";

import { AlloyIdentityLoader } from "@/app/adminV2/components/bos/identity/AlloyIdentityLoader";
import type { BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

export type BosExecutionLoaderVariant = "inline" | "panel" | "fullscreen" | "drawer";

/**
 * Canonical BOS execution loading — Alloy mark, horizon, atmospheric smoke, optional phased progress.
 *
 * Use when the system is working, executing, navigating, or preparing operational data
 * (Create Lead, Add Child, Schedule Tour, drawer open, cold route prep, workflow execute).
 *
 * **Do not use** for tiny inline button busy states — keep a small spinner or label there.
 */
export const BOS_EXECUTION_LOADER_DEFAULT_TITLE = "Preparing workspace…";

export const BOS_EXECUTION_LOADER_PHASES_CREATE_LEAD = [
    "Reading inquiry",
    "Identifying family",
    "Creating household",
    "Creating lead",
    "Finalizing record",
] as const;

export const BOS_EXECUTION_LOADER_PHASES_ADD_CHILD = [
    "Reading inquiry context",
    "Creating child record",
    "Linking participation",
    "Finalizing inquiry",
] as const;

export const BOS_EXECUTION_LOADER_PHASES_SCHEDULE_TOUR = [
    "Checking availability",
    "Reserving tour slot",
    "Starting follow-up workflow",
    "Updating inquiry",
] as const;

export const BOS_EXECUTION_LOADER_PHASES_SEND_WELCOME = [
    "Preparing message",
    "Personalizing content",
    "Sending communication",
    "Confirming delivery",
] as const;

export const BOS_EXECUTION_LOADER_PHASES_DRAWER_PREP = [
    "Loading record context",
    "Assembling workspace",
    "Preparing actions",
] as const;

/** @deprecated Use `steps` */
export type BosExecutionLoaderAssemblyPhases = readonly string[];

type Props = {
    title?: string;
    /** Secondary line under the title. */
    subtitle?: string;
    /** @deprecated Prefer `subtitle` */
    detail?: string;
    steps?: readonly string[];
    /** @deprecated Prefer `steps` */
    assemblyPhases?: readonly string[];
    /** Controlled active step index; omit to auto-advance through `steps`. */
    activeStep?: number;
    showProgress?: boolean;
    variant?: BosExecutionLoaderVariant;
    "data-testid"?: string;
};

const VARIANT_LAYOUT: Record<
    BosExecutionLoaderVariant,
    {
        root: string;
        identity: string;
        markSize: BosIdentitySize;
        showStepsDefault: boolean;
        showProgressDefault: boolean;
    }
> = {
    inline: {
        root: "flex min-h-0 items-center gap-4 px-1 py-2",
        identity: "shrink-0 scale-[0.82]",
        markSize: "sm",
        showStepsDefault: false,
        showProgressDefault: false,
    },
    panel: {
        root: "flex min-h-[12rem] items-center justify-center gap-8 px-4 py-8",
        identity: "shrink-0",
        markSize: "md",
        showStepsDefault: false,
        showProgressDefault: false,
    },
    drawer: {
        root: "flex min-h-[10rem] w-full items-center justify-center gap-8 px-4 py-8",
        identity: "shrink-0",
        markSize: "md",
        showStepsDefault: false,
        showProgressDefault: false,
    },
    fullscreen: {
        root: "flex min-h-[320px] items-center justify-center gap-12 px-4",
        identity: "shrink-0",
        markSize: "lg",
        showStepsDefault: true,
        showProgressDefault: true,
    },
};

function resolveSteps(props: Pick<Props, "steps" | "assemblyPhases">): readonly string[] {
    const steps = props.steps ?? props.assemblyPhases;
    return steps && steps.length > 0 ? steps : [];
}

export function BosExecutionLoader({
    title = BOS_EXECUTION_LOADER_DEFAULT_TITLE,
    subtitle,
    detail,
    steps: stepsProp,
    assemblyPhases,
    activeStep: activeStepProp,
    showProgress,
    variant = "fullscreen",
    "data-testid": dataTestId = "bos-execution-loader",
}: Props) {
    const layout = VARIANT_LAYOUT[variant];
    const steps = resolveSteps({ steps: stepsProp, assemblyPhases });
    const resolvedSubtitle = subtitle ?? detail;
    const showSteps = layout.showStepsDefault && steps.length > 0;
    const showProgressBar = showProgress ?? (layout.showProgressDefault && steps.length > 1);
    const [autoStepIndex, setAutoStepIndex] = useState(0);
    const phaseIndex = activeStepProp ?? autoStepIndex;
    const activePhase = steps[phaseIndex] ?? steps[steps.length - 1] ?? title;
    const progress = steps.length > 0 ? ((phaseIndex + 1) / steps.length) * 100 : 0;

    useEffect(() => {
        if (activeStepProp != null || steps.length <= 1) return;
        const timer = window.setInterval(() => {
            setAutoStepIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
        }, 850);
        return () => window.clearInterval(timer);
    }, [activeStepProp, steps.length]);

    const titleClass =
        variant === "inline" ? "text-[13px] font-semibold text-alloy-midnight"
        : variant === "drawer" || variant === "panel" ? "text-base font-semibold text-alloy-midnight"
        : "text-lg font-semibold text-alloy-midnight";

    const subtitleClass =
        variant === "inline" ? "mt-0.5 text-[11px] leading-snug text-alloy-midnight/55"
        : "mt-1 text-sm text-alloy-midnight/55";

    return (
        <div
            className={layout.root}
            data-testid={dataTestId}
            data-bos-execution-loader="true"
            data-bos-execution-loader-variant={variant}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label={title}
        >
            <AlloyIdentityLoader
                markSize={layout.markSize}
                showMessage={false}
                className={layout.identity}
                data-testid="bos-execution-loader-identity"
            />
            <div className={`min-w-0 ${variant === "inline" ? "flex-1" : "max-w-lg"} text-left`}>
                <p className={titleClass}>{title}</p>
                {resolvedSubtitle ?
                    <p className={subtitleClass}>{resolvedSubtitle}</p>
                :   null}
                {showSteps ?
                    <div className="mt-6 space-y-2" aria-live="polite">
                        {steps.map((phase, index) => {
                            const done = index < phaseIndex;
                            const active = index === phaseIndex;
                            return (
                                <div
                                    key={`${phase}-${index}`}
                                    className={
                                        active ?
                                            "flex items-center gap-2 text-sm font-medium text-[#007A63]"
                                        : done ?
                                            "flex items-center gap-2 text-sm text-alloy-midnight/45"
                                        :   "flex items-center gap-2 text-sm text-alloy-midnight/30"
                                    }
                                    data-testid={active ? "bos-execution-loader-phase" : undefined}
                                >
                                    <span
                                        className={
                                            active ?
                                                "flex h-5 w-5 items-center justify-center rounded-full bg-[#00A283]/15 text-[10px] text-[#007A63]"
                                            : done ?
                                                "flex h-5 w-5 items-center justify-center rounded-full bg-alloy-pine/10 text-[10px] text-alloy-pine/70"
                                            :   "flex h-5 w-5 items-center justify-center rounded-full bg-alloy-stone/10 text-[10px] text-alloy-midnight/25"
                                        }
                                        aria-hidden
                                    >
                                        {done ? "✓" : index + 1}
                                    </span>
                                    {phase}
                                </div>
                            );
                        })}
                    </div>
                :   null}
                {showProgressBar ?
                    <div className={`${showSteps ? "mt-5" : "mt-4"} h-1.5 overflow-hidden rounded-full bg-alloy-pine/10`}>
                        <div
                            className="h-full rounded-full bg-[#00A283] transition-all duration-700 ease-out"
                            style={{ width: `${progress}%` }}
                            data-testid="bos-execution-loader-progress"
                        />
                    </div>
                :   null}
                <p className="sr-only">{activePhase}</p>
            </div>
        </div>
    );
}
