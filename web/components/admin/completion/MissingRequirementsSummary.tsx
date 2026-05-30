"use client";

import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

type MissingRequirementsSummaryProps = {
    result: RequirementValidationResult;
    title?: string;
    className?: string;
    compact?: boolean;
};

function toneClass(level: "block" | "warn" | "rec"): string {
    switch (level) {
        case "block":
            return "text-alloy-midnight/75";
        case "warn":
            return "text-amber-800/80";
        case "rec":
            return "text-alloy-midnight/45";
    }
}

function RequirementList({
    items,
    tone,
    prefix,
}: {
    items: { label: string; missing_reason: string }[];
    tone: "block" | "warn" | "rec";
    prefix?: string;
}) {
    if (!items.length) return null;
    return (
        <ul className={`mt-1 space-y-0.5 text-[11px] leading-snug ${toneClass(tone)}`}>
            {items.map((item) => (
                <li key={`${prefix ?? ""}${item.label}`} data-completion-requirement={tone}>
                    <span className="font-medium text-alloy-midnight/70">{item.label}</span>
                    {item.missing_reason ? (
                        <span className="text-alloy-midnight/50"> — {item.missing_reason}</span>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}

/**
 * Compact missing-requirements panel — blocking, warnings, and recommendations
 * without field-by-field red clutter.
 */
export default function MissingRequirementsSummary({
    result,
    title = "Missing before next step",
    className = "",
    compact = false,
}: MissingRequirementsSummaryProps) {
    const hasAny =
        result.blocking.length > 0 || result.warnings.length > 0 || result.recommendations.length > 0;

    if (!hasAny) {
        return (
            <p
                className="text-[11px] leading-snug text-alloy-midnight/50"
                data-completion-requirements-empty="true"
                data-review-assist-calm="true"
            >
                No missing requirements flagged.
            </p>
        );
    }

    if (compact && result.ok && result.warnings.length === 0 && result.recommendations.length > 0) {
        return (
            <div className={className} data-completion-requirements-summary="true">
                <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                    Recommended
                </p>
                <RequirementList items={result.recommendations} tone="rec" prefix="rec-" />
            </div>
        );
    }

    return (
        <div className={className} data-completion-requirements-summary="true">
            {result.blocking.length > 0 ? (
                <div data-completion-requirements-blocking="true">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/55">
                        {title}
                    </p>
                    <RequirementList items={result.blocking} tone="block" prefix="block-" />
                </div>
            ) : null}
            {result.warnings.length > 0 ? (
                <div className={result.blocking.length ? "mt-2" : ""} data-completion-requirements-warnings="true">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800/70">
                        {compact ? "Suggested" : "Warnings"}
                    </p>
                    <RequirementList items={result.warnings} tone="warn" prefix="warn-" />
                </div>
            ) : null}
            {result.recommendations.length > 0 ? (
                <div
                    className={result.blocking.length || result.warnings.length ? "mt-2" : ""}
                    data-completion-requirements-recommendations="true"
                >
                    <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        Recommended
                    </p>
                    <RequirementList items={result.recommendations} tone="rec" prefix="rec-" />
                </div>
            ) : null}
        </div>
    );
}
