"use client";

import clsx from "clsx";
import Link from "next/link";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { FormLifecycleStepTone, FormLifecycleStepView } from "@/lib/forms/formLifecyclePresentation";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

function toneForBadge(tone: FormLifecycleStepTone): "success" | "warning" | "info" | "neutral" {
    return tone;
}

type Props = {
    steps: FormLifecycleStepView[];
};

/** Horizontal lifecycle band for form detail workspace (OW-3). */
export function FormLifecycleRail({ steps }: Props) {
    return (
        <nav
            className="overflow-x-auto pb-1"
            aria-label="Form lifecycle"
            data-testid="form-lifecycle-rail"
        >
            <ol className="flex min-w-max gap-2">
                {steps.map((step, index) => (
                    <li key={step.key} className="flex items-stretch">
                        <Link
                            href={`#${step.anchor}`}
                            className={clsx(
                                "flex min-w-[9.5rem] flex-col rounded-lg px-3 py-2.5 ring-1 transition-colors hover:bg-alloy-stone/20",
                                step.state === "active" ?
                                    "bg-alloy-stone/25 ring-alloy-blue/25"
                                : step.state === "complete" ?
                                    "bg-white/80 ring-alloy-midnight/[0.08]"
                                :   "bg-white/50 ring-alloy-midnight/[0.06]"
                            )}
                            data-testid={`form-lifecycle-step-${step.key}`}
                        >
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                {index + 1}. {step.label}
                            </span>
                            <span className="mt-1">
                                <FormsReviewBadge label={step.statusLabel} tone={toneForBadge(step.tone)} />
                            </span>
                            <span className={clsx("mt-1.5 line-clamp-2", opMutedMeta)}>{step.nextHint}</span>
                        </Link>
                        {index < steps.length - 1 ?
                            <span className="mx-1 hidden self-center text-alloy-midnight/25 sm:inline" aria-hidden>
                                →
                            </span>
                        :   null}
                    </li>
                ))}
            </ol>
            <p className={clsx("mt-2", opMetadata)}>
                Build form → Publish → Configure intake → Share → Review → Documents
            </p>
        </nav>
    );
}
