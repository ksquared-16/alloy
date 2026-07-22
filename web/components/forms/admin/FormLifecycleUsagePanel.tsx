"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { LIFECYCLE_STAGE_LABELS, LIFECYCLE_STAGE_ORDER, type LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { FormLifecycleCoveragePresentation } from "@/lib/forms/lifecycle/buildFormLifecycleCoveragePresentation";
import {
    defaultLifecycleUsageIntent,
    readFormLifecycleUsage,
    type FormsLifecycleUsageV1,
} from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import {
    OPERATIONAL_INTENT_CATALOG,
    readStoredOperationalIntent,
    type OperationalIntentKey,
} from "@/lib/forms/operationalIntentTemplates";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";
import { BosExecutionLoader } from "@/components/admin/actions/BosExecutionLoader";

type DepartmentOption = {
    id: string;
    name: string;
};

type CoveragePayload = {
    configured: boolean;
    lifecycle_usage: FormsLifecycleUsageV1 | null;
    department_name: string | null;
    presentation: FormLifecycleCoveragePresentation;
};

type Props = {
    formId: string;
    formMetadata: Record<string, unknown> | null | undefined;
    canMutate?: boolean;
    hasSchema?: boolean;
    coverageRefreshKey?: string;
    onFormMetadataUpdated?: (metadata: Record<string, unknown>) => void;
    onCoverageSaved?: () => void;
};

const PRIMARY_INTENTS = OPERATIONAL_INTENT_CATALOG.filter((t) => !t.advanced);

function statusBadgeVariant(
    status: FormLifecycleCoveragePresentation["status"]
): "success" | "warning" | "neutral" | "info" {
    switch (status) {
        case "ready":
            return "success";
        case "missing_required":
            return "warning";
        case "no_schema":
            return "neutral";
        default:
            return "info";
    }
}

/** Lifecycle usage selectors + coverage panel (Card 3). */
export function FormLifecycleUsagePanel({
    formId,
    formMetadata,
    canMutate = false,
    hasSchema = true,
    coverageRefreshKey = "",
    onFormMetadataUpdated,
    onCoverageSaved,
}: Props) {
    const storedUsage = useMemo(() => readFormLifecycleUsage(formMetadata), [formMetadata]);
    const storedIntent = useMemo(() => readStoredOperationalIntent(formMetadata), [formMetadata]);

    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [departmentId, setDepartmentId] = useState(storedUsage?.department_id ?? "");
    const [stageKey, setStageKey] = useState<LifecycleOperatorStage>(storedUsage?.stage_key ?? "lead");
    const [intent, setIntent] = useState<string>(
        storedUsage?.intake_intent ?? storedIntent ?? defaultLifecycleUsageIntent(formMetadata)
    );
    const [presentation, setPresentation] = useState<FormLifecycleCoveragePresentation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/admin/departments", { credentials: "include" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || cancelled) return;
                const items = (json as { items?: DepartmentOption[] }).items ?? [];
                setDepartments(items.map((d) => ({ id: d.id, name: d.name })));
            } catch {
                /* optional — selectors stay empty */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (storedUsage) {
            setDepartmentId(storedUsage.department_id);
            setStageKey(storedUsage.stage_key);
            setIntent(String(storedUsage.intake_intent));
        }
    }, [storedUsage?.department_id, storedUsage?.stage_key, storedUsage?.intake_intent]);

    const loadCoverage = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/lifecycle-coverage`, {
                credentials: "include",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((json as { error?: string }).error ?? "Could not load lifecycle coverage");
            }
            const data = (json as { data?: CoveragePayload }).data;
            if (data?.presentation) {
                setPresentation(data.presentation);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load lifecycle coverage");
        } finally {
            setLoading(false);
        }
    }, [formId]);

    useEffect(() => {
        void loadCoverage();
    }, [loadCoverage, coverageRefreshKey, formMetadata]);

    const saveUsage = useCallback(async () => {
        if (!canMutate || !departmentId.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/forms/${encodeURIComponent(formId)}/lifecycle-coverage`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lifecycle_usage_v1: {
                        department_id: departmentId.trim(),
                        stage_key: stageKey,
                        intake_intent: intent,
                    },
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((json as { error?: string }).error ?? "Could not save lifecycle usage");
            }
            const data = json as {
                data?: {
                    form?: { metadata?: Record<string, unknown> };
                    presentation?: FormLifecycleCoveragePresentation;
                };
            };
            if (data.data?.form?.metadata) {
                onFormMetadataUpdated?.(data.data.form.metadata);
            }
            if (data.data?.presentation) {
                setPresentation(data.data.presentation);
            } else {
                await loadCoverage();
            }
            onCoverageSaved?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save lifecycle usage");
        } finally {
            setSaving(false);
        }
    }, [canMutate, departmentId, stageKey, intent, formId, onFormMetadataUpdated, loadCoverage, onCoverageSaved]);

    const selectedDepartmentName =
        departments.find((d) => d.id === departmentId)?.name ??
        presentation?.lifecycle_label ??
        null;

    const showDetails =
        presentation &&
        presentation.status !== "empty" &&
        presentation.entity_groups.some((g) => g.rows.length > 0);

    return (
        <div
            className="mt-3 rounded-lg bg-white/95 px-3 py-2.5 ring-1 ring-alloy-midnight/[0.07]"
            data-testid="form-lifecycle-usage-panel"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">
                        Business Process
                    </p>
                    <p className={clsx("mt-0.5 max-w-xl", opMutedMeta)}>
                        Checks whether this form captures the information required to create or update records for the
                        selected business process stage.
                    </p>
                </div>
                {presentation ?
                    <StatusBadge
                        label={presentation.status_headline}
                        variant={statusBadgeVariant(presentation.status)}
                    />
                :   null}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3" data-testid="lifecycle-usage-selectors">
                <label className="block space-y-1">
                    <span className="text-xs font-medium text-alloy-midnight">Business Process</span>
                    <select
                        className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm disabled:opacity-60"
                        value={departmentId}
                        disabled={!canMutate || saving}
                        data-testid="lifecycle-usage-department"
                        onChange={(e) => setDepartmentId(e.target.value)}
                    >
                        <option value="">Select process…</option>
                        {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block space-y-1">
                    <span className="text-xs font-medium text-alloy-midnight">Stage</span>
                    <select
                        className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm disabled:opacity-60"
                        value={stageKey}
                        disabled={!canMutate || saving}
                        data-testid="lifecycle-usage-stage"
                        onChange={(e) => setStageKey(e.target.value as LifecycleOperatorStage)}
                    >
                        {LIFECYCLE_STAGE_ORDER.map((stage) => (
                            <option key={stage} value={stage}>
                                {LIFECYCLE_STAGE_LABELS[stage]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block space-y-1">
                    <span className="text-xs font-medium text-alloy-midnight">Intent</span>
                    <select
                        className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm disabled:opacity-60"
                        value={intent}
                        disabled={!canMutate || saving}
                        data-testid="lifecycle-usage-intent"
                        onChange={(e) => setIntent(e.target.value)}
                    >
                        {PRIMARY_INTENTS.map((t) => (
                            <option key={t.key} value={t.key}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {canMutate ?
                <div className="mt-2 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={intakeWorkspaceBtnPrimary}
                        disabled={saving || !departmentId.trim()}
                        data-testid="lifecycle-usage-save"
                        onClick={() => void saveUsage()}
                    >
                        {saving ? "Saving…" : "Save business process"}
                    </button>
                    <button
                        type="button"
                        className={intakeWorkspaceBtnSecondary}
                        disabled={loading}
                        data-testid="lifecycle-usage-refresh"
                        onClick={() => void loadCoverage()}
                    >
                        Refresh coverage
                    </button>
                </div>
            :   null}

            {error ?
                <p className="mt-2 text-sm text-alloy-ember" role="alert">
                    {error}
                </p>
            :   null}

            {loading && !presentation ?
                <div className="mt-3">
                    <BosExecutionLoader variant="inline" title="Loading coverage" />
                </div>
            : presentation ?
                <div className="mt-3" data-testid="lifecycle-coverage-summary">
                    {selectedDepartmentName && presentation.stage_label && presentation.intent_label ?
                        <p className={clsx("text-sm text-alloy-midnight", opMetadata)}>
                            {selectedDepartmentName} · {presentation.stage_label} · {presentation.intent_label}
                        </p>
                    :   null}

                    <p
                        className={clsx(
                            "mt-2 text-sm",
                            presentation.status === "missing_required" ? "text-amber-900/90" : "text-alloy-midnight"
                        )}
                        data-testid="lifecycle-coverage-message"
                    >
                        {presentation.status_message}
                    </p>

                    {!hasSchema && presentation.status === "empty" ?
                        null
                    : presentation.status === "no_schema" ?
                        <p className={clsx("mt-1", opMetadata)}>Add fields in the form builder above, then refresh.</p>
                    :   null}

                    {showDetails ?
                        <div className="mt-2">
                            <button
                                type="button"
                                className="text-xs font-semibold text-alloy-blue hover:underline"
                                data-testid="lifecycle-coverage-details-toggle"
                                onClick={() => setDetailsOpen((v) => !v)}
                            >
                                {detailsOpen ? "Hide coverage details" : "Show coverage details"}
                            </button>
                            {detailsOpen ?
                                <div className="mt-2 space-y-3" data-testid="lifecycle-coverage-details">
                                    {presentation.entity_groups.map((group) => (
                                        <div key={group.entity_label}>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/60">
                                                {group.entity_label}
                                            </p>
                                            <ul className="mt-1 space-y-1">
                                                {group.rows.map((row) => (
                                                    <li
                                                        key={`${group.entity_label}-${row.field_label}-${row.tier_label}`}
                                                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                                                        data-testid="lifecycle-coverage-row"
                                                    >
                                                        <span className="text-alloy-midnight">
                                                            {row.field_label}
                                                            <span className="text-alloy-midnight/50">
                                                                {" "}
                                                                · {row.tier_label}
                                                            </span>
                                                        </span>
                                                        <span
                                                            className={clsx(
                                                                row.status_label === "Satisfied" ?
                                                                    "text-alloy-pine"
                                                                : row.status_label === "Missing" ?
                                                                    "text-red-800/85"
                                                                :   "text-alloy-midnight/50"
                                                            )}
                                                            data-lifecycle-coverage-row-status={row.status_label}
                                                            data-lifecycle-coverage-row-level={row.tier_label}
                                                        >
                                                            {row.status_label}
                                                            {row.detail ? ` — ${row.detail}` : ""}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            :   null}
                        </div>
                    :   null}
                </div>
            : !error ?
                <p className={clsx("mt-3", opMutedMeta)}>
                    Coverage details appear once a business process and stage are selected.
                </p>
            :   null}
        </div>
    );
}
