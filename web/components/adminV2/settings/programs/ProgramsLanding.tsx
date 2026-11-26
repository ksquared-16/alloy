"use client";

import { useState } from "react";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { ProgramConfigurationSection } from "@/lib/programs/programConfigurationSections";
import type { ProgramsLandingViewModel } from "@/lib/programs/publication/programsLandingModel";

export function programsCollectionUsesBoundedScroll(programCount: number): boolean {
    return programCount >= 7;
}

export default function ProgramsLanding({
    landing,
    showRetired,
    onShowRetiredChange,
    search,
    onSearchChange,
    onOpenProgram,
    onAddProgram,
}: {
    landing: ProgramsLandingViewModel;
    showRetired: boolean;
    onShowRetiredChange: (next: boolean) => void;
    search: string;
    onSearchChange: (next: string) => void;
    onOpenProgram: (programId: string, section?: ProgramConfigurationSection) => void;
    onAddProgram: () => void;
}) {
    const [showAllAttention, setShowAllAttention] = useState(false);
    const canCreate = landing.permissions.canCreateProgram;
    const visible = landing.programs.filter((program) => {
        if (!showRetired && !program.isActive) return false;
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return [program.displayName, program.description, program.audienceLabel, program.key]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(query));
    });

    const attentionPreview = showAllAttention ? landing.attention : landing.attention.slice(0, 5);
    const hasMoreAttention = landing.attention.length > 5;
    const attentionHeadline =
        landing.summary.attentionPrograms === 0 ? "None"
        : `${landing.summary.attentionPrograms} ${
              landing.summary.attentionPrograms === 1 ? "Program needs" : "Programs need"
          } follow-up`;

    const readinessHeadline =
        landing.summary.totalPrograms === 0 ? "0 ready"
        : `${landing.summary.averageReadinessPercent}%`;

    const readinessSublabel =
        landing.summary.totalPrograms === 0 ? "No Programs have been created yet"
        : `${landing.summary.readyPrograms} of ${landing.summary.totalPrograms} ${
              landing.summary.totalPrograms === 1 ? "Program" : "Programs"
          } ready for Location use`;

    return (
        <div
            className="flex w-full flex-col gap-3"
            data-testid="programs-landing"
            data-programs-collection-state={
                landing.summary.totalPrograms === 0 ? "valid_empty" : "populated"
            }
        >
            <div className="grid gap-3 md:grid-cols-3" data-testid="programs-operational-summary">
                <ConfigWorkspaceCard compact className="h-full min-h-[7.5rem]" testId="programs-readiness">
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Program readiness
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            {readinessHeadline}
                        </p>
                        <p className="config-typo-sublabel mt-1">{readinessSublabel}</p>
                        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-alloy-stone/25">
                            <div
                                className="h-full rounded-full bg-alloy-bend-pine"
                                style={{
                                    width: `${Math.min(100, Math.max(0, landing.summary.averageReadinessPercent))}%`,
                                }}
                            />
                        </div>
                    </section>
                </ConfigWorkspaceCard>

                <ConfigWorkspaceCard
                    compact
                    className="h-full min-h-[7.5rem]"
                    testId="programs-attention-summary"
                >
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Needs attention
                        </p>
                        <p className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">
                            {attentionHeadline}
                        </p>
                        <p className="config-typo-sublabel mt-1">
                            {landing.summary.totalPrograms === 0 ?
                                "0 Programs need follow-up"
                            :   `${landing.attention.filter((item) => item.item.grade === "fix").length} blocking · ${
                                    landing.attention.filter((item) => item.item.grade === "improve").length
                                } improvements`}
                        </p>
                    </section>
                </ConfigWorkspaceCard>

                <ConfigWorkspaceCard compact className="h-full min-h-[7.5rem]" testId="programs-inventory">
                    <section>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                            Inventory
                        </p>
                        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-alloy-midnight/80">
                            <div>
                                <dt className="config-typo-sublabel">Programs</dt>
                                <dd className="font-semibold text-alloy-midnight">
                                    {landing.summary.activePrograms}
                                    {landing.summary.retiredPrograms > 0 ?
                                        <span className="ml-1 font-normal text-alloy-midnight/45">
                                            (+{landing.summary.retiredPrograms} retired)
                                        </span>
                                    :   null}
                                </dd>
                            </div>
                            <div>
                                <dt className="config-typo-sublabel">Published</dt>
                                <dd className="font-semibold text-alloy-midnight">
                                    {landing.summary.publishedPrograms}
                                </dd>
                            </div>
                            <div>
                                <dt className="config-typo-sublabel">Assigned</dt>
                                <dd className="font-semibold text-alloy-midnight">
                                    {landing.summary.assignedPrograms}
                                </dd>
                            </div>
                            <div>
                                <dt className="config-typo-sublabel">Delivery Options</dt>
                                <dd className="font-semibold text-alloy-midnight">
                                    {landing.summary.deliveryOptionCount}
                                </dd>
                            </div>
                        </dl>
                    </section>
                </ConfigWorkspaceCard>
            </div>

            <div
                className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(18.75rem,1fr)]"
                data-testid="programs-main-grid"
            >
                <ConfigWorkspaceCard compact testId="programs-list-card">
                    <div className="mb-2.5 flex flex-wrap items-start gap-3">
                        <div className="mr-auto">
                            <p className="config-typo-queue-section-label">Programs</p>
                            <p className="config-typo-sublabel mt-0.5">
                                {visible.length} {visible.length === 1 ? "Program" : "Programs"}
                            </p>
                        </div>
                        <label className="sr-only" htmlFor="programs-search">
                            Search Programs
                        </label>
                        <input
                            id="programs-search"
                            type="search"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                            placeholder="Search Programs"
                            className="config-runtime-input max-w-xs flex-1"
                            data-testid="programs-search"
                        />
                        <label className="flex items-center gap-1.5 self-center text-[11px] text-alloy-midnight/55">
                            <input
                                type="checkbox"
                                checked={showRetired}
                                onChange={(event) => onShowRetiredChange(event.target.checked)}
                                data-testid="programs-show-retired"
                            />
                            Retired
                        </label>
                        {canCreate ?
                            <ConfigurationPrimaryButton
                                onClick={onAddProgram}
                                data-testid="programs-landing-add"
                            >
                                Add Program
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>

                    {visible.length === 0 ?
                        <div className="px-1 py-8 text-center" data-testid="programs-landing-empty">
                            <p className="text-sm font-medium text-alloy-midnight">
                                {landing.summary.totalPrograms === 0 ? "No Programs yet" : "No Programs match"}
                            </p>
                            <p className="config-typo-sublabel mt-1">
                                {landing.summary.totalPrograms === 0 ?
                                    "Create the first reusable Organization service for Locations to offer."
                                :   "Try a different search or include retired Programs."}
                            </p>
                            {canCreate && landing.summary.totalPrograms === 0 ?
                                <ConfigurationPrimaryButton
                                    className="mt-4"
                                    onClick={onAddProgram}
                                    data-testid="programs-landing-empty-add"
                                >
                                    Add Program
                                </ConfigurationPrimaryButton>
                            :   null}
                        </div>
                    :   <ul
                            className={`divide-y divide-alloy-forge/10 ${
                                programsCollectionUsesBoundedScroll(visible.length) ?
                                    "max-h-[28rem] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
                                :   ""
                            }`}
                            data-testid="programs-list"
                        >
                            {visible.map((program) => (
                                <li key={program.id}>
                                    <button
                                        type="button"
                                        className="grid min-h-[4.5rem] w-full grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 px-1 py-2 text-left transition-colors hover:bg-alloy-bend-pine/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alloy-bend-pine/30 md:grid-cols-[minmax(0,1.4fr)_minmax(11rem,0.8fr)_4rem]"
                                        onClick={() => onOpenProgram(program.id, "overview")}
                                        data-testid={`programs-row-${program.id}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-semibold text-alloy-midnight">
                                                    {program.displayName}
                                                </span>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                        program.isActive ?
                                                            "bg-alloy-bend-pine/10 text-[#007d68]"
                                                        :   "bg-alloy-stone/20 text-alloy-midnight/55"
                                                    }`}
                                                >
                                                    {program.isActive ? "Active" : "Retired"}
                                                </span>
                                                {!program.hasPublishedRevision ?
                                                    <span className="rounded-full bg-alloy-blue/10 px-2 py-0.5 text-[10px] font-semibold text-alloy-blue">
                                                        Draft
                                                    </span>
                                                :   null}
                                            </div>
                                            <p className="config-typo-sublabel mt-0.5 truncate">
                                                {[program.audienceLabel, program.description]
                                                    .filter(Boolean)
                                                    .join(" · ") || program.key}
                                            </p>
                                            {program.topAttention && program.topAttention.grade !== "good" ?
                                                <p
                                                    className={`mt-1 truncate text-xs ${
                                                        program.topAttention.grade === "fix" ?
                                                            "text-amber-800"
                                                        :   "text-blue-800"
                                                    }`}
                                                >
                                                    {program.topAttention.label}
                                                </p>
                                            :   null}
                                        </div>
                                        <div className="shrink-0 text-right md:order-3">
                                            <p className="text-xs font-semibold text-alloy-midnight">
                                                {program.readinessPercent}%
                                            </p>
                                            <p className="config-typo-sublabel">ready</p>
                                        </div>
                                        <p className="config-typo-sublabel order-3 col-span-2 mt-1 md:order-2 md:col-span-1 md:mt-0">
                                            {[
                                                program.publicationLabel,
                                                program.assignmentLabel,
                                                `${program.deliveryOptionCount} ${
                                                    program.deliveryOptionCount === 1 ?
                                                        "delivery option"
                                                    :   "delivery options"
                                                }`,
                                            ].join(" · ")}
                                        </p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    }
                </ConfigWorkspaceCard>

                <ConfigWorkspaceCard
                    title="Needs attention"
                    description="Highest-impact gaps across Programs."
                    compact
                    testId="programs-attention-list"
                >
                    {attentionPreview.length > 0 ?
                        <ul className="divide-y divide-alloy-forge/10">
                            {attentionPreview.map((highlight) => (
                                <li
                                    key={`${highlight.programId}-${highlight.item.key}`}
                                    className="py-2 first:pt-0 last:pb-0"
                                >
                                    <button
                                        type="button"
                                        className="-mx-1 w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left hover:bg-alloy-bend-pine/[0.04]"
                                        onClick={() =>
                                            onOpenProgram(highlight.programId, highlight.section)
                                        }
                                        data-testid={`programs-attention-${highlight.programId}-${highlight.item.key}`}
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <span
                                                className={`mt-0.5 ${
                                                    highlight.item.grade === "fix" ?
                                                        "text-amber-700"
                                                    :   "text-blue-700"
                                                }`}
                                                aria-hidden="true"
                                            >
                                                {highlight.item.grade === "fix" ? "⚠" : "ⓘ"}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold leading-snug text-alloy-midnight">
                                                    {highlight.item.label}
                                                </p>
                                                <p className="mt-1 text-[11px] text-alloy-midnight/45">
                                                    {highlight.programName}
                                                </p>
                                                <p className="mt-1 text-xs font-semibold text-alloy-bend-pine">
                                                    {(highlight.item.nextLabel ?? "Open Program") + " →"}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    :   <div className="rounded-md bg-alloy-bend-pine/[0.045] px-3 py-2.5">
                            <p className="text-sm font-semibold text-alloy-midnight">
                                No Programs require attention.
                            </p>
                        </div>
                    }
                    {hasMoreAttention ?
                        <button
                            type="button"
                            className="mt-2.5 text-xs font-semibold text-alloy-bend-pine hover:underline"
                            onClick={() => setShowAllAttention((current) => !current)}
                            aria-expanded={showAllAttention}
                            data-testid="programs-attention-toggle"
                        >
                            {showAllAttention ?
                                "Show less"
                            :   `View all ${landing.attention.length} attention items`}
                        </button>
                    :   null}
                </ConfigWorkspaceCard>
            </div>
        </div>
    );
}
