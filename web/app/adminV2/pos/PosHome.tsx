"use client";

/**
 * Processing Home — the Processing module landing.
 *
 * Leads with operator value: what needs you, what you can build next, and the
 * assets you've defined. Reuses the REAL intake queue API
 * (`GET /api/admin/processing/queue`) — no new backend. It does not explain POS as
 * software; it surfaces work and assets. CTAs route to other POS sections.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, FolderUp, Inbox, Layers, PackageOpen, Plus, RefreshCw } from "lucide-react";
import type { ProcessingCaseQueueRow } from "@/lib/pos/processingCase/readModel/types";
import type { QueueRecommendationSummary } from "@/lib/pos/processingCase/recommendation/recommendationSummary";
import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";
import { WS_ACTION_PRIMARY, WS_ACTION_SECONDARY, WS_EYEBROW } from "@/components/workspace/workspaceTokens";
import RecommendationBadge from "./RecommendationBadge";
import PosPanel from "./PosPanel";
import { POS_SOURCE_KIND_LABELS, type PosSection } from "./posSections";

interface QueueResponse {
    data: {
        rows: ProcessingCaseQueueRow[];
        next_cursor: unknown;
        counts: Record<string, number>;
        recommendations?: Record<string, QueueRecommendationSummary>;
    };
}

function age(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PosHome({
    onNavigate,
    onOpenCase,
}: {
    onNavigate: (section: PosSection) => void;
    onOpenCase: (caseId: string) => void;
}) {
    const [rows, setRows] = useState<ProcessingCaseQueueRow[]>([]);
    const [recommendations, setRecommendations] = useState<Record<string, QueueRecommendationSummary>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/processing/queue", { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as QueueResponse;
            setRows(body.data?.rows ?? []);
            setRecommendations(body.data?.recommendations ?? {});
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setRows([]);
            setRecommendations({});
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const recent = useMemo(() => rows.slice(0, 6), [rows]);
    const needsYou = useMemo(
        () => rows.filter((r) => r.status === "needs_review" || r.status === "needs_resolution").slice(0, 5),
        [rows]
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader
                title="Home"
                subtitle="What needs you, and what you can build next."
                right={
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/20 px-1.5 py-0.5 text-[11px] font-medium text-alloy-midnight/55 hover:border-alloy-stone/35"
                    >
                        <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
                    </button>
                }
            />

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {error ? (
                    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] text-amber-800">
                        Couldn’t load live data ({error}).{" "}
                        <button type="button" onClick={() => void load()} className="font-medium underline">
                            Retry
                        </button>
                    </div>
                ) : null}

                {/* Needs you — lead with work */}
                <PosPanel
                    eyebrow="Needs you"
                    right={
                        needsYou.length > 0 ? (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                {needsYou.length} waiting
                            </span>
                        ) : null
                    }
                    className="mb-4"
                >
                    {needsYou.length === 0 ? (
                        <p className="text-[12px] text-alloy-midnight/45">
                            {loading ? "Checking…" : "Nothing needs you right now."}
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {needsYou.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenCase(r.id)}
                                        className="flex w-full items-center justify-between gap-2 rounded-md border border-alloy-stone/20 bg-white px-2.5 py-2 text-left hover:border-alloy-juniper/40 hover:bg-alloy-juniper/[0.04]"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-[12.5px] font-medium text-alloy-midnight">
                                                {r.sourceDisplay?.label ?? POS_SOURCE_KIND_LABELS[r.primarySource?.kind ?? ""] ?? "Incoming item"}
                                            </span>
                                            <span className="mt-0.5 flex items-center gap-1.5">
                                                {recommendations[r.id] ? (
                                                    <RecommendationBadge rec={recommendations[r.id]!} />
                                                ) : (
                                                    <span className="block truncate text-[11px] text-alloy-midnight/50">
                                                        {POS_SOURCE_KIND_LABELS[r.primarySource?.kind ?? ""] ?? "Source"}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                        <span className="shrink-0 rounded bg-alloy-juniper/10 px-1.5 py-0.5 text-[10px] font-semibold text-alloy-juniper">
                                            Open →
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </PosPanel>

                {/* Create — what you can build next */}
                <div className="mb-4">
                    <div className={`mb-1.5 ${WS_EYEBROW}`}>Create</div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => onNavigate("packets")} className={`${WS_ACTION_PRIMARY} inline-flex items-center gap-1.5`}>
                            <Plus className="h-3.5 w-3.5" aria-hidden /> Build packet
                        </button>
                        <button type="button" onClick={() => onNavigate("documents")} className={`${WS_ACTION_SECONDARY} inline-flex items-center gap-1.5`}>
                            <FolderUp className="h-3.5 w-3.5" aria-hidden /> Add document
                        </button>
                        <button type="button" onClick={() => onNavigate("forms")} className={`${WS_ACTION_SECONDARY} inline-flex items-center gap-1.5`}>
                            <Layers className="h-3.5 w-3.5" aria-hidden /> Manage forms
                        </button>
                        <button type="button" onClick={() => onNavigate("processing")} className={`${WS_ACTION_SECONDARY} inline-flex items-center gap-1.5`}>
                            <Inbox className="h-3.5 w-3.5" aria-hidden /> Open incoming
                        </button>
                    </div>
                </div>

                {/* Your studio — the assets you've defined */}
                <PosPanel eyebrow="Your studio" accent={false} className="mb-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                        <StudioCard icon={<Layers className="h-4 w-4" />} title="Forms" body="Reusable forms you've built." onClick={() => onNavigate("forms")} />
                        <StudioCard icon={<PackageOpen className="h-4 w-4" />} title="Packets" body="Enrollment experiences to send." onClick={() => onNavigate("packets")} />
                        <StudioCard icon={<FileText className="h-4 w-4" />} title="Documents" body="Turn paperwork into forms." onClick={() => onNavigate("documents")} />
                    </div>
                </PosPanel>

                {/* Recently arrived */}
                <PosPanel eyebrow="Recently arrived" accent={false}>
                    {recent.length === 0 ? (
                        <p className="text-[12px] text-alloy-midnight/45">
                            {loading ? "Loading…" : "Nothing has arrived yet. Connect a source to begin."}
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {recent.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenCase(r.id)}
                                        className="flex w-full items-center justify-between gap-2 rounded-md border border-alloy-stone/20 bg-white px-2.5 py-2 text-left hover:border-alloy-juniper/40 hover:bg-alloy-juniper/[0.04]"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <FileText className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/35" aria-hidden />
                                            <span className="min-w-0">
                                                <span className="block truncate text-[12.5px] font-medium text-alloy-midnight">
                                                    {r.sourceDisplay?.label ?? "Untitled source"}
                                                </span>
                                                <span className="block truncate text-[11px] text-alloy-midnight/50">
                                                    {POS_SOURCE_KIND_LABELS[r.primarySource?.kind ?? ""] ?? "Source"}
                                                    {r.sourceDisplay?.channel ? ` · ${r.sourceDisplay.channel}` : ""}
                                                </span>
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-[10.5px] text-alloy-midnight/40">
                                            {age(r.sourceDisplay?.receivedAt ?? r.createdAt)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </PosPanel>
            </div>
        </div>
    );
}

function StudioCard({
    icon,
    title,
    body,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    body: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-lg border border-alloy-stone/20 bg-white p-3 text-left transition-colors hover:border-alloy-juniper/40 hover:bg-alloy-juniper/[0.04]"
        >
            <div className="flex items-center gap-1.5 text-alloy-midnight">
                <span className="text-alloy-juniper">{icon}</span>
                <span className="text-[13px] font-semibold">{title}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/50">{body}</p>
        </button>
    );
}
