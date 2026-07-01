"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TechnicalDetailDisclosure } from "@/components/forms/review";
import { FormsWorkspaceShell } from "@/components/forms/workspace";
import { IntakeCommandCenterKpiStrip } from "@/components/forms/workspace/IntakeCommandCenterKpiStrip";
import { IntakeWorkspaceFilterPanelView } from "@/components/forms/workspace/IntakeWorkspaceFilterPanelView";
import type { IntakeCommandCenterSessionRow } from "@/lib/forms/intakeCommandCenterPresentation";
import { deriveIntakeCommandCenterSnapshot } from "@/lib/forms/intakeCommandCenterPresentation";
import {
    buildIntakeWorkspaceFilterPanel,
    countIntakeWorkspaceFilters,
    defaultIntakeWorkspaceFilter,
    INTAKE_FILTER_TO_KPI_ID,
    INTAKE_KPI_ID_TO_FILTER,
    type IntakeWorkspaceFilterKey,
} from "@/lib/forms/intakeWorkspaceFilters";
import {
    buildIntakeWorkloadBrowserDebug,
} from "@/lib/forms/intakeWorkloadBrowserDebug";
import { FORMS_SUBMISSIONS_API_PATH } from "@/lib/forms/intakeRuntimeTestFixtures";
import {
    buildIntakeWorkloadDiagnostics,
    intakeWorkloadLaneCounts,
} from "@/lib/forms/intakeWorkloadDiagnostics";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";
import {
    opCaseFileCanvas,
    opMetadata,
    opMutedMeta,
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
    activeOrgId?: string | null;
    apiFetchMeta?: { apiOrgId: string | null; apiUrl: string } | null;
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
    apiFetchMeta = null,
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
    const [userFilter, setUserFilter] = useState<IntakeWorkspaceFilterKey | null>(null);

    /** Derived — never stale after async load unless operator pinned a pill. */
    const effectiveFilter = userFilter ?? recommendedFilter;

    useEffect(() => {
        setUserFilter(null);
    }, [activeOrgId]);

    const handleSelectFilter = (filter: IntakeWorkspaceFilterKey) => {
        setUserFilter(filter);
    };

    const handleSelectKpi = (kpiId: string) => {
        const filter = INTAKE_KPI_ID_TO_FILTER[kpiId];
        if (filter) handleSelectFilter(filter);
    };

    const selectedKpiId = INTAKE_FILTER_TO_KPI_ID[effectiveFilter] ?? null;

    const laneCounts = useMemo(() => intakeWorkloadLaneCounts(submissions), [submissions]);
    const diagnostics = useMemo(() => buildIntakeWorkloadDiagnostics(submissions), [submissions]);

    const panel = useMemo(
        () =>
            buildIntakeWorkspaceFilterPanel(effectiveFilter, {
                submissions,
                sessions,
                forms: forms.map((f) => ({ id: f.id, name: f.name, has_published_version: f.has_published_version })),
                packets: packets.map((p) => ({ id: p.id, name: p.name })),
                formsById,
            }),
        [effectiveFilter, submissions, sessions, forms, packets, formsById]
    );

    const browserDebug = useMemo(
        () =>
            buildIntakeWorkloadBrowserDebug({
                sessionOrgId: activeOrgId,
                apiOrgId: apiFetchMeta?.apiOrgId ?? null,
                apiUrl: apiFetchMeta?.apiUrl ?? FORMS_SUBMISSIONS_API_PATH,
                submissions,
                activeFilter: effectiveFilter,
                formsById,
            }),
        [activeOrgId, apiFetchMeta, submissions, effectiveFilter, formsById]
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
                    <IntakeCommandCenterKpiStrip
                        kpis={commandCenter.kpis}
                        selectedKpiId={selectedKpiId}
                        onSelectKpi={handleSelectKpi}
                    />

                    <div className={clsx(opCaseFileCanvas, "space-y-3")} data-testid="intake-workspace-canvas">
                        <div
                            className="rounded-xl bg-white/95 px-4 py-3 shadow-[0_1px_3px_rgba(49,57,77,0.05)] ring-1 ring-alloy-midnight/[0.07]"
                            data-testid={`intake-active-filter-${effectiveFilter}`}
                        >
                            <IntakeWorkspaceFilterPanelView panel={panel} viewerTz={viewerTz} onRefresh={onRefresh} />
                        </div>
                    </div>

                    <TechnicalDetailDisclosure title="Operator notes" helperText="Collapsed by default.">
                        <p className={opMetadata}>
                            Publish before distributing. Native admin authoring and review — iframe embed is for external
                            intake only.
                        </p>

                        <div
                            className={clsx("mt-3 space-y-1 font-mono text-[10px]", opMetadata)}
                            data-testid="intake-workload-browser-debug"
                        >
                            <p className="font-semibold text-alloy-midnight/80">Diagnostic — org / session mismatch</p>
                            <p className={opMutedMeta}>For engineering validation only. Collapsed by default.</p>
                            <p>session org: {browserDebug.sessionOrgId ?? "—"}</p>
                            <p>API org (response header): {browserDebug.apiOrgId ?? "—"}</p>
                            <p>API URL: {browserDebug.apiUrl}</p>
                            <p>total loaded: {browserDebug.totalLoaded}</p>
                            <p>active filter: {browserDebug.activeFilter}</p>
                            <p>Test 1C in loaded rows: {String(browserDebug.hasTest1C)}</p>
                            <p>Test 1D in loaded rows: {String(browserDebug.hasTest1D)}</p>
                            {browserDebug.orgMismatchHint ?
                                <p className="text-alloy-ember">{browserDebug.orgMismatchHint}</p>
                            :   null}
                            {browserDebug.loadedPreview.length > 0 ?
                                <ul className="mt-1 space-y-0.5">
                                    {browserDebug.loadedPreview.map((r) => (
                                        <li key={r.id}>
                                            {r.id} · {r.submitted_at ?? "no submitted_at"}
                                        </li>
                                    ))}
                                </ul>
                            :   null}
                            <p className="mt-2">Review row IDs: {browserDebug.reviewRowIds.join(", ") || "—"}</p>
                            <p>Recent row IDs: {browserDebug.recentRowIds.join(", ") || "—"}</p>
                            <p className="mt-2">
                                lanes: review={laneCounts.needsReview} recent={laneCounts.recentlySubmitted} linking=
                                {laneCounts.needsLinking}
                            </p>
                        </div>

                        {diagnostics.length > 0 ?
                            <ul className={clsx("mt-2 space-y-1 font-mono text-[10px]", opMetadata)} data-testid="intake-workload-diagnostics">
                                {diagnostics.map((d) => (
                                    <li key={d.id}>
                                        {d.id.slice(0, 8)}… · {d.lane} · needs_review={String(d.intake_needs_review)} · {d.headline}
                                    </li>
                                ))}
                            </ul>
                        :   null}
                    </TechnicalDetailDisclosure>
                </div>
            }
        </FormsWorkspaceShell>
    );
}
