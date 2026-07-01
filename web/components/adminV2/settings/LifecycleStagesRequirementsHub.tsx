"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import LifecycleRelatedSettingsLinks from "@/components/adminV2/settings/LifecycleRelatedSettingsLinks";
import LifecycleStageFieldRequirementsEditor from "@/components/adminV2/settings/LifecycleStageFieldRequirementsEditor";
import LifecycleStageWhereAppears from "@/components/adminV2/settings/LifecycleStageWhereAppears";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import {
    LIFECYCLE_STAGE_LABELS,
    LIFECYCLE_STAGE_ORDER,
    type LifecycleOperatorStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type DeptListRow = { id: string; name: string | null; key: string | null };

const STAGE_TABS = LIFECYCLE_STAGE_ORDER.map((key) => ({
    key,
    label: LIFECYCLE_STAGE_LABELS[key],
}));

export default function LifecycleStagesRequirementsHub() {
    const [departments, setDepartments] = useState<DeptListRow[]>([]);
    const [departmentId, setDepartmentId] = useState("");
    const [activeStage, setActiveStage] = useState<LifecycleOperatorStage>("lead");
    const [loadingList, setLoadingList] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);

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

    const onFeedback = useCallback((msg: string | null) => setFeedback(msg), []);
    const onError = useCallback((msg: string | null) => setError(msg), []);

    return (
        <div className="space-y-4" data-testid="lifecycle-stages-requirements-hub">
            <p className="text-xs text-alloy-midnight/55">
                Prefer the stage-first hub?{" "}
                <Link href={ADMIN_V2_SETTINGS_LIFECYCLE_PATH} className="font-medium text-alloy-pine hover:underline">
                    Lifecycle
                </Link>
            </p>

            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-alloy-forge/12 bg-white/70 px-4 py-3">
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-alloy-midnight/70">
                    Department
                    <select
                        className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-sm text-alloy-midnight"
                        value={departmentId}
                        disabled={loadingList || !departments.length}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        data-testid="lifecycle-settings-department-select"
                    >
                        {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name ?? d.key ?? d.id}
                            </option>
                        ))}
                    </select>
                </label>
                {dirty ? (
                    <span
                        className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-medium text-amber-900"
                        data-testid="lifecycle-settings-unsaved"
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
            {feedback ? (
                <p className="text-sm text-alloy-pine" data-testid="lifecycle-settings-feedback">
                    {feedback}
                </p>
            ) : null}

            <SettingsEntityTabBar
                tabs={STAGE_TABS}
                activeKey={activeStage}
                onSelect={setActiveStage}
                aria-label="Enrollment lifecycle stage"
            />

            <section
                className="rounded-xl border border-alloy-forge/15 bg-white/85 p-4 shadow-sm"
                data-testid={`lifecycle-progression-stage-${activeStage}`}
                role="tabpanel"
            >
                <h2 className="text-base font-semibold text-alloy-midnight">{LIFECYCLE_STAGE_LABELS[activeStage]}</h2>

                {departmentId ? (
                    <div className="mt-4">
                        <LifecycleStageFieldRequirementsEditor
                            departmentId={departmentId}
                            activeStageKey={activeStage}
                            onDirtyChange={setDirty}
                            onFeedback={onFeedback}
                            onError={onError}
                        />
                    </div>
                ) : null}

                <LifecycleStageWhereAppears stage={activeStage} />

                <p className="mt-4 text-[11px] text-alloy-midnight/45">
                    Button visibility:{" "}
                    <Link
                        href="/admin/settings/actions?entity_type=opportunity"
                        className="font-medium text-alloy-pine hover:underline"
                    >
                        Action Buttons
                    </Link>
                    . Queues:{" "}
                    <Link href="/admin/settings/work-units" className="font-medium text-alloy-pine hover:underline">
                        Work Units &amp; Queues
                    </Link>
                    .
                </p>
            </section>

            <LifecycleRelatedSettingsLinks />
        </div>
    );
}
