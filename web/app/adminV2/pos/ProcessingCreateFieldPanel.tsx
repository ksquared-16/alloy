"use client";

import { useEffect, useState } from "react";
import type { FormField, FormFieldSource } from "@/lib/forms/schema";
import { planCreateFieldFromSource, suggestedFieldTypeForFormField } from "@/lib/pos/formDraft/createFieldFromSource";

/**
 * MAKING A DESTINATION THAT DOES NOT EXIST YET, WITHOUT LEAVING THE QUESTION.
 *
 * This lived only in the imported-form studio, so a hand-built form could map a question to an
 * existing field but never create the one it needed. It is the shared inspector's now: one panel, one
 * canonical configuration API (`/api/admin/field-definitions`), for both Studio paths.
 *
 * Two steps, in order: create the field, then hand its destination back to the caller to store on the
 * question. If creation fails nothing is mapped, so a question never points at a field that does not
 * exist. A 409 means the field already exists on that record — which is the destination asked for.
 */
export async function createFieldDefinitionForQuestion(input: {
    readonly field: FormField;
    readonly name: string;
    readonly entityType: string;
}): Promise<{ ok: true; destination: FormFieldSource } | { ok: false; error: string }> {
    const options = ((input.field as { static_options?: Array<{ label: string }> }).static_options ?? []).map((o) => o.label);
    const plan = planCreateFieldFromSource({
        label: input.name,
        entityType: input.entityType,
        fieldType: suggestedFieldTypeForFormField(input.field),
        ...(options.length ? { options } : {}),
    });
    if (!plan.ok) {
        return {
            ok: false,
            error:
                plan.reason === "unusable_name"
                    ? "Give the field a name with some letters or numbers in it."
                    : "Alloy cannot store that answer type yet.",
        };
    }
    try {
        const res = await fetch("/api/admin/field-definitions", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(plan.request),
        });
        if (!res.ok && res.status !== 409) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            return { ok: false, error: body.error || `Couldn't create that field (${res.status})` };
        }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Couldn't create that field." };
    }
    return { ok: true, destination: plan.choice.destination };
}

export default function ProcessingCreateFieldPanel({
    field,
    onCreated,
}: {
    field: FormField;
    /** Store the new destination on the question — the caller's schema mutation. */
    onCreated: (destination: FormFieldSource) => void;
}) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState(field.label);
    const [entity, setEntity] = useState("customer_member");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        setName(field.label);
        setOpen(false);
        setError(null);
    }, [field.id, field.label]);

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-qa-create-field="open"
                className="text-[11.5px] font-medium text-alloy-bend-pine underline underline-offset-2"
            >
                + Create field
            </button>
        );
    }
    return (
        <div className="space-y-2 rounded-md border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.03] p-2" data-qa-create-field-panel="true">
            <label className="block text-[11px] text-alloy-midnight/70">
                Call it
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-qa-create-field-name="true"
                    className="mt-0.5 w-full rounded-md border border-alloy-midnight/15 px-2 py-1 text-[12px]"
                />
            </label>
            <label className="block text-[11px] text-alloy-midnight/70">
                Keep it on
                <select
                    value={entity}
                    onChange={(e) => setEntity(e.target.value)}
                    data-qa-create-field-entity="true"
                    className="mt-0.5 w-full rounded-md border border-alloy-midnight/15 px-2 py-1 text-[12px]"
                >
                    <option value="customer_member">The child</option>
                    <option value="person">A parent or guardian</option>
                    <option value="customer">The household</option>
                </select>
            </label>
            {error ? <p className="text-[11px] text-alloy-ember">{error}</p> : null}
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={busy || !name.trim()}
                    onClick={async () => {
                        setBusy(true);
                        setError(null);
                        const result = await createFieldDefinitionForQuestion({ field, name: name.trim(), entityType: entity });
                        setBusy(false);
                        if (!result.ok) {
                            setError(result.error);
                            return;
                        }
                        setOpen(false);
                        onCreated(result.destination);
                    }}
                    data-qa-create-field="submit"
                    className="min-h-[30px] rounded-md bg-alloy-bend-pine px-2.5 text-[12px] font-medium text-white disabled:opacity-50"
                >
                    {busy ? "Creating…" : "Create and map"}
                </button>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="min-h-[30px] rounded-md border border-alloy-midnight/15 px-2.5 text-[12px] text-alloy-midnight/70"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
