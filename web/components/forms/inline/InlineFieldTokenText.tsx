"use client";

import clsx from "clsx";
import type { InlineFieldTokenResolution, InlineFieldTokenSegment } from "@/lib/forms/inlineFieldTokens";

type Props = {
    resolution: InlineFieldTokenResolution;
    /** Authoring / preview without values — show labeled chips instead of blank gaps. */
    mode?: "runtime" | "authoring";
    className?: string;
    "data-testid"?: string;
};

function TokenSpan({
    segment,
    mode,
}: {
    segment: Extract<InlineFieldTokenSegment, { kind: "token" }>;
    mode: "runtime" | "authoring";
}) {
    if (segment.status === "resolved" && segment.displayValue) {
        return <span data-testid={`inline-token-resolved-${segment.fieldKey}`}>{segment.displayValue}</span>;
    }

    const label = segment.fieldLabel ?? segment.fieldKey;
    const missingLabel = mode === "authoring" ? label : `[${label}]`;

    return (
        <span
            className={clsx(
                "rounded px-0.5 font-medium",
                segment.status === "unknown" ?
                    "bg-amber-100 text-amber-950 ring-1 ring-amber-200/80"
                :   "bg-sky-100 text-sky-950 ring-1 ring-sky-200/80"
            )}
            title={
                segment.status === "unknown" ? `Unknown field: ${segment.fieldKey}`
                : segment.required ? `Required field not filled: ${label}`
                : `Field not filled: ${label}`
            }
            data-testid={`inline-token-${segment.status}-${segment.fieldKey}`}
        >
            {missingLabel}
        </span>
    );
}

/** Render paragraph text with inline field tokens resolved or highlighted. */
export function InlineFieldTokenText({ resolution, mode = "runtime", className, "data-testid": testId }: Props) {
    return (
        <span className={clsx("whitespace-pre-wrap", className)} data-testid={testId}>
            {resolution.segments.map((segment, i) =>
                segment.kind === "text" ?
                    <span key={`t-${i}`}>{segment.text}</span>
                :   <TokenSpan key={`k-${segment.fieldKey}-${i}`} segment={segment} mode={mode} />
            )}
        </span>
    );
}
