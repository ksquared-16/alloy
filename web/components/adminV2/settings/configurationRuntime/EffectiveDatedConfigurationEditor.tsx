"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
    buildVersionTimeline,
    canVoidVersion,
    type EffectiveDatedVersionRow,
} from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import { formatEffectiveRange } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigButtonRow,
    ConfigDateInput,
    ConfigFieldLabel,
    ConfigNumberInput,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigSelectInput,
    ConfigTextInput,
    ConfigVersionBadge,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";

/**
 * EffectiveDatedConfigurationEditor — the single shared authoring primitive for
 * versioned operational configuration (Operational Configuration V1, Batch 1).
 *
 * One editor, many domains: it renders a version timeline (Current / Scheduled /
 * Superseded / Retired), a "Create future version" inline form, and retire/void
 * affordances, driven entirely by a field schema + callbacks. Today it powers
 * rate plans and rate rules; the same component is intended to later power
 * capacity, ratio, operating-window, and schedule-rule authoring without
 * reinventing the versioning UX.
 *
 * It owns NO write logic and NO precedence: callbacks perform the supersede via
 * the role-gated services, and the pure version model classifies the timeline.
 */

export type EditorFieldType = "text" | "number" | "money" | "date" | "select";

export type EditorField = {
    key: string;
    label: string;
    type: EditorFieldType;
    options?: { value: string; label: string }[];
    placeholder?: string;
    /** Prefilled value when opening the new-version form (e.g. current value). */
    defaultValue?: string;
    required?: boolean;
};

export type EffectiveDatedEditorProps<T extends EffectiveDatedVersionRow> = {
    title: string;
    versions: readonly T[];
    todayYmd: string;
    /** Field schema for the create/new-version form (excludes effective_start). */
    fields: EditorField[];
    /** Render the domain-specific value summary for one version in the timeline. */
    renderVersionSummary: (row: T) => ReactNode;
    /** Perform the supersede/create. `values` keys match field keys + effectiveStart. */
    onCreateVersion: (values: { effectiveStart: string; fields: Record<string, string> }) => Promise<void>;
    onRetire: (input: { effectiveEnd: string }) => Promise<void>;
    onVoid: (row: T) => Promise<void>;
    /** Resolved-value preview shown above the timeline (doctrine: preview everywhere). */
    resolvedPreview?: ReactNode;
    canMutate: boolean;
    busy?: boolean;
    /** Verb shown on the create button when the lineage is empty vs. has versions. */
    emptyCreateLabel?: string;
    testIdPrefix: string;
};

function initialFieldValues(fields: EditorField[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of fields) out[f.key] = f.defaultValue ?? (f.type === "select" ? (f.options?.[0]?.value ?? "") : "");
    return out;
}

export function EffectiveDatedConfigurationEditor<T extends EffectiveDatedVersionRow>({
    title,
    versions,
    todayYmd,
    fields,
    renderVersionSummary,
    onCreateVersion,
    onRetire,
    onVoid,
    resolvedPreview,
    canMutate,
    busy,
    emptyCreateLabel = "Create version",
    testIdPrefix,
}: EffectiveDatedEditorProps<T>) {
    const timeline = useMemo(() => buildVersionTimeline(versions, todayYmd), [versions, todayYmd]);

    const [mode, setMode] = useState<"idle" | "create" | "retire">("idle");
    const [effectiveStart, setEffectiveStart] = useState("");
    const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => initialFieldValues(fields));
    const [retireEnd, setRetireEnd] = useState("");
    const [formError, setFormError] = useState<string | null>(null);

    const hasVersions = versions.length > 0;

    function openCreate() {
        setFieldValues(initialFieldValues(fields));
        setEffectiveStart("");
        setFormError(null);
        setMode("create");
    }

    async function submitCreate() {
        if (!effectiveStart) {
            setFormError("Effective start date is required");
            return;
        }
        for (const f of fields) {
            if (f.required && !fieldValues[f.key]?.trim()) {
                setFormError(`${f.label} is required`);
                return;
            }
        }
        setFormError(null);
        try {
            await onCreateVersion({ effectiveStart, fields: fieldValues });
            setMode("idle");
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to save version");
        }
    }

    async function submitRetire() {
        if (!retireEnd) {
            setFormError("Retirement date is required");
            return;
        }
        setFormError(null);
        try {
            await onRetire({ effectiveEnd: retireEnd });
            setMode("idle");
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to retire");
        }
    }

    return (
        <ConfigurationDetailCard title={title} testId={`${testIdPrefix}-editor`}>
            {resolvedPreview ? <div className="mb-3">{resolvedPreview}</div> : null}

            {/* Version timeline */}
            {hasVersions ? (
                <ol className="mb-3 space-y-2" data-testid={`${testIdPrefix}-timeline`}>
                    {timeline.map(({ row, status }) => (
                        <li
                            key={row.id}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-alloy-stone/30 px-3 py-2"
                            data-testid={`${testIdPrefix}-version-${row.id}`}
                        >
                            <div className="min-w-0">
                                <div className="mb-0.5 flex items-center gap-2">
                                    <ConfigVersionBadge status={status} />
                                    <span className="config-typo-sublabel text-alloy-forge/60">
                                        {formatEffectiveRange(row)}
                                    </span>
                                </div>
                                <div className="config-typo-field-value text-alloy-midnight">
                                    {renderVersionSummary(row)}
                                </div>
                            </div>
                            {canMutate && canVoidVersion(row, versions, todayYmd) ? (
                                <ConfigSecondaryButton
                                    onClick={() => void onVoid(row)}
                                    disabled={busy}
                                    testId={`${testIdPrefix}-void-${row.id}`}
                                >
                                    Void
                                </ConfigSecondaryButton>
                            ) : null}
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="config-typo-sublabel mb-3 text-alloy-forge/60" data-testid={`${testIdPrefix}-empty`}>
                    No versions yet.
                </p>
            )}

            {/* Actions */}
            {canMutate && mode === "idle" ? (
                <ConfigButtonRow>
                    <ConfigPrimaryButton onClick={openCreate} disabled={busy} testId={`${testIdPrefix}-new-version`}>
                        {hasVersions ? "Create future version" : emptyCreateLabel}
                    </ConfigPrimaryButton>
                    {hasVersions ? (
                        <ConfigSecondaryButton
                            onClick={() => {
                                setRetireEnd("");
                                setFormError(null);
                                setMode("retire");
                            }}
                            disabled={busy}
                            testId={`${testIdPrefix}-retire`}
                        >
                            Retire
                        </ConfigSecondaryButton>
                    ) : null}
                </ConfigButtonRow>
            ) : null}

            {/* Create / new-version form */}
            {canMutate && mode === "create" ? (
                <div className="space-y-3 rounded-md border border-alloy-stone/30 bg-alloy-stone/5 p-3" data-testid={`${testIdPrefix}-form`}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <ConfigFieldLabel label="Effective start">
                            <ConfigDateInput
                                value={effectiveStart}
                                onChange={setEffectiveStart}
                                disabled={busy}
                                testId={`${testIdPrefix}-field-effective_start`}
                            />
                        </ConfigFieldLabel>
                        {fields.map((f) => (
                            <ConfigFieldLabel key={f.key} label={f.label}>
                                {f.type === "select" ? (
                                    <ConfigSelectInput
                                        value={fieldValues[f.key] ?? ""}
                                        onChange={(v) => setFieldValues((s) => ({ ...s, [f.key]: v }))}
                                        options={f.options ?? []}
                                        disabled={busy}
                                        testId={`${testIdPrefix}-field-${f.key}`}
                                    />
                                ) : f.type === "number" || f.type === "money" ? (
                                    <ConfigNumberInput
                                        value={fieldValues[f.key] ?? ""}
                                        onChange={(v) => setFieldValues((s) => ({ ...s, [f.key]: v }))}
                                        placeholder={f.placeholder}
                                        step={f.type === "money" ? "0.01" : "1"}
                                        min="0"
                                        disabled={busy}
                                        testId={`${testIdPrefix}-field-${f.key}`}
                                    />
                                ) : (
                                    <ConfigTextInput
                                        value={fieldValues[f.key] ?? ""}
                                        onChange={(v) => setFieldValues((s) => ({ ...s, [f.key]: v }))}
                                        placeholder={f.placeholder}
                                        disabled={busy}
                                        testId={`${testIdPrefix}-field-${f.key}`}
                                    />
                                )}
                            </ConfigFieldLabel>
                        ))}
                    </div>
                    {formError ? (
                        <p className="text-xs text-red-700" role="alert" data-testid={`${testIdPrefix}-form-error`}>
                            {formError}
                        </p>
                    ) : null}
                    <ConfigButtonRow>
                        <ConfigPrimaryButton onClick={() => void submitCreate()} disabled={busy} testId={`${testIdPrefix}-save`}>
                            Save version
                        </ConfigPrimaryButton>
                        <ConfigSecondaryButton onClick={() => setMode("idle")} disabled={busy} testId={`${testIdPrefix}-cancel`}>
                            Cancel
                        </ConfigSecondaryButton>
                    </ConfigButtonRow>
                </div>
            ) : null}

            {/* Retire form */}
            {canMutate && mode === "retire" ? (
                <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3" data-testid={`${testIdPrefix}-retire-form`}>
                    <ConfigFieldLabel label="Last effective day">
                        <ConfigDateInput value={retireEnd} onChange={setRetireEnd} disabled={busy} testId={`${testIdPrefix}-retire-date`} />
                    </ConfigFieldLabel>
                    <p className="config-typo-sublabel text-alloy-forge/60">
                        The configuration stops resolving after this date. History is preserved.
                    </p>
                    {formError ? (
                        <p className="text-xs text-red-700" role="alert">
                            {formError}
                        </p>
                    ) : null}
                    <ConfigButtonRow>
                        <ConfigPrimaryButton onClick={() => void submitRetire()} disabled={busy} testId={`${testIdPrefix}-retire-confirm`}>
                            Retire
                        </ConfigPrimaryButton>
                        <ConfigSecondaryButton onClick={() => setMode("idle")} disabled={busy}>
                            Cancel
                        </ConfigSecondaryButton>
                    </ConfigButtonRow>
                </div>
            ) : null}
        </ConfigurationDetailCard>
    );
}
