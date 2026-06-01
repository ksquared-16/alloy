"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EnrollmentProcessStageCard from "@/components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageCard";
import EnrollmentProcessStageStatusesCard from "@/components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard";
import LifecycleStageRequirementsEditor from "@/components/adminV2/settings/LifecycleStageRequirementsEditor";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import { ADMIN_V2_SETTINGS_ENROLLMENT_PROCESS_PATH } from "@/lib/adminV2/settings/enrollmentProcessSettingsPaths";
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import EnrollmentProcessActionsCard from "@/components/adminV2/settings/enrollmentProcess/EnrollmentProcessActionsCard";
import EnrollmentProcessFormsCoverageCard from "@/components/adminV2/settings/enrollmentProcess/EnrollmentProcessFormsCoverageCard";
import { lifecycleStageWorkspaceAppearance } from "@/lib/completion/lifecycleStageWorkspaceMapping";
import {
    LIFECYCLE_STAGE_LABELS,
    LIFECYCLE_STAGE_ORDER,
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    queueStatusKeysForOperatorStage,
    snapshotEnrollmentPipelineWorkUnit,
    stageQueueMappingForPipeline,
    type EnrollmentPipelineWorkUnitSnapshot,
} from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type DeptListRow = { id: string; name: string | null; key: string | null };

type WorkUnitApiRow = {
    id: string;
    key: string;
    name: string;
    is_active: boolean;
    queue_definition: unknown;
};

const STAGE_TABS = LIFECYCLE_STAGE_ORDER.map((key) => ({
    key,
    label: LIFECYCLE_STAGE_LABELS[key],
}));

export default function EnrollmentProcessHubClient() {
    const [departments, setDepartments] = useState<DeptListRow[]>([]);
    const [departmentId, setDepartmentId] = useState("");
    const [activeStage, setActiveStage] = useState<LifecycleOperatorStage>("lead");
    const [loadingList, setLoadingList] = useState(true);
    const [loadingPipeline, setLoadingPipeline] = useState(false);
    const [pipeline, setPipeline] = useState<EnrollmentPipelineWorkUnitSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reqDirty, setReqDirty] = useState(false);
    const [statusStages, setStatusStages] = useState<EnrollmentStatusStagesPayload | null>(null);

    const stageAppearance = useMemo(() => lifecycleStageWorkspaceAppearance(activeStage), [activeStage]);
    const queueMapping = useMemo(() => stageQueueMappingForPipeline(activeStage, pipeline), [activeStage, pipeline]);
    const stageStatusRows = useMemo(
        () => statusStages?.stages[activeStage]?.statuses ?? [],
        [statusStages, activeStage]
    );
    const queueFilterStatusKeys = useMemo(
        () => queueStatusKeysForOperatorStage(activeStage, pipeline),
        [activeStage, pipeline]
    );
    const workQueueStatusLabels = useMemo(() => {
        const inQueue = new Set(queueFilterStatusKeys);
        return stageStatusRows
            .filter((s) => inQueue.has(s.status_key))
            .map((s) => s.status_label);
    }, [stageStatusRows, queueFilterStatusKeys]);
    const stageStatusNotInQueue = useMemo(() => {
        const inQueue = new Set(queueFilterStatusKeys);
        return stageStatusRows.filter((s) => !inQueue.has(s.status_key)).map((s) => s.status_label);
    }, [stageStatusRows, queueFilterStatusKeys]);
    const stageLabel = LIFECYCLE_STAGE_LABELS[activeStage];

    const loadPipeline = useCallback(async (deptId: string) => {
        setLoadingPipeline(true);
        try {
            const res = await fetch(
                `/api/admin/work-units?department_id=${encodeURIComponent(deptId)}`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as { items?: WorkUnitApiRow[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? "Failed to load work units");
            const row = (j.items ?? []).find((w) => w.key === ENROLLMENT_PIPELINE_WORK_UNIT_KEY);
            setPipeline(row ? snapshotEnrollmentPipelineWorkUnit(row) : null);
        } catch (e) {
            setPipeline(null);
            setError(e instanceof Error ? e.message : "Failed to load pipeline");
        } finally {
            setLoadingPipeline(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingList(true);
            try {
                const res = await fetch("/api/admin/departments", workspaceDataFetchInit());
                const j = (await res.json().catch(() => ({}))) as { items?: DeptListRow[]; error?: string };
                if (!res.ok) throw new Error(j.error ?? "Failed to load departments");
                const items = j.items ?? [];
                if (!cancelled) {
                    setDepartments(items);
                    if (items.length && !departmentId) setDepartmentId(items[0]!.id);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load departments");
            } finally {
                if (!cancelled) setLoadingList(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!departmentId) return;
        void loadPipeline(departmentId);
    }, [departmentId, loadPipeline]);

    return (
        <div className="space-y-4" data-testid="enrollment-process-hub">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-alloy-forge/12 bg-white/70 px-4 py-3">
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-alloy-midnight/70">
                    Department
                    <select
                        className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-sm text-alloy-midnight"
                        value={departmentId}
                        disabled={loadingList || !departments.length}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        data-testid="enrollment-process-department-select"
                    >
                        {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name ?? d.key ?? d.id}
                            </option>
                        ))}
                    </select>
                </label>
                {reqDirty ? (
                    <span
                        className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-medium text-amber-900"
                        data-testid="enrollment-process-unsaved"
                    >
                        Unsaved changes
                    </span>
                ) : null}
            </div>

            {error ? (
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            <SettingsEntityTabBar
                tabs={STAGE_TABS}
                activeKey={activeStage}
                onSelect={setActiveStage}
                aria-label="Enrollment process stage"
            />

            <div
                className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3"
                data-testid={`enrollment-process-stage-${activeStage}`}
                role="tabpanel"
            >
                <EnrollmentProcessStageCard
                    title="Required Information"
                    description="What must exist before families move forward"
                    testId="enrollment-process-card-required"
                >
                    {departmentId ? (
                        <LifecycleStageRequirementsEditor
                            departmentId={departmentId}
                            activeStage={activeStage}
                            onDirtyChange={setReqDirty}
                        />
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Select a department.</p>
                    )}
                </EnrollmentProcessStageCard>

                <EnrollmentProcessStageCard
                    title="Statuses"
                    description="Inquiry statuses included in this stage"
                    testId="enrollment-process-card-statuses"
                    manageHref="/adminV2/settings/statuses?entity_type=opportunities"
                    manageLabel="All statuses"
                >
                    <EnrollmentProcessStageStatusesCard
                        activeStage={activeStage}
                        onStagesLoaded={setStatusStages}
                    />
                </EnrollmentProcessStageCard>

                <EnrollmentProcessStageCard
                    title="Work Queue"
                    description="Pipeline lane for this stage"
                    testId="enrollment-process-card-work-unit"
                    manageHref="/adminV2/settings/work-units"
                    manageLabel="Manage Work Queue"
                >
                    {loadingPipeline ? (
                        <p className="text-xs text-alloy-midnight/50">Loading…</p>
                    ) : (
                        <>
                            <p className="text-xs text-alloy-midnight/55">
                                <span className="font-medium text-alloy-midnight">{queueMapping.workUnitName}</span>
                                {queueMapping.pipelineExists ? (
                                    <>
                                        {" "}
                                        · {queueMapping.pipelineActive ? "Active" : "Inactive"}
                                    </>
                                ) : (
                                    <> · Not found for this department</>
                                )}
                            </p>
                            <ul className="mt-2 space-y-1 text-xs" data-testid="enrollment-process-queue-lanes">
                                {queueMapping.lanes.map((lane) => (
                                    <li key={lane.queueKey}>
                                        <span className="font-medium">{lane.label}</span>
                                        {lane.description ? (
                                            <span className="text-alloy-midnight/50"> — {lane.description}</span>
                                        ) : null}
                                        {!lane.foundInDefinition ? (
                                            <span className="ml-1 text-amber-800/80">(expected lane)</span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-3" data-testid="enrollment-process-queue-statuses">
                                <p className="text-[11px] font-medium text-alloy-midnight/50">Statuses feeding this queue</p>
                                {workQueueStatusLabels.length ? (
                                    <p className="mt-1 text-xs text-alloy-midnight/75">{workQueueStatusLabels.join(" · ")}</p>
                                ) : (
                                    <p className="mt-1 text-xs text-alloy-midnight/50">None matched to lane filters yet.</p>
                                )}
                                {stageStatusNotInQueue.map((statusName) => (
                                    <p key={statusName} className="mt-1 text-[11px] text-amber-900/80">
                                        {statusName} is in {stageLabel} but not included in the {stageLabel} queue.
                                    </p>
                                ))}
                            </div>
                            <button
                                type="button"
                                disabled
                                title="Lane creation requires a confirmed queue definition update — coming soon."
                                className="mt-3 rounded-md border border-alloy-forge/20 bg-alloy-stone/10 px-2 py-1 text-[11px] font-medium text-alloy-midnight/40"
                                data-testid="enrollment-process-create-work-unit"
                            >
                                Create work queue for this stage
                            </button>
                        </>
                    )}
                </EnrollmentProcessStageCard>

                <EnrollmentProcessStageCard
                    title="Actions"
                    description="Buttons available during this stage"
                    testId="enrollment-process-card-actions"
                    manageHref="/adminV2/settings/actions?entity_type=opportunity"
                    manageLabel="Action Buttons"
                >
                    <EnrollmentProcessActionsCard activeStage={activeStage} />
                </EnrollmentProcessStageCard>

                <EnrollmentProcessStageCard
                    title="Needs Attention"
                    description="Signals when work is overdue or blocked"
                    testId="enrollment-process-card-attention"
                    manageHref="/adminV2/settings/attention-sla-rules"
                    manageLabel="Attention & SLA"
                >
                    {stageAppearance.needsAttentionSignals.length ? (
                        <ul className="list-inside list-disc text-xs text-alloy-midnight/70">
                            {stageAppearance.needsAttentionSignals.map((s) => (
                                <li key={s}>{s}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">No stage-specific signals.</p>
                    )}
                </EnrollmentProcessStageCard>

                <EnrollmentProcessStageCard
                    title="Forms & Packets"
                    description="Capture tools that satisfy requirements"
                    testId="enrollment-process-card-forms"
                    manageHref="/adminV2/forms"
                    manageLabel="Forms"
                >
                    {departmentId ? (
                        <EnrollmentProcessFormsCoverageCard
                            departmentId={departmentId}
                            activeStage={activeStage}
                        />
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Select a department.</p>
                    )}
                </EnrollmentProcessStageCard>
            </div>

            <footer
                className="rounded-xl border border-dashed border-alloy-forge/18 bg-alloy-stone/[0.03] px-4 py-3 text-xs text-alloy-midnight/55"
                data-testid="enrollment-process-bos-future-hook"
            >
                <span className="font-medium text-alloy-midnight/70">Future:</span> Ask BOS to suggest forms, actions,
                and queue setup for this stage. BOS would review requirements, propose changes, and you would apply
                after review — through existing Forms, Action Buttons, and Work Units settings.
            </footer>

            <button
                type="button"
                disabled
                className="w-full rounded-md border border-dashed border-alloy-forge/18 bg-alloy-stone/[0.03] px-3 py-2 text-xs text-alloy-midnight/45"
                data-testid="enrollment-process-bos-suggest-stage-setup"
            >
                Ask BOS to suggest forms, actions, and queue setup for this stage
            </button>

            <p className="text-[11px] text-alloy-midnight/45">
                Legacy detailed editor:{" "}
                <Link href={ADMIN_V2_SETTINGS_LIFECYCLE_PATH} className="font-medium text-alloy-pine hover:underline">
                    Lifecycle
                </Link>
                . Overview:{" "}
                <Link href={ADMIN_V2_SETTINGS_ENROLLMENT_PROCESS_PATH} className="font-medium text-alloy-pine hover:underline">
                    Enrollment Process
                </Link>
                .
            </p>
        </div>
    );
}
