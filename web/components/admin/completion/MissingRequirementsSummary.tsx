"use client";

import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import {
    COMPLETION_FOUNDATION_PREVIEW_NOTE,
    COMPLETION_SUMMARY_DEFAULT_TITLE,
    COMPLETION_SUMMARY_EMPTY_PREVIEW,
} from "@/lib/completion/completionGuardrailsCopy";

type MissingRequirementsSummaryProps = {
    result: RequirementValidationResult;
    title?: string;
    className?: string;
    compact?: boolean;
    /** When true (default in compact mode), show foundation-scope disclaimer. */
    showFoundationNote?: boolean;
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
 * Compact completion preview panel — blocking, warnings, and recommendations.
 * Sprint B foundation only; does not imply required fields are fully configured in Settings.
 */
export default function MissingRequirementsSummary({
    result,
    title = COMPLETION_SUMMARY_DEFAULT_TITLE,
    className = "",
    compact = false,
    showFoundationNote,
}: MissingRequirementsSummaryProps) {
    const foundationNoteVisible = showFoundationNote ?? compact;
    const hasAny =
        result.blocking.length > 0 || result.warnings.length > 0 || result.recommendations.length > 0;

    if (!hasAny) {
        return (
            <div className={className} data-completion-requirements-summary="true">
                <p
                    className="text-[11px] leading-snug text-alloy-midnight/50"
                    data-completion-requirements-empty="true"
                    data-review-assist-calm="true"
                >
                    {COMPLETION_SUMMARY_EMPTY_PREVIEW}
                </p>
                {foundationNoteVisible ? (
                    <p
                        className="mt-1 text-[10px] leading-snug text-alloy-midnight/40"
                        data-completion-foundation-note="true"
                    >
                        {COMPLETION_FOUNDATION_PREVIEW_NOTE}
                    </p>
                ) : null}
            </div>
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
            {foundationNoteVisible ? (
                <p
                    className="mt-2 text-[10px] leading-snug text-alloy-midnight/40"
                    data-completion-foundation-note="true"
                >
                    {COMPLETION_FOUNDATION_PREVIEW_NOTE}
                </p>
            ) : null}
        </div>
    );
}
