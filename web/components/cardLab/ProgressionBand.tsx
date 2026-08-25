"use client";

import clsx from "clsx";

import type { ProgressionStep } from "@/lib/cardLab/cardLabTypes";

/**
 * Horizontal progression band — past → past → current → future, read left to right.
 *
 * The one piece of genuinely new geometry in this pass, and it is used TWICE: Journey lays
 * Business Process stages on it, Attendance lays the child's day on it. Everything inside a
 * column is existing vocabulary — the What's Next label-over-value fact pair, the Household
 * detail line, and the Children `--focused` treatment on the current column.
 *
 * State is carried by colour alone (bend-pine behind what happened, `--alloy-os-border` ahead of
 * it), which is the family's rule, so the band needs no legend, no banner and no second row.
 */
export default function ProgressionBand({
    steps,
    dataName,
    compact = false,
    onCollapsedClick,
}: {
    steps: ProgressionStep[];
    dataName: string;
    /** Journey: fold detail and note onto one line. The strip is orientation, not a report. */
    compact?: boolean;
    onCollapsedClick?: () => void;
}) {
    return (
        <div
            className={clsx("alloy-os-progression", compact && "alloy-os-progression--compact")}
            data-progression={dataName}
        >
            {steps.map((step, i) => (
                <div
                    key={`${step.value}-${i}`}
                    className={clsx(
                        "alloy-os-progression__step",
                        step.state === "current" && "alloy-os-progression__step--current",
                    )}
                    data-progression-state={step.state}
                >
                    <div className="alloy-os-progression__rail" aria-hidden="true">
                        <span className="alloy-os-progression__glyph" data-glyph={step.state}>
                            {step.state === "done" ? (
                                <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
                                    <path
                                        d="M2.5 6.2 4.9 8.6 9.5 3.6"
                                        stroke="currentColor"
                                        strokeWidth="1.9"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            ) : null}
                        </span>
                        {i < steps.length - 1 ? (
                            <span
                                className="alloy-os-progression__connector"
                                data-connector={step.state === "done" ? "done" : "ahead"}
                            />
                        ) : null}
                    </div>
                    <div className="alloy-os-progression__text">
                        {step.label ? (
                            <p className="alloy-os-currentwork__context-label">{step.label}</p>
                        ) : null}
                        {step.state === "collapsed" ? (
                            <button
                                type="button"
                                className="alloy-os-progression__collapsed"
                                onClick={onCollapsedClick}
                            >
                                {step.value}
                            </button>
                        ) : (
                            <p className="alloy-os-progression__value">{step.value}</p>
                        )}
                        {compact ? (
                            step.detail || step.note ? (
                                <p className="alloy-os-progression__detail">
                                    {[step.detail, step.note].filter(Boolean).join(" · ")}
                                </p>
                            ) : null
                        ) : (
                            <>
                                {step.detail ? (
                                    <p className="alloy-os-progression__detail">{step.detail}</p>
                                ) : null}
                                {step.note ? (
                                    <p className="alloy-os-progression__note">{step.note}</p>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
