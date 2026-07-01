"use client";

import type { ReactNode } from "react";
import {
    ConfigurationDetailCard,
    ConfigurationContext,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

/**
 * DesignedConfigurationSurface — the consistent shell for a Financial
 * Configuration area (Financial Configuration Convergence).
 *
 * Financials is organized around operational DECISIONS, not tables. Every area
 * answers "what decision is the finance administrator making?" and shares one
 * editing language: a decision framing, the configuration structure that lives
 * here, an effective-dated/versioned posture note, and a clear backend roadmap.
 *
 * Areas whose backend already exists pass real authoring/preview as `children`;
 * areas that are designed-but-not-yet-authorable render their planned structure
 * so the surface feels complete and shows exactly where a future capability
 * (Billing, Posting, Payments, Subsidy, …) will plug in.
 */

export type AreaStatus = "authorable" | "read_only" | "designed";

const STATUS_BADGE: Record<AreaStatus, { label: string; className: string }> = {
    authorable: { label: "Configurable now", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    read_only: { label: "Read-only", className: "border-sky-200 bg-sky-50 text-sky-700" },
    designed: { label: "Designed · backend next", className: "border-amber-200 bg-amber-50 text-amber-700" },
};

export type DesignedDecisionGroup = {
    heading: string;
    /** The decisions / fields an administrator configures in this group. */
    decisions: string[];
};

export function DesignedConfigurationSurface({
    title,
    decision,
    status,
    summary,
    groups,
    roadmap,
    consumers,
    testId,
    children,
}: {
    title: string;
    /** One line: the operational decision this area owns. */
    decision: string;
    status: AreaStatus;
    summary?: string;
    /** The configuration structure that lives here (decisions grouped). */
    groups?: DesignedDecisionGroup[];
    /** What unlocks full authoring (backend dependency). */
    roadmap?: string;
    /** Downstream capabilities that will consume this configuration. */
    consumers?: string[];
    testId?: string;
    /** Real, backed authoring/preview rendered above the designed structure. */
    children?: ReactNode;
}) {
    const badge = STATUS_BADGE[status];
    return (
        <div className="space-y-3" data-testid={testId}>
            <ConfigurationContext title={title} subtitle={decision} testId={testId ? `${testId}-context` : undefined} />

            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                    data-testid={testId ? `${testId}-status` : undefined}
                >
                    {badge.label}
                </span>
                {summary ? <span className="config-typo-sublabel text-alloy-forge/70">{summary}</span> : null}
            </div>

            {children}

            {groups && groups.length > 0 ? (
                <ConfigurationDetailCard title="What you configure here" testId={testId ? `${testId}-structure` : undefined}>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {groups.map((g) => (
                            <div key={g.heading}>
                                <p className="config-typo-field-value mb-1 text-alloy-midnight">{g.heading}</p>
                                <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-alloy-forge/75">
                                    {g.decisions.map((d) => (
                                        <li key={d}>{d}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </ConfigurationDetailCard>
            ) : null}

            {consumers && consumers.length > 0 ? (
                <ConfigurationDetailCard title="Consumed by" testId={testId ? `${testId}-consumers` : undefined}>
                    <p className="config-typo-sublabel mb-2 text-alloy-forge/60">
                        These capabilities resolve from this configuration — no redesign needed when they ship.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {consumers.map((c) => (
                            <span
                                key={c}
                                className="inline-flex items-center rounded-full border border-alloy-stone/40 bg-white px-2 py-0.5 text-[11px] text-alloy-forge/70"
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                </ConfigurationDetailCard>
            ) : null}

            {roadmap ? (
                <div
                    className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-[12px] leading-relaxed text-alloy-forge/80"
                    role="note"
                    data-testid={testId ? `${testId}-roadmap` : undefined}
                >
                    <span aria-hidden className="mt-0.5 font-semibold text-amber-700">
                        Roadmap
                    </span>
                    <span>{roadmap}</span>
                </div>
            ) : null}
        </div>
    );
}
