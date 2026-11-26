"use client";

/**
 * PROCESSING "EDIT" — correct the proposal before approving, beside what was submitted.
 *
 * Reads and writes `/api/admin/processing/cases/[caseId]/proposed-values`. The submission is evidence
 * and is never changed: each corrected field shows "Submitted: …" under its new value, and approve
 * commits the corrected values through the one plan/commit path.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import PhoneInput from "@/components/ui/PhoneInput";
import { formatPhoneDisplay } from "@/lib/phone/phonePresentation";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";

type Field = {
    key: string;
    label: string;
    type: "text" | "email" | "phone" | "date" | "location";
    required: boolean;
    submitted: string | null;
    current: string | null;
    edited: { by: string | null; at: string } | null;
};
type Subject = { ref: string; role: string; title: string; fields: Field[] };
export type ProposedValuesView = { caseId: string; editable: boolean; subjects: Subject[]; locations: Array<{ id: string; name: string }> };

export function useProposedValues(caseId: string | null, tick: number) {
    const [data, setData] = useState<ProposedValuesView | null>(null);
    useEffect(() => {
        if (!caseId) return;
        let live = true;
        void fetch(`/api/admin/processing/cases/${caseId}/proposed-values`, { credentials: "same-origin" })
            .then(async (r) => (r.ok ? (((await r.json()) as { data?: ProposedValuesView }).data ?? null) : null))
            .catch(() => null)
            .then((d) => live && setData(d));
        return () => {
            live = false;
        };
    }, [caseId, tick]);
    return data;
}

function display(field: Pick<Field, "type">, value: string | null, locations: ProposedValuesView["locations"]): string {
    if (!value) return "—";
    if (field.type === "phone") return formatPhoneDisplay(value);
    if (field.type === "date") return formatDisplayDate(value);
    if (field.type === "location") return locations.find((l) => l.id === value)?.name ?? "Unknown location";
    return value;
}

/** "Corrected before approval" — what the operator changed, against what was submitted. */
export function CorrectionsSummary({ view }: { view: ProposedValuesView | null }) {
    const rows = (view?.subjects ?? []).flatMap((s) => s.fields.filter((f) => f.edited).map((f) => ({ s, f })));
    if (!view || rows.length === 0) return null;
    return (
        <div className="rounded-md border border-alloy-stone/20 bg-white px-2.5 py-2 text-[11.5px]" data-processing-corrections="summary">
            <div className="font-semibold text-alloy-midnight">Corrected before approval</div>
            <ul className="mt-1 space-y-0.5">
                {rows.map(({ s, f }) => (
                    <li key={`${s.ref}:${f.key}`} className="text-alloy-midnight/75">
                        {s.title} · {f.label}: <span className="font-medium text-alloy-midnight">{display(f, f.current, view.locations)}</span>
                        <span className="text-alloy-midnight/45"> (submitted {display(f, f.submitted, view.locations)})</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function ProposedValuesEditor({
    caseId,
    view,
    onClose,
    onSaved,
}: {
    caseId: string;
    view: ProposedValuesView;
    onClose: () => void;
    onSaved: () => void;
}) {
    const initial = useMemo(() => {
        const m: Record<string, string> = {};
        for (const s of view.subjects) for (const f of s.fields) m[`${s.ref}::${f.key}`] = f.current ?? "";
        return m;
    }, [view]);
    const [values, setValues] = useState<Record<string, string>>(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = useCallback((k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v })), []);

    const save = useCallback(async () => {
        const edits = Object.entries(values)
            .filter(([k, v]) => (initial[k] ?? "") !== v)
            .map(([k, v]) => {
                const [subject_ref, field] = k.split("::");
                return { subject_ref, field, value: v };
            });
        if (edits.length === 0) {
            onClose();
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/proposed-values`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ edits }),
            });
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) throw new Error(body?.error ?? "The values could not be saved.");
            onSaved();
            onClose();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [caseId, initial, onClose, onSaved, values]);

    const input = "w-full rounded-md border border-alloy-stone/25 px-2 py-1.5 text-[12.5px] text-alloy-midnight";
    return (
        <ProcessingAlloyDialog
            open
            onClose={onClose}
            title="Edit values before approval"
            subtitle="Correct what will be saved. The family's submission is kept as it was sent."
            testId="processing-edit-values"
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void save()}
                        disabled={busy}
                        data-testid="processing-edit-values-save"
                        className="rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
                    >
                        {busy ? "Saving…" : "Save corrections"}
                    </button>
                </>
            }
        >
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                {view.subjects.map((s) => (
                    <section key={s.ref}>
                        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">{s.title}</h3>
                        <div className="space-y-2">
                            {s.fields.map((f) => {
                                const k = `${s.ref}::${f.key}`;
                                const v = values[k] ?? "";
                                const changed = (f.submitted ?? "") !== v && v !== "";
                                return (
                                    <label key={k} className="block text-[12px] text-alloy-midnight/70">
                                        <span className="mb-0.5 block">{f.label}{f.required ? " *" : ""}</span>
                                        {f.type === "phone" ? (
                                            <PhoneInput className={input} value={v} onChange={(next) => set(k, next)} data-testid={`edit-${f.key}`} />
                                        ) : f.type === "location" ? (
                                            <select className={input} value={v} onChange={(e) => set(k, e.target.value)} data-testid={`edit-${f.key}`}>
                                                <option value="">Choose a location</option>
                                                {view.locations.map((l) => (
                                                    <option key={l.id} value={l.id}>{l.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                className={input}
                                                type={f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                                                value={v}
                                                onChange={(e) => set(k, e.target.value)}
                                                data-testid={`edit-${f.key}`}
                                            />
                                        )}
                                        {changed || f.edited ? (
                                            <span className="mt-0.5 block text-[10.5px] text-alloy-midnight/45">Submitted: {display(f, f.submitted, view.locations)}</span>
                                        ) : null}
                                    </label>
                                );
                            })}
                        </div>
                    </section>
                ))}
                {error ? <p className="text-[12px] text-rose-700" role="alert">{error}</p> : null}
            </div>
        </ProcessingAlloyDialog>
    );
}
