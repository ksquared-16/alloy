"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { type LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
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
import { intakeWorkspaceBtnSecondary } from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";
import { BosExecutionLoader } from "@/components/admin/actions/BosExecutionLoader";

/** Alloy pine primary — matches the coherent inspector-rail accent (not the legacy blue). */
const BUSINESS_PROCESS_SAVE_BTN =
    "rounded-lg bg-alloy-bend-pine px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40";

/** The single canonical business process a form serves in this release. */
const BUSINESS_PROCESS_LABEL = "Enrollment";

/**
 * Stage options for the Enrollment business process, in operator-facing order.
 * Keys stay within the coverage engine's stage vocabulary (LifecycleOperatorStage) so
 * requirement coverage + persistence keep working; labels and curation come from the
 * canonical Enrollment process — the stale generic "Qualification" stage is omitted.
 */
const ENROLLMENT_STAGE_OPTIONS: { key: LifecycleOperatorStage; label: string }[] = [
    { key: "lead", label: "New Lead" },
    { key: "tour", label: "Tour" },
    { key: "waitlist", label: "Waitlist" },
    { key: "enrollment", label: "Enrolling" },
    { key: "enrolled", label: "Enrolled" },
];

type DepartmentOption = {
    id: string;
    name: string;
    key?: string | null;
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
    /**
     * Operator-opened state wins once they touch the toggle; until then a blocking coverage result
     * opens itself. A gap the operator has to go looking for is a gap they will not fix.
     */
    const [detailsToggledByOperator, setDetailsToggledByOperator] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/admin/departments", { credentials: "include" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || cancelled) return;
                const items = (json as { items?: DepartmentOption[] }).items ?? [];
                const mapped = items.map((d) => ({ id: d.id, name: d.name, key: d.key ?? null }));
                setDepartments(mapped);
                // Business Process is the single Enrollment process — auto-bind its department
                // so the operator never has to pick "Enrollment A/B".
                setDepartmentId(
                    (prev) => prev || mapped.find((d) => d.key === "enrollment")?.id || mapped[0]?.id || ""
                );
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
                throw new Error((json as { error?: string }).error ?? "Could not load business process coverage");
            }
            const data = (json as { data?: CoveragePayload }).data;
            if (data?.presentation) {
                setPresentation(data.presentation);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load business process coverage");
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
                throw new Error((json as { error?: string }).error ?? "Could not save business process");
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
            setError(e instanceof Error ? e.message : "Could not save business process");
        } finally {
            setSaving(false);
        }
    }, [canMutate, departmentId, stageKey, intent, formId, onFormMetadataUpdated, loadCoverage, onCoverageSaved]);

    // Show the canonical process name, not the underlying department (e.g. "Enrollment A").
    const selectedDepartmentName = BUSINESS_PROCESS_LABEL;
    const selectedStageLabel =
        ENROLLMENT_STAGE_OPTIONS.find((s) => s.key === stageKey)?.label ?? presentation?.stage_label ?? null;

    const showDetails =
        presentation &&
        presentation.status !== "empty" &&
        presentation.entity_groups.some((g) => g.rows.length > 0);

    // A blocking result opens its own detail — until the operator expresses a preference.
    const detailsExpanded =
        detailsToggledByOperator ? detailsOpen : detailsOpen || presentation?.status === "missing_required";

    // A brand-new form (no fields yet) shouldn't read as a record-blocking error. R1 now
    // configures the business process by default, so an empty form would otherwise show
    // "Missing required fields — cannot create a Lead" before the operator adds anything.
    // Present a neutral, actionable state until at least one field exists.
    const emptyForm = !hasSchema;

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
                        label={emptyForm ? "No fields yet" : presentation.status_headline}
                        variant={emptyForm ? "neutral" : statusBadgeVariant(presentation.status)}
                    />
                :   null}
            </div>

            <div className="mt-3 grid gap-2" data-testid="lifecycle-usage-selectors">
                <label className="block space-y-1">
                    <span className="text-xs font-medium text-alloy-midnight">Business Process</span>
                    <div
                        className="w-full rounded-lg border border-alloy-midnight/10 bg-alloy-stone/[0.15] px-2.5 py-1.5 text-sm text-alloy-midnight"
                        data-testid="lifecycle-usage-business-process"
                    >
                        {BUSINESS_PROCESS_LABEL}
                    </div>
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
                        {ENROLLMENT_STAGE_OPTIONS.map((stage) => (
                            <option key={stage.key} value={stage.key}>
                                {stage.label}
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
                        className={BUSINESS_PROCESS_SAVE_BTN}
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
                    {selectedDepartmentName && selectedStageLabel && presentation.intent_label ?
                        <p className={clsx("text-sm text-alloy-midnight", opMetadata)}>
                            {selectedDepartmentName} · {selectedStageLabel} · {presentation.intent_label}
                        </p>
                    :   null}

                    <p
                        className="mt-2 text-sm text-alloy-midnight/80"
                        data-testid="lifecycle-coverage-message"
                    >
                        {emptyForm ?
                            "Add the fields this stage needs — a parent name plus an email or phone — and this form will be ready to create a Lead."
                        :   presentation.status_message}
                    </p>

                    {/* Name the gaps. A warning that says "missing required fields" without saying
                        which ones leaves the operator guessing at a list the engine already has. */}
                    {!emptyForm && presentation.missing_required_labels.length ?
                        <ul className="mt-2 space-y-1" data-testid="lifecycle-coverage-missing-required">
                            {presentation.missing_required_labels.map((label) => (
                                <li
                                    key={label}
                                    className="flex items-baseline gap-1.5 text-sm text-alloy-midnight"
                                    data-lifecycle-missing-required-label={label}
                                >
                                    <span aria-hidden className="text-alloy-ember">
                                        •
                                    </span>
                                    {label}
                                </li>
                            ))}
                        </ul>
                    :   null}

                    {!hasSchema && presentation.status === "empty" ?
                        null
                    : presentation.status === "no_schema" ?
                        <p className={clsx("mt-1", opMetadata)}>Add fields in the form builder above, then refresh.</p>
                    :   null}

                    {showDetails ?
                        <div className="mt-2">
                            <button
                                type="button"
                                className="text-xs font-semibold text-alloy-bend-pine hover:underline"
                                data-testid="lifecycle-coverage-details-toggle"
                                onClick={() => {
                                    setDetailsToggledByOperator(true);
                                    setDetailsOpen((v) => !v);
                                }}
                            >
                                {detailsExpanded ? "Hide coverage details" : "Show coverage details"}
                            </button>
                            {detailsExpanded ?
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
                                                            {row.deferred_note ?
                                                                <span
                                                                    className="block text-[11px] text-alloy-midnight/45"
                                                                    data-lifecycle-coverage-row-deferred="true"
                                                                >
                                                                    {row.deferred_note}
                                                                </span>
                                                            :   null}
                                                        </span>
                                                        <span
                                                            className={clsx(
                                                                row.status_label === "Satisfied" ?
                                                                    "text-alloy-pine"
                                                                : row.status_label === "Missing" ?
                                                                    "text-alloy-ember"
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
