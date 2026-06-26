"use client";

/**
 * POS → Source rules.
 *
 * POS configuration lives here. The first real rule is which sources open intake
 * (a form is intake-connected when its metadata marks it so — `isPosConnectedSurface`
 * / `pos_connected`). This panel reads the REAL forms list to show current state;
 * editing rules lands in a later pass. No fabricated "coming soon" actions.
 */

import { useCallback, useEffect, useState } from "react";
import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";
import PosPanel from "./PosPanel";

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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader
                title="Source rules"
                subtitle="Control how incoming information becomes work. Today: which sources open intake."
            />
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <PosPanel
                    eyebrow="Sources that open intake"
                    right={<span className="text-[10px] font-medium text-alloy-midnight/40">Read-only</span>}
                >
                    {loading ? (
                        <div className="h-16 animate-pulse rounded-md bg-alloy-stone/60" />
                    ) : error ? (
                        <div className="text-[12px] text-amber-700">
                            Couldn’t load ({error}).{" "}
                            <button type="button" onClick={() => void load()} className="font-medium underline">
                                Retry
                            </button>
                        </div>
                    ) : connected.length === 0 ? (
                        <p className="text-[12px] text-alloy-midnight/55">
                            No sources open intake yet. Enable a form to start opening intake when it’s submitted.
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {connected.map((f) => (
                                <li
                                    key={f.id}
                                    className="flex items-center justify-between rounded-md border border-alloy-stone/20 bg-white px-2.5 py-1.5"
                                >
                                    <span className="truncate text-[12.5px] font-medium text-alloy-midnight">{f.name || f.key}</span>
                                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                        Connected
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </PosPanel>

                <p className="mt-3 text-[11px] leading-relaxed text-alloy-midnight/45">
                    More source rules — routing, matching, and imports — will arrive here as they’re built.
                </p>
            </div>
        </div>
    );
}
