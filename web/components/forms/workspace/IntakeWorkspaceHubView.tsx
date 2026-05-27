"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TechnicalDetailDisclosure } from "@/components/forms/review";
import { FormsWorkspaceShell } from "@/components/forms/workspace";
import { IntakeCommandCenterKpiStrip } from "@/components/forms/workspace/IntakeCommandCenterKpiStrip";
import { IntakeWorkspaceFilterPanelView } from "@/components/forms/workspace/IntakeWorkspaceFilterPanelView";
import { IntakeWorkloadFilterStrip } from "@/components/forms/workspace/IntakeWorkloadFilterStrip";
import type { IntakeCommandCenterSessionRow } from "@/lib/forms/intakeCommandCenterPresentation";
import { deriveIntakeCommandCenterSnapshot } from "@/lib/forms/intakeCommandCenterPresentation";
import {
    buildIntakeWorkspaceFilterPanel,
    countIntakeWorkspaceFilters,
    defaultIntakeWorkspaceFilter,
    type IntakeWorkspaceFilterKey,
} from "@/lib/forms/intakeWorkspaceFilters";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";
import {
    opCaseFileCanvas,
    opMetadata,
    opOrientationSurface,
} from "@/lib/operational/ui/operationalVisualTokens";

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
    "rounded-lg border border-alloy-blue/20 bg-alloy-blue px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40";
export const intakeWorkspaceBtnSecondary =
    "rounded-lg border border-alloy-midnight/10 bg-white px-3.5 py-2 text-xs font-medium text-alloy-midnight/85 shadow-sm hover:bg-alloy-stone/20 hover:text-alloy-midnight disabled:opacity-40";

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
    onRefresh?: () => void;
    /** Resolved CRM org — surfaced in operator notes for visibility debugging. */
    activeOrgId?: string | null;
};

export function IntakeWorkspaceHubView({
    viewerTz,
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
    onRefresh,
    activeOrgId = null,
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

    const commandCenter = useMemo(
        () =>
            deriveIntakeCommandCenterSnapshot({
                submissions,
                sessions,
                forms,
                formsById,
            }),
        [submissions, sessions, forms, formsById]
    );

    const recommendedFilter = useMemo(() => defaultIntakeWorkspaceFilter(filterCounts), [filterCounts]);

    const [activeFilter, setActiveFilter] = useState<IntakeWorkspaceFilterKey>(recommendedFilter);
    const [filterPinnedByUser, setFilterPinnedByUser] = useState(false);

    /** Workload data loads after mount — follow highest-priority filter once counts arrive. */
    useEffect(() => {
        if (loading || filterPinnedByUser) return;
        setActiveFilter(recommendedFilter);
    }, [loading, recommendedFilter, filterPinnedByUser]);

    const handleSelectFilter = (filter: IntakeWorkspaceFilterKey) => {
        setFilterPinnedByUser(true);
        setActiveFilter(filter);
    };

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

    return (
        <FormsWorkspaceShell
            title="Intake workspace"
            subtitle="Command center for review, linkage, and intake distribution."
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
                    <div className={opOrientationSurface} data-testid="intake-command-orientation">
                        <p className="text-sm font-semibold text-alloy-midnight">{commandCenter.urgencyHeadline}</p>
                        <p className={clsx("mt-1", opMetadata)}>{commandCenter.healthyLine}</p>
                        {commandCenter.primaryCta ?
                            <div className="mt-3">
                                <Link href={commandCenter.primaryCta.href} className={intakeWorkspaceBtnPrimary}>
                                    {commandCenter.primaryCta.label}
                                </Link>
                            </div>
                        :   null}
                    </div>

                    <IntakeCommandCenterKpiStrip kpis={commandCenter.kpis} />

                    <div className={clsx(opCaseFileCanvas, "space-y-3")} data-testid="intake-workspace-canvas">
                        <IntakeWorkloadFilterStrip
                            counts={filterCounts}
                            selected={activeFilter}
                            onSelect={handleSelectFilter}
                        />
                        <div className="rounded-xl bg-white/95 px-4 py-3 shadow-[0_1px_3px_rgba(49,57,77,0.05)] ring-1 ring-alloy-midnight/[0.07]">
                            <IntakeWorkspaceFilterPanelView panel={panel} viewerTz={viewerTz} onRefresh={onRefresh} />
                        </div>
                    </div>

                    <TechnicalDetailDisclosure title="Operator notes" helperText="Collapsed by default.">
                        <p className={opMetadata}>
                            Publish before distributing. Native admin authoring and review — iframe embed is for external
                            intake only.
                        </p>
                        {!loading && activeOrgId ?
                            <p className={clsx("mt-2 font-mono text-[11px]", opMetadata)} data-testid="intake-workspace-org">
                                Active org: {activeOrgId}
                                {submissions.length === 0 ?
                                    " · No submissions returned for this org — confirm you are logged into Alloy Bend (7803388d…) if testing Runtime Test 1 fixtures."
                                :   ` · ${submissions.length} submission row(s) loaded.`}
                            </p>
                        :   null}
                    </TechnicalDetailDisclosure>
                </div>
            }
        </FormsWorkspaceShell>
    );
}
