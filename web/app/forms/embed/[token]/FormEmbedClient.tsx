"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";
import { FormEngineRenderer, type FormEngineOptionChoice } from "@/components/forms/engine/FormEngineRenderer";
import { emptyPayload, payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { formatPublicValidationErrors } from "@/lib/public/forms/formatPublicValidationErrors";

type ResolveOk = {
    ok: true;
    data: {
        schema_json: unknown;
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

    const encToken = useMemo(() => encodeURIComponent(token), [token]);

    const bootstrap = useCallback(async () => {
        setPhase("loading");
        setMessage(null);
        setValidationErrors(null);
        setSubmitted(false);
        const res = await fetch(`/api/public/forms/${encToken}/resolve`, { method: "GET" });
        const json = (await res.json()) as ResolveOk | ApiErr;
        if (!json.ok) {
            setPhase("error");
            setMessage(json.error ?? "Resolve failed");
            return;
        }
        const rawSchema = json.data.schema_json as FormSchemaV1;
        setSchema(rawSchema);
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
                setPayload(body.data.payload);
                setPhase("ready");
                return;
            }
            window.sessionStorage.removeItem(storageKey(token));
        }

        const initialPayload = payloadWithMinimumRepeatingGroups(rawSchema);
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
    }, [encToken, token]);

    useEffect(() => {
        void bootstrap();
    }, [bootstrap]);

    useLayoutEffect(() => {
        if (!submitted || typeof window === "undefined") return;
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [submitted]);

    const persistDraft = useCallback(
        async (next: FormPayload) => {
            if (!submissionId || submitted) return;
            const res = await fetch(`/api/public/forms/${encToken}/submissions/${submissionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    payload: next,
                    option_values_by_field_id: optionValuesByFieldId,
                }),
            });
            const json = (await res.json()) as ApiErr | { ok: true; data?: unknown };
            if (!res.ok) {
                const err = json as ApiErr;
                if (err.validation_errors?.length) {
                    setValidationErrors(err.validation_errors);
                    setMessage(err.error ?? "Could not save draft");
                }
            }
        },
        [encToken, optionValuesByFieldId, submissionId, submitted]
    );

    const handleSubmit = useCallback(async () => {
        if (!submissionId || submitting || submitted) return;
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
            const json = (await res.json()) as ApiErr | { ok: true };
            if (!json.ok) {
                const errBody = json as ApiErr;
                setValidationErrors(errBody.validation_errors ?? null);
                setMessage(errBody.error ?? "Submit failed");
                return;
            }
            window.sessionStorage.removeItem(storageKey(token));
            setValidationErrors(null);
            setSubmitted(true);
            setMessage(null);
        } finally {
            setSubmitting(false);
        }
    }, [encToken, optionValuesByFieldId, payload, submissionId, submitting, submitted, token]);

    if (phase === "loading" || !schema) {
        return (
            <div className="flex min-h-[200px] items-center justify-center p-6 text-sm text-neutral-600">
                Loading form…
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

    return (
        <div className="min-h-screen bg-white">
            {showPreviewBanner ? <PreviewBanner /> : null}
            <div className={clsx("mx-auto max-w-xl px-3 pt-4 pb-16", submitting && "opacity-[0.98]")}>
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
