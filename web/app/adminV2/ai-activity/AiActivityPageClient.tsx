"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { neutral, derived, brand, palette } from "@/styles/tokens/colors";
import type { ActivityItem } from "@/lib/adminV2/aiActivity/activityTypes";
import { activityStatusWord, formatActivityTs } from "@/lib/adminV2/aiActivity/activityTypes";
import AiActivityDetailPanel from "@/app/adminV2/components/aiActivity/AiActivityDetailPanel";

export default function AiActivityPageClient() {
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [techOpen, setTechOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/agent/v1/activity?limit=50", { credentials: "include" });
            const data = (await res.json()) as { ok?: boolean; items?: ActivityItem[]; message?: string; error?: string };
            if (!res.ok) {
                setError(data.message ?? data.error ?? `HTTP ${res.status}`);
                setItems([]);
                return;
            }
            setItems(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Request failed");
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

    useEffect(() => {
        setTechOpen(false);
    }, [selectedId]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header
                className="shrink-0 border-b px-4 py-3"
                style={{ borderColor: derived.border, backgroundColor: neutral.surface }}
            >
                <h1 className="text-lg font-semibold tracking-tight" style={{ color: neutral.textPrimary }}>
                    AI activity <span className="text-xs font-normal opacity-70">(full log)</span>
                </h1>
                <p className="mt-0.5 text-xs" style={{ color: derived.textSecondary }}>
                    Deep link for audit history. Day-to-day context lives in <strong>Recent AI actions</strong> above the
                    command bar.
                </p>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
                <section
                    className="flex min-h-[40%] min-w-0 flex-1 flex-col border-b lg:min-h-0 lg:max-w-md lg:border-b-0 lg:border-r"
                    style={{ borderColor: derived.border, backgroundColor: neutral.background }}
                >
                    <div
                        className="shrink-0 px-3 py-2 text-[10px] font-bold tracking-wider"
                        style={{ color: derived.inspectorSectionMuted }}
                    >
                        Recent
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                        {loading ? (
                            <p className="px-2 py-4 text-sm" style={{ color: derived.textSecondary }}>
                                Loading…
                            </p>
                        ) : error ? (
                            <p className="px-2 py-4 text-sm" style={{ color: palette.juniperEmber }}>
                                {error}
                            </p>
                        ) : items.length === 0 ? (
                            <p className="px-2 py-4 text-sm" style={{ color: derived.textSecondary }}>
                                No apply actions yet. Use the command bar to preview and apply an overview layout change.
                            </p>
                        ) : (
                            <ul className="space-y-1">
                                {items.map((it) => {
                                    const active = it.id === selectedId;
                                    return (
                                        <li key={it.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(it.id)}
                                                className="w-full rounded-lg border px-2.5 py-2 text-left text-xs transition-colors"
                                                style={{
                                                    borderColor: active ? brand.secondary : derived.border,
                                                    backgroundColor: active ? derived.kpiBandBusinessWash : neutral.surface,
                                                    color: neutral.textPrimary,
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium">{activityStatusWord(it.status)}</span>
                                                    <span style={{ color: derived.textSecondary }}>
                                                        {formatActivityTs(it.created_at)}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 line-clamp-2" style={{ color: derived.textSecondary }}>
                                                    {it.entity_type}/{it.surface} · {it.intent_type}
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </section>

                <section className="flex min-h-0 flex-1 flex-col" style={{ backgroundColor: neutral.surface }}>
                    {!selected ? (
                        <div
                            className="flex flex-1 items-center justify-center p-6 text-sm"
                            style={{ color: derived.textSecondary }}
                        >
                            Select an activity to inspect details.
                        </div>
                    ) : (
                        <AiActivityDetailPanel
                            selected={selected}
                            techOpen={techOpen}
                            onToggleTech={() => setTechOpen((o) => !o)}
                            footer={
                                <p className="text-[10px]" style={{ color: derived.textSecondary }}>
                                    <Link
                                        href="/adminV2/workspace"
                                        className="font-medium underline-offset-2 hover:underline"
                                        style={{ color: brand.secondary }}
                                    >
                                        Back to workspace
                                    </Link>
                                </p>
                            }
                        />
                    )}
                </section>
            </div>
        </div>
    );
}
