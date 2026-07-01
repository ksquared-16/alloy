"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { formsCaseFileBodyText } from "@/lib/forms/review/formsReviewClassTokens";

export type FormsReviewStateVariant = "loading" | "empty" | "error" | "unavailable";

const VARIANT_SURFACE: Record<FormsReviewStateVariant, string> = {
    loading: "border-admin-border bg-alloy-stone/15 text-alloy-midnight/70",
    empty: "border-admin-border bg-alloy-stone/10 text-alloy-midnight/65",
    error: "border-alloy-ember/35 bg-alloy-ember/8 text-alloy-ember",
    unavailable: "border-admin-border bg-alloy-stone/10 text-alloy-midnight/60",
};

type Props = {
    variant: FormsReviewStateVariant;
    message: string;
    className?: string;
    /** Optional retry for error variant */
    onRetry?: () => void;
    retryLabel?: string;
    children?: ReactNode;
};

/** Calm loading / empty / error / unavailable patterns for review surfaces. */
export function FormsReviewStatePanel({
    variant,
    message,
    className,
    onRetry,
    retryLabel = "Retry",
    children,
}: Props) {
    const isError = variant === "error";

    return (
        <div
            role={isError ? "alert" : variant === "loading" ? "status" : undefined}
            className={clsx(
                "rounded-lg border px-4 py-4 text-center sm:text-left",
                VARIANT_SURFACE[variant],
                formsCaseFileBodyText,
                className
            )}
            data-testid={`forms-review-state-${variant}`}
        >
            <p>{message}</p>
            {children ?
                <div className="mt-2">{children}</div>
            : null}
            {isError && onRetry ?
                <button
                    type="button"
                    className="mt-3 rounded border border-alloy-ember/40 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-ember hover:bg-alloy-ember/5"
                    onClick={onRetry}
                >
                    {retryLabel}
                </button>
            : null}
        </div>
    );
}
