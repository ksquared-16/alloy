"use client";

/**
 * POS Home — the product dashboard that ties POS together.
 *
 * Answers, at a glance: what information entered Alloy, where it came from, what
 * needs review, and what to do next. Reuses the REAL processing queue API
 * (`GET /api/admin/processing/queue`) — no new backend. Recommended actions and
 * recent intake are derived from live cases; CTAs route to other POS sections.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, FolderUp, Inbox, Layers, ListChecks, Plus } from "lucide-react";
import type { ProcessingCaseQueueRow } from "@/lib/pos/processingCase/readModel/types";
import type { QueueRecommendationSummary } from "@/lib/pos/processingCase/recommendation/recommendationSummary";
import RecommendationBadge from "./RecommendationBadge";
import { POS_SOURCE_KIND_LABELS, POS_STATUS_LABELS, type PosSection } from "./posSections";

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

const STAT_ORDER = ["needs_review", "needs_resolution", "processing", "ready", "completed"] as const;

export default function PosHome({
    onNavigate,
    onOpenCase,
}: {
    onNavigate: (section: PosSection) => void;
    onOpenCase: (caseId: string) => void;
}) {
    const [rows, setRows] = useState<ProcessingCaseQueueRow[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
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
            setCounts(body.data?.counts ?? {});
            setRecommendations(body.data?.recommendations ?? {});
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setRows([]);
            setCounts({});
            setRecommendations({});
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const recent = useMemo(() => rows.slice(0, 6), [rows]);
    const needsReview = useMemo(
        () => rows.filter((r) => r.status === "needs_review" || r.status === "needs_resolution").slice(0, 5),
        [rows]
    );

    return (
        <div className="h-full overflow-y-auto bg-white p-4">
            <div className="mb-4">
                <h3 className="text-sm font-semibold text-stone-900">Information entered Alloy</h3>
                <p className="mt-0.5 text-xs text-stone-500">
                    Everything that arrives — forms, packets, documents — lands here. Alloy reads it, proposes what it means, and you approve.
                </p>
            </div>

            {/* At-a-glance stat strip (real counts) */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {STAT_ORDER.map((k) => {
                    const n = counts[k] ?? 0;
                    const attention = (k === "needs_review" || k === "needs_resolution") && n > 0;
                    return (
                        <button
                            key={k}
                            type="button"
                            onClick={() => onNavigate("processing")}
                            className={`rounded-lg border bg-white p-2.5 text-left transition hover:shadow-sm ${
                                attention ? "border-amber-200" : "border-stone-200"
                            }`}
                        >
                            <div className={`text-lg font-semibold ${attention ? "text-amber-700" : "text-stone-900"}`}>
                                {loading ? "·" : n}
                            </div>
                            <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-stone-500">
                                {POS_STATUS_LABELS[k]}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* CTA row */}
            <div className="mb-5 flex flex-wrap gap-2">
                <CtaButton icon={<Plus className="h-3.5 w-3.5" />} label="Create Packet" primary onClick={() => onNavigate("packets")} />
                <CtaButton icon={<FolderUp className="h-3.5 w-3.5" />} label="Upload Document" onClick={() => onNavigate("documents")} />
                <CtaButton icon={<ListChecks className="h-3.5 w-3.5" />} label="Open Processing Queue" onClick={() => onNavigate("processing")} />
                <CtaButton icon={<Layers className="h-3.5 w-3.5" />} label="Manage Sources" onClick={() => onNavigate("forms")} />
            </div>

            {error ? (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Couldn’t load live data ({error}).{" "}
                    <button type="button" onClick={() => void load()} className="font-medium underline">
                        Retry
                    </button>
                </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
                {/* Recommended next actions */}
                <section>
                    <SectionTitle>Recommended next actions</SectionTitle>
                    {needsReview.length === 0 ? (
                        <EmptyCard>
                            {loading ? "Checking…" : "Nothing needs your review right now."}
                        </EmptyCard>
                    ) : (
                        <ul className="space-y-2">
                            {needsReview.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenCase(r.id)}
                                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-2.5 text-left hover:shadow-sm"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium text-stone-900">
                                                Review {r.sourceDisplay?.label ?? POS_SOURCE_KIND_LABELS[r.primarySource?.kind ?? ""] ?? "case"}
                                            </span>
                                            <span className="mt-0.5 flex items-center gap-1.5">
                                                {recommendations[r.id] ? (
                                                    <RecommendationBadge rec={recommendations[r.id]!} />
                                                ) : (
                                                    <span className="block truncate text-[11px] text-stone-500">
                                                        {POS_STATUS_LABELS[r.status]} · {POS_SOURCE_KIND_LABELS[r.primarySource?.kind ?? ""] ?? "Source"}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                        <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                            Approve →
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Recent intake */}
                <section>
                    <SectionTitle>Recent intake</SectionTitle>
                    {recent.length === 0 ? (
                        <EmptyCard>
                            {loading ? "Loading…" : "No information has entered Alloy yet. Connect a source to begin."}
                        </EmptyCard>
                    ) : (
                        <ul className="space-y-2">
                            {recent.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenCase(r.id)}
                                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white p-2.5 text-left hover:shadow-sm"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <FileText className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-stone-900">
                                                    {r.sourceDisplay?.label ?? "Untitled source"}
                                                </span>
                                                <span className="block truncate text-[11px] text-stone-500">
                                                    {POS_SOURCE_KIND_LABELS[r.primarySource?.kind ?? ""] ?? "Source"}
                                                    {r.sourceDisplay?.channel ? ` · ${r.sourceDisplay.channel}` : ""}
                                                </span>
                                                {recommendations[r.id] ? (
                                                    <span className="mt-1 flex">
                                                        <RecommendationBadge rec={recommendations[r.id]!} showConfidence={false} />
                                                    </span>
                                                ) : null}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-[10.5px] text-stone-400">
                                            {age(r.sourceDisplay?.receivedAt ?? r.createdAt)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            {/* How POS fits together (draft cards) */}
            <section className="mt-5">
                <SectionTitle>How it fits together</SectionTitle>
                <div className="grid gap-2 sm:grid-cols-3">
                    <FitCard icon={<Layers className="h-4 w-4" />} title="Sources" body="Forms, packets, documents and more feed Alloy." onClick={() => onNavigate("forms")} />
                    <FitCard icon={<Inbox className="h-4 w-4" />} title="Processing" body="Alloy proposes meaning + action; you approve." onClick={() => onNavigate("processing")} />
                    <FitCard icon={<FileText className="h-4 w-4" />} title="Packets" body="One guided parent journey, many forms behind it." onClick={() => onNavigate("packets")} />
                </div>
            </section>
        </div>
    );
}

function CtaButton({
    icon,
    label,
    onClick,
    primary,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    primary?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                primary
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    : "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            }
        >
            {icon}
            {label}
        </button>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{children}</h4>;
}

function EmptyCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-4 text-center text-xs text-stone-500">
            {children}
        </div>
    );
}

function FitCard({
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
        <button type="button" onClick={onClick} className="rounded-lg border border-stone-200 bg-white p-3 text-left hover:shadow-sm">
            <div className="flex items-center gap-1.5 text-stone-700">
                {icon}
                <span className="text-sm font-medium">{title}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{body}</p>
        </button>
    );
}
