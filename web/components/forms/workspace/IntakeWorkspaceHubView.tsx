"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TechnicalDetailDisclosure } from "@/components/forms/review";
import { FormsWorkspaceShell } from "@/components/forms/workspace";
import { IntakeWorkspaceFilterPanelView } from "@/components/forms/workspace/IntakeWorkspaceFilterPanelView";
import { IntakeWorkloadFilterStrip } from "@/components/forms/workspace/IntakeWorkloadFilterStrip";
import type { IntakeCommandCenterSessionRow } from "@/lib/forms/intakeCommandCenterPresentation";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    buildIntakeWorkspaceFilterPanel,
    countIntakeWorkspaceFilters,
    defaultIntakeWorkspaceFilter,
    type IntakeWorkspaceFilterKey,
} from "@/lib/forms/intakeWorkspaceFilters";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

export type IntakeWorkspaceFormRow = {
    id: string;
    name: string;
    description: string | null;
    metadata?: Record<string, unknown>;
    has_published_version?: boolean;
};

export type IntakeWorkspaceSessionRow = IntakeCommandCenterSessionRow;

export type IntakeWorkspacePacketRow = {
    id: string;
    name: string;
    is_active?: boolean;
};

export type IntakeWorkspaceSubmissionRow = SubmissionInboxRow;

export const intakeWorkspaceBtnPrimary =
    "rounded-lg bg-alloy-blue px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40";
export const intakeWorkspaceBtnSecondary =
    "rounded-lg px-3 py-1.5 text-xs font-medium text-alloy-midnight/75 hover:bg-alloy-stone/30 hover:text-alloy-midnight disabled:opacity-40";

type Props = {
    viewerTz: string;
    forms: IntakeWorkspaceFormRow[];
    sessions: IntakeWorkspaceSessionRow[];
    packets: IntakeWorkspacePacketRow[];
    submissions: IntakeWorkspaceSubmissionRow[];
    loading?: boolean;
    error?: string | null;
    canMutate?: boolean;
    showCreate?: boolean;
    onToggleCreate?: () => void;
    createPanel?: ReactNode;
};

export function IntakeWorkspaceHubView({
    forms,
    sessions,
    packets,
    submissions,
    loading = false,
    error = null,
    canMutate = false,
    showCreate = false,
    onToggleCreate,
    createPanel,
}: Props) {
    const formsById = Object.fromEntries(forms.map((f) => [f.id, f.name]));
    const filterCounts = useMemo(
        () =>
            countIntakeWorkspaceFilters({
                submissions,
                sessions,
                forms,
                packets,
            }),
        [submissions, sessions, forms, packets]
    );

    const [activeFilter, setActiveFilter] = useState<IntakeWorkspaceFilterKey>(() =>
        defaultIntakeWorkspaceFilter(filterCounts)
    );

    const panel = useMemo(
        () =>
            buildIntakeWorkspaceFilterPanel(activeFilter, {
                submissions,
                sessions,
                forms: forms.map((f) => ({ id: f.id, name: f.name, has_published_version: f.has_published_version })),
                packets: packets.map((p) => ({ id: p.id, name: p.name })),
                formsById,
            }),
        [activeFilter, submissions, sessions, forms, packets, formsById]
    );

    const reviewCount = filterCounts.needs_review + filterCounts.needs_linking;

    return (
        <FormsWorkspaceShell
            title="Forms"
            subtitle="Intake workload, packets, sessions, and submissions."
            actions={
                canMutate && onToggleCreate ?
                    <button type="button" className={intakeWorkspaceBtnPrimary} onClick={onToggleCreate}>
                        {showCreate ? "Close" : "New form"}
                    </button>
                :   null
            }
            contentClassName="space-y-0"
        >
            {showCreate && createPanel ? <div className="mb-4">{createPanel}</div> : null}

            {loading ?
                <p className={opMetadata}>Loading…</p>
            : error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            :   <div data-testid="intake-workspace-command-center" className="space-y-4">
                    <div
                        className="flex flex-wrap items-center justify-between gap-3"
                        data-testid="intake-command-orientation"
                    >
                        <div>
                            <p className="text-sm font-semibold text-alloy-midnight">
                                {reviewCount > 0 ?
                                    `${reviewCount} need review or linkage`
                                : filterCounts.waiting > 0 ?
                                    `${filterCounts.waiting} waiting on families`
                                :   "Workload is clear"}
                            </p>
                            <p className={opMetadata}>
                                {filterCounts.forms} forms · {filterCounts.packets} packets ·{" "}
                                {filterCounts.needs_review + filterCounts.needs_linking + filterCounts.waiting} active
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            <Link href={FORMS_MODULE_ROUTES.submissionsHub} className={intakeWorkspaceBtnSecondary}>
                                Submissions
                            </Link>
                            <Link href={FORMS_MODULE_ROUTES.packetSessions} className={intakeWorkspaceBtnSecondary}>
                                Sessions
                            </Link>
                            <Link href={FORMS_MODULE_ROUTES.packetDefinitions} className={intakeWorkspaceBtnSecondary}>
                                Packets
                            </Link>
                        </div>
                    </div>

                    <div data-testid="intake-workspace-canvas" className="space-y-3">
                        <IntakeWorkloadFilterStrip
                            counts={filterCounts}
                            selected={activeFilter}
                            onSelect={setActiveFilter}
                        />
                        <div className="rounded-xl bg-white/80 px-4 py-3 ring-1 ring-alloy-midnight/[0.06]">
                            <IntakeWorkspaceFilterPanelView panel={panel} />
                        </div>
                    </div>

                    <TechnicalDetailDisclosure title="Operator notes" helperText="Collapsed by default.">
                        <p className={opMetadata}>
                            Publish before distributing. Native admin authoring and review — iframe embed is for external
                            intake only.
                        </p>
                    </TechnicalDetailDisclosure>
                </div>
            }
        </FormsWorkspaceShell>
    );
}
