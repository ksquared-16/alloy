"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { validateFormSchema } from "@/lib/forms/schema";
import { filterPayloadValuesToSchemaFields } from "@/lib/forms/filterPayloadValuesToSchema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";
import { FormEngineRenderer, type FormEngineOptionChoice } from "@/components/forms/engine/FormEngineRenderer";
import { emptyPayload, payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { formatPublicValidationErrors } from "@/lib/public/forms/formatPublicValidationErrors";

type ResolvePacketMeta = {
    packet_session_id: string;
    packet_definition_id: string;
    packet_name: string | null;
    current_sequence_index: number;
    total_steps: number;
    current_session_item_id: string;
    step_summaries?: { sequence_index: number; form_name: string }[];
};

type ResolveOk = {
    ok: true;
    data: {
        schema_json: unknown | null;
        packet_terminal?: boolean;
        packet?: ResolvePacketMeta | null;
        option_values_by_field_id?: Record<string, string[]>;
        option_choices_by_field_id?: Record<string, FormEngineOptionChoice[]>;
    };
};

type ApiErr = {
    ok: false;
    error: string;
    validation_errors?: NormalizedValidationError[];
    code?: string;
};

function storageKey(token: string): string {
    return `alloy_public_form_submission:${encodeURIComponent(token)}`;
}

function normalizeOptionValues(raw: Record<string, string[]> | undefined): Record<string, readonly string[]> {
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, readonly string[]> = {};
    for (const [k, v] of Object.entries(raw)) {
        out[k] = Array.isArray(v) ? v.map(String) : [];
    }
    return out;
}

function normalizeOptionChoices(
    raw: Record<string, FormEngineOptionChoice[]> | undefined
): Record<string, readonly FormEngineOptionChoice[]> {
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, readonly FormEngineOptionChoice[]> = {};
    for (const [k, arr] of Object.entries(raw)) {
        if (!Array.isArray(arr)) continue;
        out[k] = arr
            .filter((x): x is FormEngineOptionChoice => x && typeof x === "object" && typeof x.value === "string")
            .map((x) => ({ value: x.value, label: typeof x.label === "string" ? x.label : x.value }));
    }
    return out;
}

function PreviewBanner() {
    return (
        <div
            role="status"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950"
        >
            <span className="font-semibold">Previewing public form</span>
            {" — "}
            Same experience recipients see when they open your embed link (opened from Alloy admin in a new tab).
            Submissions here create real records in this environment unless you are on a sandbox.
        </div>
    );
}

export function FormEmbedClient({
    token,
    showPreviewBanner = false,
}: {
    token: string;
    showPreviewBanner?: boolean;
}) {
    const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
    const [message, setMessage] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<NormalizedValidationError[] | null>(null);
    const [schema, setSchema] = useState<FormSchemaV1 | null>(null);
    const [payload, setPayload] = useState<FormPayload>(() => emptyPayload());
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [optionValuesByFieldId, setOptionValuesByFieldId] = useState<Record<string, readonly string[]>>({});
    const [optionChoicesByFieldId, setOptionChoicesByFieldId] = useState<
        Record<string, readonly FormEngineOptionChoice[]>
    >({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [packetProgress, setPacketProgress] = useState<ResolvePacketMeta | null>(null);
    const [packetAlreadyDone, setPacketAlreadyDone] = useState(false);
    const [packetFinalThankYou, setPacketFinalThankYou] = useState(false);
    const [advancingToNextPacketStep, setAdvancingToNextPacketStep] = useState(false);
    const draftPersistSeqRef = useRef(0);
    const submittedRef = useRef(false);

    useEffect(() => {
        submittedRef.current = submitted;
    }, [submitted]);

    const encToken = useMemo(() => encodeURIComponent(token), [token]);

    const bootstrap = useCallback(async () => {
        try {
            setPhase("loading");
            setMessage(null);
            setValidationErrors(null);
            setSubmitted(false);
            setPacketFinalThankYou(false);
            setPacketAlreadyDone(false);
            setPacketProgress(null);
            const res = await fetch(`/api/public/forms/${encToken}/resolve`, { method: "GET" });
            const json = (await res.json()) as ResolveOk | ApiErr;
            if (!json.ok) {
                setPhase("error");
                setMessage(json.error ?? "Resolve failed");
                return;
            }

            if (json.data.packet_terminal) {
                setPacketProgress(json.data.packet ?? null);
                setPacketAlreadyDone(true);
                setSchema(null);
                setPhase("ready");
                return;
            }

            const rawSchema = json.data.schema_json as FormSchemaV1 | null;
            if (!rawSchema) {
                setPhase("error");
                setMessage("No form schema returned");
                return;
            }

            let parsedSchema: FormSchemaV1;
            try {
                parsedSchema = validateFormSchema(rawSchema);
            } catch {
                setPhase("error");
                setMessage("Invalid form schema");
                return;
            }
            setSchema(parsedSchema);
            setPacketProgress(json.data.packet ?? null);
            setOptionValuesByFieldId(normalizeOptionValues(json.data.option_values_by_field_id));
            setOptionChoicesByFieldId(normalizeOptionChoices(json.data.option_choices_by_field_id));

            const stored =
                typeof window !== "undefined" ? window.sessionStorage.getItem(storageKey(token)) : null;
            if (stored && /^[0-9a-f-]{36}$/i.test(stored)) {
                const loaded = await fetch(`/api/public/forms/${encToken}/submissions/${stored}`, {
                    method: "GET",
                });
                const body = (await loaded.json()) as {
                    ok: boolean;
                    data?: { id: string; payload: FormPayload };
                    error?: string;
                };
                if (loaded.ok && body.ok && body.data?.payload) {
                    setSubmissionId(body.data.id);
                    let nextPayload = body.data.payload;
                    if (json.data.packet) {
                        nextPayload = {
                            ...nextPayload,
                            values: filterPayloadValuesToSchemaFields(
                                parsedSchema,
                                (nextPayload.values ?? {}) as Record<string, unknown>
                            ),
                        };
                    }
                    setPayload(nextPayload);
                    setPhase("ready");
                    return;
                }
                window.sessionStorage.removeItem(storageKey(token));
            }

            const initialPayload = payloadWithMinimumRepeatingGroups(parsedSchema);
            const created = await fetch(`/api/public/forms/${encToken}/submissions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payload: initialPayload }),
            });
            const cr = (await created.json()) as { ok: boolean; data?: { id: string }; error?: string };
            if (!cr.ok || !cr.data?.id) {
                setPhase("error");
                setMessage(cr.error ?? "Could not start form session");
                return;
            }
            setSubmissionId(cr.data.id);
            window.sessionStorage.setItem(storageKey(token), cr.data.id);
            setPayload(initialPayload);
            setPhase("ready");
        } finally {
            setAdvancingToNextPacketStep(false);
        }
    }, [encToken, token]);

    useEffect(() => {
        void bootstrap();
    }, [bootstrap]);

    useLayoutEffect(() => {
        if ((!submitted && !packetFinalThankYou) || typeof window === "undefined") return;
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [submitted, packetFinalThankYou]);

    const persistDraft = useCallback(
        async (next: FormPayload) => {
            if (!submissionId || submittedRef.current || packetAlreadyDone) return;
            const seq = ++draftPersistSeqRef.current;
            const res = await fetch(`/api/public/forms/${encToken}/submissions/${submissionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    payload: next,
                    option_values_by_field_id: optionValuesByFieldId,
                }),
            });
            if (seq !== draftPersistSeqRef.current || submittedRef.current) return;
            if (!res.ok) {
                // Draft autosave validation is non-blocking — only submit surfaces field errors (IC-5.6).
                return;
            }
        },
        [encToken, optionValuesByFieldId, submissionId, packetAlreadyDone]
    );

    const handleSubmit = useCallback(async () => {
        if (!submissionId || submitting || submitted || packetAlreadyDone) return;
        setSubmitting(true);
        setMessage(null);
        setValidationErrors(null);
        try {
            const res = await fetch(`/api/public/forms/${encToken}/submissions/${submissionId}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    payload,
                    option_values_by_field_id: optionValuesByFieldId,
                }),
            });
            const json = (await res.json()) as
                | ApiErr
                | {
                      ok: true;
                      data?: {
                          packet_complete?: boolean;
                          next_form_available?: boolean;
                      };
                  };
            if (!json.ok) {
                const errBody = json as ApiErr;
                setValidationErrors(errBody.validation_errors ?? null);
                setMessage(errBody.error ?? "Submit failed");
                return;
            }
            window.sessionStorage.removeItem(storageKey(token));
            setValidationErrors(null);
            setMessage(null);

            const data = json.ok ? json.data : undefined;
            if (data?.next_form_available === true && data.packet_complete === false) {
                setAdvancingToNextPacketStep(true);
                setSubmissionId(null);
                setSchema(null);
                await bootstrap();
                return;
            }

            if (packetProgress && data?.packet_complete === true) {
                setPacketFinalThankYou(true);
                return;
            }

            setSubmitted(true);
        } finally {
            setSubmitting(false);
        }
    }, [bootstrap, encToken, optionValuesByFieldId, payload, packetAlreadyDone, packetProgress, submissionId, submitting, submitted, token]);

    if (phase === "loading") {
        return (
            <div className="flex min-h-[200px] items-center justify-center p-6 text-sm text-neutral-600">
                {advancingToNextPacketStep ? "Loading next step…" : "Loading form…"}
            </div>
        );
    }

    if (phase === "error") {
        return (
            <div className="p-6 text-center text-sm text-red-700">
                {message ?? "Unable to load this form."}
            </div>
        );
    }

    if (packetAlreadyDone) {
        return (
            <div className="min-h-screen bg-neutral-50">
                {showPreviewBanner ? <PreviewBanner /> : null}
                <div className="mx-auto max-w-lg px-4 py-16">
                    <div className="rounded-2xl border border-emerald-200 bg-white px-8 py-12 text-center shadow-md">
                        <h1 className="text-xl font-semibold text-neutral-900">Packet already completed</h1>
                        <p className="mt-4 text-sm leading-relaxed text-neutral-700">
                            This enrollment packet has already been submitted. You can close this window.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (packetFinalThankYou) {
        return (
            <div className="min-h-screen bg-neutral-50">
                {showPreviewBanner ? <PreviewBanner /> : null}
                <div className="mx-auto max-w-lg px-4 py-16">
                    <div className="rounded-2xl border border-emerald-200 bg-white px-8 py-12 text-center shadow-md">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">
                            ✓
                        </div>
                        <h1 className="text-xl font-semibold text-neutral-900">Thank you — packet complete.</h1>
                        <p className="mt-4 text-sm leading-relaxed text-neutral-700">
                            You&apos;ve finished every form in this packet. Our staff will review your submissions and
                            follow up if anything else is needed.
                        </p>
                        <p className="mt-6 text-xs text-neutral-500">You can close this window.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!schema) {
        return (
            <div className="flex min-h-[200px] items-center justify-center p-6 text-sm text-neutral-600">
                Loading form…
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen bg-neutral-50">
                {showPreviewBanner ? <PreviewBanner /> : null}
                <div className="mx-auto max-w-lg px-4 py-16">
                    <div className="rounded-2xl border border-emerald-200 bg-white px-8 py-12 text-center shadow-md">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800">
                            ✓
                        </div>
                        <h1 className="text-xl font-semibold text-neutral-900">Thank you — your form was submitted.</h1>
                        <p className="mt-4 text-sm leading-relaxed text-neutral-700">
                            Your answers were received. Our staff will review your submission and follow up if anything
                            else is needed.
                        </p>
                        <p className="mt-6 text-xs text-neutral-500">
                            You can close this window. If you were filling this out in preview mode, you may start again
                            from Alloy admin.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const errorLines = validationErrors?.length ? formatPublicValidationErrors(validationErrors) : [];
    const summaries = packetProgress?.step_summaries ?? [];
    const currentStepNum = packetProgress ? packetProgress.current_sequence_index + 1 : 0;
    const remaining = packetProgress
        ? summaries.filter((s) => s.sequence_index > packetProgress.current_sequence_index)
        : [];

    return (
        <div className="min-h-screen bg-white">
            {showPreviewBanner ? <PreviewBanner /> : null}
            <div className={clsx("mx-auto max-w-xl px-3 pt-4 pb-16", submitting && "pointer-events-none opacity-90")}>
                {packetProgress && summaries.length > 0 ? (
                    <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-800">
                        <p className="font-semibold text-neutral-900">
                            Step {currentStepNum} of {packetProgress.total_steps}
                            {packetProgress.packet_name ? ` · ${packetProgress.packet_name}` : ""}
                        </p>
                        <p className="mt-1 text-neutral-700">
                            Now:{" "}
                            <span className="font-medium">
                                {summaries.find((s) => s.sequence_index === packetProgress.current_sequence_index)
                                    ?.form_name ?? "This form"}
                            </span>
                        </p>
                        {remaining.length > 0 ? (
                            <div className="mt-2 border-t border-neutral-200 pt-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Still to do</p>
                                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-neutral-700">
                                    {remaining.map((s) => (
                                        <li key={s.sequence_index}>{s.form_name}</li>
                                    ))}
                                </ol>
                            </div>
                        ) : (
                            <p className="mt-2 text-xs text-neutral-600">This is the last form in the packet.</p>
                        )}
                    </div>
                ) : null}
                <FormEngineRenderer
                    schema={schema}
                    payload={payload}
                    onChange={(next) => {
                        setValidationErrors(null);
                        setMessage(null);
                        setPayload(next);
                        void persistDraft(next);
                    }}
                    mode="edit"
                    optionValuesByFieldId={optionValuesByFieldId}
                    optionChoicesByFieldId={optionChoicesByFieldId}
                    variant="embed"
                    validationErrors={validationErrors ?? undefined}
                />

                <div className="mt-10 space-y-4 border-t border-neutral-200 pt-8">
                    {errorLines.length ?
                        <ul className="list-disc space-y-1 rounded-md border border-red-100 bg-red-50/80 px-4 py-3 pl-7 text-left text-sm text-red-800">
                            {errorLines.map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>
                    : null}
                    {message ?
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950">
                            {message}
                        </p>
                    : null}
                    <button
                        type="button"
                        disabled={submitting || !submissionId}
                        aria-busy={submitting}
                        className="w-full rounded-lg bg-neutral-900 py-3.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-neutral-400"
                        onClick={() => void handleSubmit()}
                    >
                        {submitting ? "Submitting…" : "Submit"}
                    </button>
                    <p className="text-center text-xs text-neutral-500">
                        Scroll up to review your answers before submitting.
                    </p>
                </div>
            </div>
        </div>
    );
}
