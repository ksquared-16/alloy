"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { fetchActionIntakeSpec } from "@/lib/lifecycle/fetchActionIntakeSpec";
import {
    mapActionIntakeValuesToCreateLeadPayload,
    validateActionIntakePayload,
} from "@/lib/lifecycle/resolveActionIntakeSpec";
import { applyActionIntakePasteExtraction } from "@/lib/lifecycle/applyActionIntakePasteExtraction";
import type { ActionIntakePasteFieldMeta } from "@/lib/lifecycle/actionIntakePasteParserTypes";
import { createLeadIntakePasteParser } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import { ActionIntakeModalShell } from "@/components/admin/opportunity/actions/ActionIntakeModalShell";
import { ActionIntakePastePanel } from "@/components/admin/opportunity/actions/ActionIntakePastePanel";
import { ActionIntakeFieldGroups } from "@/components/admin/opportunity/actions/ActionIntakeFieldGroups";

export type CreateLeadFormPayload = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    [key: string]: string;
};

type ModalStep = "intake" | "capture" | "preview";

const CREATE_LEAD_EXTRA_FIELDS = [
    { payload_key: "source", field_label: "Source", tier: "optional" as const, value_kind: "text" as const },
    {
        payload_key: "intake_notes",
        field_label: "Intake notes",
        tier: "optional" as const,
        value_kind: "text" as const,
        multiline: true,
    },
] as const;

function emptyValuesForSpec(spec: ActionIntakeSpec): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of [...spec.required, ...spec.recommended, ...spec.optional]) {
        out[field.payload_key] = "";
    }
    for (const extra of CREATE_LEAD_EXTRA_FIELDS) out[extra.payload_key] = "";
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

    const [step, setStep] = useState<ModalStep>("intake");
    const [spec, setSpec] = useState<ActionIntakeSpec | null>(null);
    const [specLoading, setSpecLoading] = useState(false);
    const [specError, setSpecError] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [fieldMeta, setFieldMeta] = useState<Record<string, ActionIntakePasteFieldMeta>>({});
    const [pasteText, setPasteText] = useState("");
    const [parseSummary, setParseSummary] = useState<string | null>(null);
    const [parsing, setParsing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setStep("intake");
        setSpec(null);
        setSpecError(null);
        setValues({});
        setFieldMeta({});
        setPasteText("");
        setParseSummary(null);
        setParsing(false);
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
        setFieldMeta((prev) => {
            if (!prev[payloadKey]?.from_paste) return prev;
            const copy = { ...prev };
            delete copy[payloadKey];
            return copy;
        });
    }, []);

    const runPasteParse = useCallback(
        (opts?: { advanceToCapture?: boolean; overwrite?: boolean }) => {
            if (!spec || !pasteText.trim()) return;
            setParsing(true);
            setError(null);
            try {
                const extraction = createLeadIntakePasteParser.parse({ text: pasteText, spec });
                const applied = applyActionIntakePasteExtraction({
                    current_values: values,
                    current_meta: fieldMeta,
                    extraction,
                    overwrite: opts?.overwrite ?? step !== "intake",
                });
                setValues(applied.values);
                setFieldMeta(applied.field_meta);

                const count = extraction.fields.length;
                setParseSummary(
                    count > 0 ?
                        `BOS drafted ${count} field${count === 1 ? "" : "s"} from your paste. Review and edit before creating.`
                    :   "No structured fields were detected. Enter details manually below."
                );

                if (opts?.advanceToCapture ?? step === "intake") {
                    setStep("capture");
                }
            } catch (e) {
                setParseSummary(null);
                setError(e instanceof Error ? e.message : "Could not parse pasted text.");
            } finally {
                setParsing(false);
            }
        },
        [fieldMeta, pasteText, spec, step, values]
    );

    const modalTitle = title ?? spec?.copy.title ?? "Create lead";
    const helpCopy =
        spec?.copy.help ??
        "Add a new enrollment lead. Paste inquiry details or enter manually — you approve every field before create.";

    const footer = (
        <>
            <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
            >
                Cancel
            </button>
            {step === "intake" ?
                <>
                    <button
                        type="button"
                        disabled={specLoading || busy || !spec}
                        onClick={() => setStep("capture")}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                        data-testid="create-lead-enter-manually-button"
                    >
                        Enter manually
                    </button>
                    <button
                        type="button"
                        disabled={specLoading || parsing || busy || !spec || !pasteText.trim()}
                        onClick={() => runPasteParse({ advanceToCapture: true, overwrite: true })}
                        className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        data-testid="create-lead-intake-parse-button"
                    >
                        {parsing ? "Parsing…" : "Parse & continue"}
                    </button>
                </>
            : step === "capture" ?
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
            :   <>
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
                                if ((values.source ?? "").trim()) mapped.source = values.source.trim();
                                if ((values.intake_notes ?? "").trim()) {
                                    mapped.intake_notes = values.intake_notes.trim();
                                }
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
            }
        </>
    );

    if (!open) return null;

    return (
        <ActionIntakeModalShell
            open={open}
            onClose={onClose}
            busy={busy}
            title={modalTitle}
            description={helpCopy}
            footer={footer}
            data-testid="create-lead-modal"
        >
            {specLoading ?
                <p className="text-sm text-alloy-midnight/55" data-testid="create-lead-spec-loading">
                    Loading required information…
                </p>
            :   null}
            {specError ?
                <p className="text-sm text-red-700" role="alert" data-testid="create-lead-spec-error">
                    {specError}
                </p>
            :   null}

            {step === "intake" ?
                <div className="space-y-4" data-testid="create-lead-intake-step">
                    <ActionIntakePastePanel
                        pasteText={pasteText}
                        onPasteTextChange={setPasteText}
                        onParse={() => runPasteParse({ advanceToCapture: true, overwrite: true })}
                        parsing={parsing}
                        disabled={busy || specLoading || !spec}
                        parseSummary={parseSummary}
                    />
                    <p className="text-center text-[12px] text-alloy-midnight/50">
                        Prefer typing? Use <span className="font-medium">Enter manually</span> to skip paste.
                    </p>
                </div>
            :   null}

            {step === "capture" && spec ?
                <div className="space-y-4" data-testid="create-lead-capture-step">
                    <ActionIntakePastePanel
                        pasteText={pasteText}
                        onPasteTextChange={setPasteText}
                        onParse={() => runPasteParse({ overwrite: true })}
                        parsing={parsing}
                        disabled={busy || specLoading}
                        parseSummary={parseSummary}
                        compact
                    />
                    <ActionIntakeFieldGroups
                        spec={spec}
                        values={values}
                        fieldMeta={fieldMeta}
                        onFieldChange={setFieldValue}
                        disabled={busy || specLoading}
                        extraFields={[...CREATE_LEAD_EXTRA_FIELDS]}
                        dataTestIdPrefix="create-lead"
                    />
                    {!validation.ok ?
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
                    :   null}
                </div>
            :   null}

            {step === "preview" && spec ?
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
                                                <span className="text-alloy-midnight/55">{field.field_label}</span>
                                                <span className="text-right font-medium text-alloy-midnight">{v}</span>
                                            </div>
                                        );
                                    })}
                                </dd>
                            </div>
                        ))}
                        {CREATE_LEAD_EXTRA_FIELDS.map((field) => {
                            const v = (values[field.payload_key] ?? "").trim();
                            if (!v) return null;
                            return (
                                <div
                                    key={field.payload_key}
                                    className="flex justify-between gap-3"
                                    data-testid={`create-lead-preview-${field.payload_key}`}
                                >
                                    <span className="text-alloy-midnight/55">{field.field_label}</span>
                                    <span className="text-right font-medium text-alloy-midnight">{v}</span>
                                </div>
                            );
                        })}
                    </dl>
                </div>
            :   null}

            {error ?
                <div className="mt-3 rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                    {error}
                </div>
            :   null}
        </ActionIntakeModalShell>
    );
}
