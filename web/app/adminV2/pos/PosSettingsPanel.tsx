"use client";

/**
 * POS → Rules / Settings (prototype).
 *
 * POS configuration lives here. The first real rule is which Sources are
 * Processing-connected (a form is POS-connected when its metadata marks it so —
 * `isPosConnectedSurface` / `pos_connected`). This panel reads the REAL forms
 * list to show current connection state; editing rules lands in a later pass.
 */

import { useCallback, useEffect, useState } from "react";

interface FormRow {
    id: string;
    key: string;
    name: string | null;
    metadata?: Record<string, unknown>;
}

export default function PosSettingsPanel() {
    const [forms, setForms] = useState<FormRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/forms", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: FormRow[] };
            setForms(body.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setForms(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const connected = (forms ?? []).filter((f) => f.metadata?.pos_connected === true);

    return (
        <div className="h-full overflow-y-auto bg-[#f7f6f3] p-4">
            <div className="mb-4">
                <h3 className="text-sm font-semibold text-stone-900">Rules &amp; settings</h3>
                <p className="mt-0.5 text-xs text-stone-500">
                    Control how information becomes work. Today: which sources open Processing cases.
                </p>
            </div>

            <section className="mb-4 rounded-xl border border-stone-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Processing-connected sources</span>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Read-only prototype</span>
                </div>
                {loading ? (
                    <div className="h-16 animate-pulse rounded-md bg-stone-100" />
                ) : error ? (
                    <div className="text-xs text-amber-700">
                        Couldn’t load ({error}).{" "}
                        <button type="button" onClick={() => void load()} className="font-medium underline">
                            Retry
                        </button>
                    </div>
                ) : connected.length === 0 ? (
                    <p className="text-[12px] text-stone-500">
                        No sources are Processing-connected yet. Enable a form to start opening cases on submission.
                    </p>
                ) : (
                    <ul className="space-y-1.5">
                        {connected.map((f) => (
                            <li key={f.id} className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50/60 px-2.5 py-1.5">
                                <span className="truncate text-[12px] font-medium text-stone-800">{f.name || f.key}</span>
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Connected</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <div className="grid gap-2 sm:grid-cols-2">
                {["Outcome recipes", "Match thresholds", "Source routing", "Imports"].map((r) => (
                    <div key={r} className="rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-3 text-xs text-stone-500">
                        {r}
                        <div className="mt-0.5 text-[10px] text-stone-400">Coming later</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
