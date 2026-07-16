"use client";

import type { ReactNode } from "react";

/** Shared types for Configuration Runtime workspace primitives (domain-agnostic). */

export type ConfigAttentionGrade = "fix" | "improve" | "good";

export type ConfigAttentionItem = {
    key: string;
    grade: ConfigAttentionGrade;
    label: string;
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

export function ConfigWorkspaceCard({
    title,
    description,
    children,
    testId,
    compact = false,
}: {
    title?: string;
    description?: string;
    children: ReactNode;
    testId?: string;
    compact?: boolean;
}) {
    return (
        <section className={`process-config-setup-card ${compact ? "p-3" : "p-4"}`} data-testid={testId}>
            {title ?
                <div className={compact ? "mb-2" : "mb-3"}>
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
