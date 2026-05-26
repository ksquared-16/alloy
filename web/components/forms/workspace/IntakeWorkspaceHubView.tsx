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
import { opCaseFileCanvas, opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

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
    "rounded-lg bg-alloy-blue px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40";
export const intakeWorkspaceBtnSecondary =
    "rounded-lg border border-alloy-midnight/10 bg-white px-3.5 py-2 text-xs font-medium text-alloy-midnight/85 shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40";

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

    const workloadHeadline =
        filterCounts.needs_review + filterCounts.needs_linking > 0 ?
            `${filterCounts.needs_review + filterCounts.needs_linking} in review or linkage`
        : filterCounts.waiting > 0 ?
            `${filterCounts.waiting} waiting on families`
        :   "Intake workload is clear";

    const reviewCount = filterCounts.needs_review + filterCounts.needs_linking;

    return (
        <FormsWorkspaceShell
            title="Intake workspace"
            subtitle="Workload, review, and distribution."
            actions={
                canMutate && onToggleCreate ?
                    <button type="button" className={intakeWorkspaceBtnPrimary} onClick={onToggleCreate}>
                        {showCreate ? "Close" : "New form"}
                    </button>
                :   null
            }
            contentClassName="space-y-0"
        >
            {showCreate && createPanel ? <div className="mb-3">{createPanel}</div> : null}

            {loading ?
                <p className={opMetadata}>Loading intake workspace…</p>
            : error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            :   <div data-testid="intake-workspace-command-center">
                    <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-alloy-midnight/[0.08]"
                        data-testid="intake-command-orientation"
                    >
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-alloy-midnight">{workloadHeadline}</p>
                            <p className={opMetadata}>
                                {reviewCount > 0 ? `${reviewCount} need you` : "All clear"}
                                {" · "}
                                {filterCounts.forms} forms · {filterCounts.packets} packets
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link href={FORMS_MODULE_ROUTES.submissionsHub} className={intakeWorkspaceBtnSecondary}>
                                Submissions
                            </Link>
                            <Link href={FORMS_MODULE_ROUTES.packetSessions} className={intakeWorkspaceBtnSecondary}>
                                Sessions
                            </Link>
                        </div>
                    </div>

                    <div
                        className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start"
                        data-testid="intake-workspace-canvas"
                    >
                        <IntakeWorkloadFilterStrip
                            counts={filterCounts}
                            selected={activeFilter}
                            onSelect={setActiveFilter}
                            stack
                        />
                        <div className={clsx(opCaseFileCanvas, "px-3 py-3 sm:px-4")}>
                            <IntakeWorkspaceFilterPanelView panel={panel} />
                        </div>
                    </div>

                    <div className="mt-3">
                        <TechnicalDetailDisclosure title="Operator notes" helperText="Collapsed by default.">
                            <p className={opMetadata}>
                                Publish before distributing. Packet review uses the session case file. Prefill follows link
                                metadata.
                            </p>
                        </TechnicalDetailDisclosure>
                    </div>
                </div>
            }
        </FormsWorkspaceShell>
    );
}
