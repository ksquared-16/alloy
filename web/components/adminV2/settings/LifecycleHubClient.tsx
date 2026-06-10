"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EnrollmentProcessStageStatusesCard from "@/components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard";
import LifecycleStageFieldRequirementsEditor from "@/components/adminV2/settings/LifecycleStageFieldRequirementsEditor";
import EnrollmentProcessActionsCard from "@/components/adminV2/settings/enrollmentProcess/EnrollmentProcessActionsCard";
import EnrollmentProcessFormsCoverageCard from "@/components/adminV2/settings/enrollmentProcess/EnrollmentProcessFormsCoverageCard";
import LifecycleStageWorkUnitCard from "@/components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard";
import LifecycleNeedsAttentionCard from "@/components/adminV2/settings/lifecycle/LifecycleNeedsAttentionCard";
import LifecycleCreateForm from "@/components/adminV2/settings/lifecycle/LifecycleCreateForm";
import LifecycleLanding from "@/components/adminV2/settings/lifecycle/LifecycleLanding";
import LifecycleAddStageForm from "@/components/adminV2/settings/lifecycle/LifecycleAddStageForm";
import LifecycleWorkbenchHeader from "@/components/adminV2/settings/lifecycle/LifecycleWorkbenchHeader";
import LifecycleStageSetupWizard, {
    type LifecycleSetupStep,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageSetupWizard";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    asOperatorStageKey,
    type LifecycleBuilderProcessRecord,
    type LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    snapshotEnrollmentPipelineWorkUnit,
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

type HubMode = "loading" | "empty" | "landing" | "create" | "workbench";

export default function LifecycleHubClient() {
    const [departmentId, setDepartmentId] = useState("");
    const [processes, setProcesses] = useState<LifecycleBuilderProcessRecord[]>([]);
    const [activeProcess, setActiveProcess] = useState<LifecycleBuilderProcessRecord | null>(null);
    const [stages, setStages] = useState<LifecycleBuilderStageRecord[]>([]);
    const [activeStageKey, setActiveStageKey] = useState("");
    const [hubMode, setHubMode] = useState<HubMode>("loading");
    const [loadingBuilder, setLoadingBuilder] = useState(false);
    const [loadingPipeline, setLoadingPipeline] = useState(false);
    const [pipeline, setPipeline] = useState<EnrollmentPipelineWorkUnitSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reqDirty, setReqDirty] = useState(false);
    const [statusStages, setStatusStages] = useState<EnrollmentStatusStagesPayload | null>(null);
    const [userSelectedProcess, setUserSelectedProcess] = useState(false);

    const activeStage = stages.find((s) => s.key === activeStageKey);
    const stageLabel = activeStage?.label ?? activeStageKey;
    const operatorStage = asOperatorStageKey(activeStageKey);
    const stageStatusRows = useMemo(
        () => statusStages?.stages[activeStageKey]?.statuses ?? [],
        [statusStages, activeStageKey]
    );

    const loadBuilder = useCallback(async (deptId: string, preserveMode = false) => {
        setLoadingBuilder(true);
        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(deptId)}/lifecycle-builder`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                active_process?: LifecycleBuilderProcessRecord | null;
                stages?: LifecycleBuilderStageRecord[];
                config?: { processes: LifecycleBuilderProcessRecord[] };
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to load lifecycle config");

            const nextProcesses = j.config?.processes ?? [];
            setProcesses(nextProcesses);

            if (!preserveMode) {
                if (!nextProcesses.length) {
                    setHubMode("empty");
                    setActiveProcess(null);
                    setStages([]);
                    setActiveStageKey("");
                } else if (!userSelectedProcess) {
                    setHubMode("landing");
                    setActiveProcess(null);
                    setStages([]);
                    setActiveStageKey("");
                } else {
                    setActiveProcess(j.active_process ?? null);
                    const nextStages = j.stages ?? [];
                    setStages(nextStages);
                    setActiveStageKey((prev) => {
                        if (prev && nextStages.some((s) => s.key === prev)) return prev;
                        return nextStages[0]?.key ?? "";
                    });
                    setHubMode("workbench");
                }
            } else {
                setActiveProcess(j.active_process ?? null);
                const nextStages = j.stages ?? [];
                setStages(nextStages);
                setActiveStageKey((prev) => {
                    if (prev && nextStages.some((s) => s.key === prev)) return prev;
                    return nextStages[0]?.key ?? "";
                });
                setHubMode(j.active_process ? "workbench" : nextProcesses.length ? "landing" : "empty");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load lifecycle config");
        } finally {
            setLoadingBuilder(false);
        }
    }, [userSelectedProcess]);

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
        } catch {
            setPipeline(null);
        } finally {
            setLoadingPipeline(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/departments", workspaceDataFetchInit());
                const j = (await res.json().catch(() => ({}))) as { items?: DeptListRow[]; error?: string };
                if (!res.ok) throw new Error(j.error ?? "Failed to load departments");
                const items = j.items ?? [];
                if (!cancelled && items.length) {
                    setDepartmentId(items[0]!.id);
                } else if (!cancelled) {
                    setHubMode("empty");
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load departments");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!departmentId) return;
        void loadBuilder(departmentId);
        void loadPipeline(departmentId);
    }, [departmentId, loadBuilder, loadPipeline]);

    const patchBuilder = useCallback(
        async (body: Record<string, unknown>) => {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`,
                {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }
            );
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
        },
        [departmentId]
    );

    const openProcess = useCallback(
        async (processId: string) => {
            setUserSelectedProcess(true);
            await patchBuilder({ action: "set_active_process", process_id: processId });
            await loadBuilder(departmentId, true);
            setHubMode("workbench");
        },
        [departmentId, loadBuilder, patchBuilder]
    );

    const backToLanding = useCallback(async () => {
        setUserSelectedProcess(false);
        await patchBuilder({ action: "clear_active_process" });
        setActiveProcess(null);
        setStages([]);
        setActiveStageKey("");
        setHubMode(processes.length ? "landing" : "empty");
    }, [patchBuilder, processes.length]);

    const onLifecycleCreated = useCallback(async () => {
        setUserSelectedProcess(true);
        await loadBuilder(departmentId, true);
        setHubMode("workbench");
    }, [departmentId, loadBuilder]);

    const onStageCreated = useCallback(
        async (stageKey: string) => {
            await loadBuilder(departmentId, true);
            if (stageKey) setActiveStageKey(stageKey);
        },
        [departmentId, loadBuilder]
    );

    const setupSteps: LifecycleSetupStep[] = useMemo(() => {
        const statusCount = stageStatusRows.length;

        return [
            {
                id: "required",
                title: "Required Fields",
                summary: "Set required and recommended fields",
                content:
                    departmentId && activeStageKey ? (
                        <LifecycleStageFieldRequirementsEditor
                            departmentId={departmentId}
                            activeStageKey={activeStageKey}
                            onDirtyChange={setReqDirty}
                            compact
                        />
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Select a stage to configure required information.</p>
                    ),
            },
            {
                id: "statuses",
                title: "Statuses",
                summary: statusCount ? `${statusCount} status${statusCount === 1 ? "" : "es"} assigned` : "None assigned",
                manageHref: "/admin/settings/statuses?entity_type=opportunities",
                manageLabel: "All statuses",
                content: departmentId ? (
                    <EnrollmentProcessStageStatusesCard
                        departmentId={departmentId}
                        activeStageKey={activeStageKey}
                        onStagesLoaded={setStatusStages}
                    />
                ) : null,
            },
            {
                id: "queue",
                title: "Queue view",
                summary: pipeline ? pipeline.name : "Not published yet",
                content: departmentId ? (
                    <LifecycleStageWorkUnitCard
                        departmentId={departmentId}
                        activeStageKey={activeStageKey}
                        stageLabel={stageLabel}
                        stageStatusLabels={stageStatusRows.map((r) => r.status_label)}
                        pipeline={pipeline}
                        loadingPipeline={loadingPipeline}
                        onPipelineUpdated={() => void loadPipeline(departmentId)}
                    />
                ) : null,
            },
            {
                id: "actions",
                title: "Actions",
                summary: "Add buttons for operators",
                content: <EnrollmentProcessActionsCard activeStageKey={activeStageKey} editable />,
            },
            {
                id: "forms",
                title: "Forms",
                summary: "Forms and packets for this stage",
                manageHref: "/admin/forms",
                manageLabel: "Forms",
                content:
                    departmentId && operatorStage ? (
                        <EnrollmentProcessFormsCoverageCard
                            departmentId={departmentId}
                            activeStage={operatorStage}
                            linkFormsEnabled
                        />
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Link forms on platform-integrated stages.</p>
                    ),
            },
            {
                id: "attention",
                title: "Attention",
                summary: "Follow-up and overdue signals",
                manageHref: "/admin/settings/attention-sla-rules",
                manageLabel: "Attention & SLA",
                content: <LifecycleNeedsAttentionCard stageKey={activeStageKey} />,
            },
        ];
    }, [
        activeStageKey,
        departmentId,
        loadPipeline,
        loadingPipeline,
        operatorStage,
        pipeline,
        stageLabel,
        stageStatusRows,
    ]);

    if (hubMode === "loading" || loadingBuilder) {
        return (
            <div data-testid="lifecycle-hub">
                <p className="text-xs text-alloy-midnight/50">Loading…</p>
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="lifecycle-hub">
            {reqDirty ? (
                <span
                    className="inline-block rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-medium text-amber-900"
                    data-testid="lifecycle-unsaved"
                >
                    Unsaved field changes
                </span>
            ) : null}

            {error ? (
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            {!departmentId ? (
                <p className="text-sm text-alloy-midnight/60" data-testid="lifecycle-empty-state">
                    No workspace available. Create a department first.
                </p>
            ) : hubMode === "empty" ? (
                <LifecycleCreateForm departmentId={departmentId} onCreated={onLifecycleCreated} />
            ) : hubMode === "landing" ? (
                <LifecycleLanding
                    savedLifecycles={processes}
                    onStartNew={() => setHubMode("create")}
                    onOpenExisting={(id) => void openProcess(id)}
                />
            ) : hubMode === "create" ? (
                <LifecycleCreateForm
                    departmentId={departmentId}
                    onCreated={onLifecycleCreated}
                    onCancel={() => setHubMode(processes.length ? "landing" : "empty")}
                    showCancel={processes.length > 0}
                />
            ) : activeProcess ? (
                <>
                    <LifecycleWorkbenchHeader
                        activeProcess={activeProcess}
                        stages={stages}
                        activeStageKey={activeStageKey}
                        showLifecyclePicker={processes.length > 1}
                        savedLifecycles={processes}
                        onStageSelect={setActiveStageKey}
                        onSwitchLifecycle={(id) => void openProcess(id)}
                        onStartNew={() => setHubMode("create")}
                        onBackToLanding={() => void backToLanding()}
                    />

                    {stages.length === 0 ? (
                        <LifecycleAddStageForm
                            departmentId={departmentId}
                            processId={activeProcess.id}
                            isFirstStage
                            onCreated={onStageCreated}
                        />
                    ) : activeStageKey ? (
                        <>
                            {activeStage?.description ? (
                                <p className="text-xs text-alloy-midnight/55">{activeStage.description}</p>
                            ) : null}
                            <LifecycleStageSetupWizard stageLabel={stageLabel} steps={setupSteps} />
                            <LifecycleAddStageForm
                                departmentId={departmentId}
                                processId={activeProcess.id}
                                isFirstStage={false}
                                onCreated={onStageCreated}
                            />
                        </>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
