"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";
import { FormEngineRenderer, type FormEngineOptionChoice } from "@/components/forms/engine/FormEngineRenderer";
import { emptyPayload } from "@/components/forms/engine/formEnginePayload";
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

export function FormEmbedClient({ token }: { token: string }) {
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

    const encToken = useMemo(() => encodeURIComponent(token), [token]);

    const bootstrap = useCallback(async () => {
        setPhase("loading");
        setMessage(null);
        setValidationErrors(null);
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

        const created = await fetch(`/api/public/forms/${encToken}/submissions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload: emptyPayload() }),
        });
        const cr = (await created.json()) as { ok: boolean; data?: { id: string }; error?: string };
        if (!cr.ok || !cr.data?.id) {
            setPhase("error");
            setMessage(cr.error ?? "Could not start form session");
            return;
        }
        setSubmissionId(cr.data.id);
        window.sessionStorage.setItem(storageKey(token), cr.data.id);
        setPayload(emptyPayload());
        setPhase("ready");
    }, [encToken, token]);

    useEffect(() => {
        void bootstrap();
    }, [bootstrap]);

    const persistDraft = useCallback(
        async (next: FormPayload) => {
            if (!submissionId) return;
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
        [encToken, optionValuesByFieldId, submissionId]
    );

    const handleSubmit = useCallback(async () => {
        if (!submissionId) return;
        setMessage(null);
        setValidationErrors(null);
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
        setMessage("Submitted successfully.");
    }, [encToken, optionValuesByFieldId, payload, submissionId, token]);

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

    const errorLines = validationErrors?.length ? formatPublicValidationErrors(validationErrors) : [];

    return (
        <div className="min-h-screen bg-white pb-24">
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
            />
            <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white p-4 shadow-lg">
                <div className="mx-auto flex max-w-xl flex-col gap-2">
                    {errorLines.length ? (
                        <ul className="max-h-36 list-disc overflow-y-auto pl-5 text-left text-sm text-red-700">
                            {errorLines.map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>
                    ) : null}
                    {message ? <p className="text-center text-sm text-neutral-700">{message}</p> : null}
                    <button
                        type="button"
                        className="w-full rounded-lg bg-neutral-900 py-3 text-sm font-medium text-white"
                        onClick={() => void handleSubmit()}
                    >
                        Submit
                    </button>
                </div>
            </div>
        </div>
    );
}
