"use client";

import type { ReactNode } from "react";
import { ConfigAttentionPanel } from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigAttentionPanel";
import { ConfigOperationalReadiness } from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigOperationalReadiness";
import {
    CONFIG_OBJECT_CELL,
    ConfigWorkspaceCard,
} from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import type { ConfigurationDetailSection, ConfigurationRuntimeModel } from "@/lib/configPublication/runtimeModel";

function PostureCell({
    label,
    value,
    detail,
    tone = "default",
    onSelect,
    testId,
}: {
    label: string;
    value: string;
    detail: string;
    tone?: "default" | "good" | "attention";
    onSelect?: () => void;
    testId: string;
}) {
    const content = (
        <>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                {label}
            </span>
            <span
                className={`mt-1 block text-sm font-semibold ${
                    tone === "attention" ? "text-alloy-ember"
                    : tone === "good" ? "text-alloy-bend-pine"
                    : "text-alloy-midnight"
                }`}
            >
                {value}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-alloy-midnight/50">
                {detail}
            </span>
        </>
    );

    if (!onSelect) {
        return (
            <div className={CONFIG_OBJECT_CELL} data-testid={testId}>
                {content}
            </div>
        );
    }
    return (
        <button
            type="button"
            className={`${CONFIG_OBJECT_CELL} w-full text-left hover:border-alloy-bend-pine/25 hover:bg-alloy-bend-pine/[0.035]`}
            onClick={onSelect}
            data-testid={testId}
        >
            {content}
        </button>
    );
}

/** Read-first overview for every publishable Configuration object. */
export function ConfigPublicationOverview({
    model,
    activePublishedAt,
    domainSummary,
    onOpenSection,
    testId = "config-publication-overview",
}: {
    model: ConfigurationRuntimeModel;
    activePublishedAt: string | null;
    domainSummary?: ReactNode;
    onOpenSection: (section: ConfigurationDetailSection) => void;
    testId?: string;
}) {
    const publishedDetail =
        activePublishedAt ?
            `Published ${new Date(activePublishedAt).toLocaleString()}`
        :   "Locations are not consuming a published revision.";
    const assignmentTone =
        model.assignment.state === "attention" ? "attention"
        : model.assignment.state === "current" ? "good"
        : "default";

    return (
        <div className="flex flex-col gap-4 pb-2" data-testid={testId}>
            <ConfigWorkspaceCard
                title="At a glance"
                description="Current publication, working draft, and Location consumption."
                compact
                testId={`${testId}-glance`}
            >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <PostureCell
                        label="Active revision"
                        value={model.publication.activeRevisionLabel}
                        detail={publishedDetail}
                        tone={model.publication.state === "draft_only" ? "attention" : "good"}
                        onSelect={() => onOpenSection("history")}
                        testId={`${testId}-active-revision`}
                    />
                    <PostureCell
                        label="Working draft"
                        value={model.publication.draftLabel}
                        detail={
                            model.publication.hasUnpublishedChanges ?
                                "Draft changes do not affect Locations until published."
                            :   "The draft matches the active published revision."
                        }
                        tone={model.publication.hasUnpublishedChanges ? "attention" : "good"}
                        onSelect={() => onOpenSection("draft")}
                        testId={`${testId}-draft`}
                    />
                    <PostureCell
                        label="Assignments"
                        value={model.assignment.label}
                        detail={
                            model.assignment.driftCount > 0 ?
                                `${model.assignment.driftCount} consuming an earlier revision.`
                            : model.assignment.failedCount > 0 ?
                                `${model.assignment.failedCount} failed assignment.`
                            : model.assignment.assignedCount > 0 ?
                                `${model.assignment.currentCount} consuming the active revision.`
                            :   "No Locations currently consume this configuration."
                        }
                        tone={assignmentTone}
                        onSelect={() => onOpenSection("assignment")}
                        testId={`${testId}-assignments`}
                    />
                </div>
                {domainSummary ?
                    <div className="mt-4 border-t border-alloy-stone/20 pt-4">{domainSummary}</div>
                :   null}
            </ConfigWorkspaceCard>

            <div className={`grid items-stretch gap-4 ${model.attention.length > 0 ? "lg:grid-cols-2" : ""}`}>
                {model.attention.length > 0 ?
                    <ConfigWorkspaceCard compact className="h-full" testId={`${testId}-attention`}>
                        <ConfigAttentionPanel
                            items={model.attention}
                            onResolve={(item) => {
                                const match = model.attention.find((entry) => entry.key === item.key);
                                if (match) onOpenSection(match.section);
                            }}
                            compact
                            embedded
                            testId={`${testId}-attention-list`}
                        />
                    </ConfigWorkspaceCard>
                :   null}
                <ConfigWorkspaceCard
                    title="Configuration readiness"
                    description="What is complete for this object."
                    compact
                    className="h-full"
                    testId={`${testId}-readiness`}
                >
                    <ConfigOperationalReadiness
                        percent={model.readiness.percent}
                        areas={model.readiness.areas}
                        onSelectArea={(area) => {
                            const match = model.readiness.areas.find((entry) => entry.key === area.key);
                            if (match) onOpenSection(match.section);
                        }}
                        compact
                        embedded
                        testId={`${testId}-readiness-detail`}
                    />
                </ConfigWorkspaceCard>
            </div>
        </div>
    );
}
