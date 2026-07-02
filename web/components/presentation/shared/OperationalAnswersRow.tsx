"use client";

/**
 * Presentation Runtime V2 — the ONE render site for operational answers.
 *
 * Both surfaces mount this component (Workspace as WS.ANSWERS, Work Unit as WU.ANSWERS);
 * nothing else renders an OperationalAnswerModel. Answers with a drill href soft-navigate
 * to the canonical work-unit route; exploratory-only answers render non-navigable.
 */

import Link from "next/link";
import type { OperationalAnswerModel } from "@/lib/presentation/runtime";
import {
    runtimeLabelProps,
    type PresentationRuntimeLabel,
} from "@/components/presentation/runtimeLabels";

function AnswerBody({ answer }: { answer: OperationalAnswerModel }) {
    return (
        <>
            <span className="text-[15px] font-semibold tabular-nums text-alloy-midnight">
                {answer.formattedValue}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-alloy-stone">
                {answer.label}
            </span>
        </>
    );
}

export function OperationalAnswersRow({
    answers,
    label,
}: {
    answers: OperationalAnswerModel[];
    label: PresentationRuntimeLabel;
}) {
    if (!answers.length) return null;
    return (
        <div
            {...runtimeLabelProps(label)}
            className="flex flex-wrap items-stretch gap-2"
            role="list"
            aria-label="Operational answers"
        >
            {answers.map((answer) =>
                answer.href ? (
                    <Link
                        key={answer.key}
                        href={answer.href}
                        role="listitem"
                        data-answer-key={answer.key}
                        className="flex min-w-[112px] flex-col gap-0.5 rounded-lg border border-alloy-stone/18 bg-white px-3 py-2 transition-colors hover:border-alloy-juniper/50"
                    >
                        <AnswerBody answer={answer} />
                    </Link>
                ) : (
                    <div
                        key={answer.key}
                        role="listitem"
                        data-answer-key={answer.key}
                        className="flex min-w-[112px] flex-col gap-0.5 rounded-lg border border-alloy-stone/18 bg-white px-3 py-2"
                    >
                        <AnswerBody answer={answer} />
                    </div>
                ),
            )}
        </div>
    );
}
