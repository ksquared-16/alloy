"use client";

/**
 * POS-FP-UI — Sources panel (POS-native).
 *
 * The "Sources" tab of the POS workspace. Sources are where information enters
 * Alloy and feed Processing. Reuses the existing `GET /api/admin/forms` list (no
 * new backend) and presents forms as POS source cards with their Processing-enabled
 * / published / active status. "Open form" deep-links to the existing form editor
 * (`/admin/forms/<id>`) — the builder is not rebuilt here.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";

interface FormRow {
    id: string;
    key: string;
    name: string | null;
    is_active: boolean;
    metadata?: Record<string, unknown>;
    has_published_version?: boolean;
}

function Badge({ tone, children }: { tone: "emerald" | "amber" | "stone"; children: ReactNode }) {
    const cls =
        tone === "emerald"
            ? "bg-emerald-50 text-emerald-800"
            : tone === "amber"
              ? "bg-amber-50 text-amber-800"
              : "bg-stone-100 text-stone-600";
    return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{children}</span>;
}

function Eyebrow({ children, right }: { children: ReactNode; right?: ReactNode }) {
    return (
        <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{children}</span>
            {right}
        </div>
    );
}

export default function SourcesPanel() {
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
            setError(e instanceof Error ? e.message : "Failed to load forms");
            setForms(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="h-full overflow-y-auto bg-[#f7f6f3] p-4">
            <div className="mb-4">
                <h3 className="text-sm font-medium text-stone-900">Sources</h3>
                <p className="mt-0.5 text-xs text-stone-500">
                    Where information enters Alloy. A connected source opens a Processing case on each new submission.
                </p>
            </div>

            <section className="mb-6">
                <Eyebrow
                    right={
                        <a href="/admin/forms" className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800">
                            Manage all ↗
                        </a>
                    }
                >
                    Forms
                </Eyebrow>

                {loading ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-[88px] animate-pulse rounded-lg bg-stone-100" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <div className="font-medium">Couldn’t load forms</div>
                        <div className="mt-0.5 text-xs text-amber-700">{error}</div>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="mt-2 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        >
                            Retry
                        </button>
                    </div>
                ) : forms && forms.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-5 text-center text-sm text-stone-500">
                        No forms yet.{" "}
                        <a href="/admin/forms" className="font-medium text-emerald-700">
                            Create one ↗
                        </a>
                    </div>
                ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {(forms ?? []).map((f) => {
                            const posConnected = f.metadata?.pos_connected === true;
                            return (
                                <li key={f.id} className="rounded-lg border border-stone-200 bg-white p-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-stone-900">{f.name || f.key}</div>
                                        <div className="truncate text-[11px] text-stone-400">{f.key}</div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1">
                                        {posConnected ? (
                                            <Badge tone="emerald">Processing enabled</Badge>
                                        ) : (
                                            <Badge tone="stone">Not connected</Badge>
                                        )}
                                        {f.has_published_version ? <Badge tone="stone">Published</Badge> : <Badge tone="amber">Draft</Badge>}
                                        {!f.is_active ? <Badge tone="stone">Inactive</Badge> : null}
                                    </div>
                                    <a
                                        href={`/admin/forms/${f.id}`}
                                        className="mt-2 inline-block text-[11px] font-medium text-emerald-700 hover:text-emerald-800"
                                    >
                                        Open form ↗
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <section className="mb-6">
                <Eyebrow>Packets</Eyebrow>
                <a
                    href="/admin/forms/packets"
                    className="block rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700 hover:bg-stone-50"
                >
                    Multi-step packet definitions ↗
                </a>
            </section>

            <section>
                <Eyebrow>More sources</Eyebrow>
                <div className="grid gap-2 sm:grid-cols-3">
                    {["Documents", "Imports", "Email attachments"].map((s) => (
                        <div
                            key={s}
                            className="rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-3 text-xs text-stone-500"
                        >
                            {s}
                            <div className="mt-0.5 text-[10px] text-stone-400">Coming later</div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
