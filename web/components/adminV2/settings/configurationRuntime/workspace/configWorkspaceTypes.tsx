"use client";

import type { ReactNode } from "react";

/** Shared types for Configuration Runtime workspace primitives (domain-agnostic). */

export type ConfigAttentionGrade = "fix" | "improve" | "good";

export type ConfigAttentionItem = {
    key: string;
    grade: ConfigAttentionGrade;
    /** What is wrong. */
    label: string;
    /** What happens because of it. */
    consequence?: string;
    /** Where the operator goes next (row CTA). */
    nextLabel?: string;
};

export type ConfigReadinessArea = {
    key: string;
    label: string;
    /** true = done, false = incomplete, null = unknown (never treated as incomplete) */
    complete: boolean | null;
};

export type ConfigOperationalActionPriority = "fix" | "next" | "manage";

export type ConfigOperationalAction = {
    id: string;
    label: string;
    reason?: string;
    priority: ConfigOperationalActionPriority;
    disabled?: boolean;
};

export type ConfigGlanceMetricTone = "default" | "attention" | "ready";

export type ConfigGlanceMetric = {
    key: string;
    label: string;
    value: string;
    hint?: string;
    /** Optional semantic glyph for summary objects (capacity, rooms, …). */
    icon?: "capacity" | "rooms" | "programs" | "schedule";
    tone?: ConfigGlanceMetricTone;
    onSelect?: () => void;
};

export type ConfigScopeMode = "organization" | "object";

export type ConfigApplyTarget = {
    id: string;
    label: string;
    subtitle?: string;
    disabled?: boolean;
};

/**
 * `panel` — Level 2 white region on the stone canvas (major section).
 * `region` — Level 2 subsection inside a panel (typography + divider, no second card).
 */
export type ConfigSurface = "panel" | "region";

/** Soft Level 3 object cell — scannable without becoming a floating widget. */
export const CONFIG_OBJECT_CELL =
    "rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-2.5";

/**
 * Workspace section.
 * Prefer `panel` for large white regions on stone; `region` for nested subsections.
 */
export function ConfigWorkspaceCard({
    title,
    description,
    children,
    testId,
    compact = false,
    surface = "panel",
    className = "",
}: {
    title?: string;
    description?: string;
    children: ReactNode;
    testId?: string;
    compact?: boolean;
    surface?: ConfigSurface;
    className?: string;
}) {
    if (surface === "region") {
        return (
            <section
                className={`${compact ? "pt-3" : "pt-4"} border-t border-alloy-stone/25 ${className}`.trim()}
                data-testid={testId}
                data-config-surface="region"
            >
                {title ?
                    <div className={compact ? "mb-2" : "mb-2.5"}>
                        <h2 className="config-typo-workspace-title">{title}</h2>
                        {description ?
                            <p className="config-typo-sublabel mt-0.5">{description}</p>
                        :   null}
                    </div>
                :   null}
                {children}
            </section>
        );
    }

    return (
        <section
            className={`process-config-setup-card ${compact ? "p-3.5" : "p-4"} ${className}`.trim()}
            data-testid={testId}
            data-config-surface="panel"
        >
            {title ?
                <div className={compact ? "mb-2.5" : "mb-3"}>
                    <h2 className="config-typo-workspace-title">{title}</h2>
                    {description ?
                        <p className="config-typo-sublabel mt-0.5">{description}</p>
                    :   null}
                </div>
            :   null}
            {children}
        </section>
    );
}
