"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionIntakeFieldSpec, ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { fetchActionIntakeSpec } from "@/lib/lifecycle/fetchActionIntakeSpec";
import {
    mapActionIntakeValuesToCreateLeadPayload,
    validateActionIntakePayload,
} from "@/lib/lifecycle/resolveActionIntakeSpec";

export type CreateLeadFormPayload = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    [key: string]: string;
};

type ModalStep = "capture" | "preview";

function emptyValuesForSpec(spec: ActionIntakeSpec): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of [...spec.required, ...spec.recommended, ...spec.optional]) {
        out[field.payload_key] = "";
    }
    return out;
}

function legacyPayloadFromValues(values: Record<string, string>): CreateLeadFormPayload {
    return {
        first_name: values.first_name?.trim() ?? "",
        last_name: values.last_name?.trim() ?? "",
        email: values.email?.trim() ?? "",
        phone: values.phone?.trim() ?? "",
        ...values,
    };
}

export function CreateLeadModal(props: {
    open: boolean;
    departmentId: string | null;
    stageKey?: string | null;
    processId?: string | null;
    title?: string;
    onClose: () => void;
    onSubmit: (payload: CreateLeadFormPayload) => Promise<{ opportunity_id?: string } | void>;
}) {
    const {
        open,
        departmentId,
        stageKey = "lead",
        processId = null,
        title,
        onClose,
        onSubmit,
    } = props;

    const [step, setStep] = useState<ModalStep>("capture");
    const [spec, setSpec] = useState<ActionIntakeSpec | null>(null);
    const [specLoading, setSpecLoading] = useState(false);
    const [specError, setSpecError] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setStep("capture");
        setSpec(null);
        setSpecError(null);
        setValues({});
        setError(null);
        setBusy(false);

        if (!departmentId) {
            setSpecError("Department context is required to create a lead.");
            return;
        }

        let cancelled = false;
        setSpecLoading(true);
        void fetchActionIntakeSpec({
            action_key: "create_lead",
            department_id: departmentId,
            stage_key: stageKey,
            process_id: processId,
        })
            .then((loaded) => {
                if (cancelled) return;
                setSpec(loaded);
                setValues(emptyValuesForSpec(loaded));
            })
            .catch((e) => {
                if (cancelled) return;
                setSpecError(e instanceof Error ? e.message : "Failed to load requirements");
            })
            .finally(() => {
                if (!cancelled) setSpecLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, departmentId, stageKey, processId]);

    const validation = useMemo(() => {
        if (!spec) return { ok: true as const, issues: [] };
        return validateActionIntakePayload(spec, values);
    }, [spec, values]);

    const canReview = Boolean(spec) && validation.ok && !specLoading && !busy;

    const setFieldValue = useCallback((payloadKey: string, next: string) => {
        setValues((prev) => ({ ...prev, [payloadKey]: next }));
    }, []);

    const modalTitle = title ?? spec?.copy.title ?? "Create lead";
    const helpCopy =
        spec?.copy.help ??
        "Add a person and create a new lead. Required fields come from your lifecycle configuration.";

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl max-h-[90vh] flex flex-col";
    const label = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";
    const input =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

    const renderField = (field: ActionIntakeFieldSpec) => {
        const tierHint =
            field.tier === "required"
                ? "Required"
                : field.tier === "recommended"
                  ? "Recommended"
                  : "Optional";
        const inputType =
            field.value_kind === "email" ? "email" : field.value_kind === "phone" ? "tel" : "text";
        return (
            <div key={field.rule_id} data-testid={`create-lead-field-${field.rule_id}`}>
                <div className="flex items-baseline justify-between gap-2">
                    <div className={label}>{field.field_label}</div>
                    <span className="text-[10px] text-alloy-midnight/45">{tierHint}</span>
                </div>
                <input
                    value={values[field.payload_key] ?? ""}
                    disabled={busy || specLoading}
                    onChange={(e) => setFieldValue(field.payload_key, e.target.value)}
                    className={`${input} mt-0.5`}
                    type={inputType}
                    autoComplete={field.value_kind === "email" ? "email" : field.value_kind === "phone" ? "tel" : "off"}
                    data-testid={`create-lead-input-${field.payload_key}`}
                />
            </div>
        );
    };

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy ? onClose() : null)} />
            <div
                className={panel}
                role="dialog"
                aria-modal="true"
                aria-label={modalTitle}
                data-testid="create-lead-modal"
            >
                <div className="flex items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4 shrink-0">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{modalTitle}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">{helpCopy}</div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {specLoading ? (
                        <p className="text-sm text-alloy-midnight/55" data-testid="create-lead-spec-loading">
                            Loading required information…
                        </p>
                    ) : null}
                    {specError ? (
                        <p className="text-sm text-red-700" role="alert" data-testid="create-lead-spec-error">
                            {specError}
                        </p>
                    ) : null}

                    {step === "capture" && spec ? (
                        <div className="space-y-4" data-testid="create-lead-capture-step">
                            {spec.groups.map((group) => (
                                <section
                                    key={group.entity}
                                    className="space-y-2"
                                    data-testid={`create-lead-group-${group.entity}`}
                                >
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                        {group.entity_label}
                                    </h3>
                                    <div className="space-y-3">{group.fields.map(renderField)}</div>
                                </section>
                            ))}
                            {!validation.ok ? (
                                <div
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950"
                                    data-testid="create-lead-missing-required"
                                    role="alert"
                                >
                                    <p className="font-medium">Complete required fields before continuing:</p>
                                    <ul className="mt-1 list-inside list-disc">
                                        {validation.issues.map((issue) => (
                                            <li key={`${issue.rule_id}-${issue.message}`}>{issue.message}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {step === "preview" && spec ? (
                        <div className="space-y-3" data-testid="create-lead-preview-step">
                            <p className="text-[12px] text-alloy-midnight/60">
                                Review the lead summary below. Nothing is saved until you confirm.
                            </p>
                            <dl className="space-y-2 rounded-lg border border-alloy-stone/15 bg-alloy-stone/5 px-3 py-3 text-sm">
                                {spec.groups.map((group) => (
                                    <div key={group.entity}>
                                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                            {group.entity_label}
                                        </dt>
                                        <dd className="mt-1 space-y-1">
                                            {group.fields.map((field) => {
                                                const v = (values[field.payload_key] ?? "").trim();
                                                if (!v) return null;
                                                return (
                                                    <div
                                                        key={field.rule_id}
                                                        className="flex justify-between gap-3"
                                                        data-testid={`create-lead-preview-${field.payload_key}`}
                                                    >
                                                        <span className="text-alloy-midnight/55">
                                                            {field.field_label}
                                                        </span>
                                                        <span className="font-medium text-alloy-midnight text-right">
                                                            {v}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    ) : null}

                    {error ? (
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {error}
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4 shrink-0">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    {step === "capture" ? (
                        <button
                            type="button"
                            disabled={!canReview}
                            onClick={() => {
                                if (!spec || !validation.ok) return;
                                setError(null);
                                setStep("preview");
                            }}
                            className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                            data-testid="create-lead-review-button"
                        >
                            Review lead
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setStep("capture")}
                                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                                data-testid="create-lead-back-button"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                disabled={busy || !spec}
                                onClick={async () => {
                                    if (!spec) return;
                                    setBusy(true);
                                    setError(null);
                                    try {
                                        const mapped = mapActionIntakeValuesToCreateLeadPayload(spec, values);
                                        const check = validateActionIntakePayload(spec, values);
                                        if (!check.ok) {
                                            setStep("capture");
                                            return;
                                        }
                                        await onSubmit(legacyPayloadFromValues(mapped));
                                        onClose();
                                    } catch (e) {
                                        setError(e instanceof Error ? e.message : "Create lead failed");
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                                className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                data-testid="create-lead-confirm-button"
                            >
                                {busy ? "Creating…" : "Confirm & create lead"}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
