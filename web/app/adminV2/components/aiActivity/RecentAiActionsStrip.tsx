"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import { activitySummaryLine, type ActivityItem } from "@/lib/adminV2/aiActivity/activityTypes";
import AiActivityDetailModal from "./AiActivityDetailModal";

const REFRESH_EVENT = "adminv2-ai-activity-refresh";

export function dispatchAiActivityRefresh(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
    }
}

const STRIP_MAX = 3;

export default function RecentAiActionsStrip() {
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [hidden, setHidden] = useState(false);
    const [detail, setDetail] = useState<ActivityItem | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/agent/v1/activity?limit=${STRIP_MAX}`, { credentials: "include" });
            const data = (await res.json()) as { ok?: boolean; items?: ActivityItem[] };
            if (!res.ok) {
                setHidden(true);
                setItems([]);
                return;
            }
            setHidden(false);
            setItems(Array.isArray(data.items) ? data.items.slice(0, STRIP_MAX) : []);
        } catch {
            setHidden(true);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const onRefresh = () => void load();
        window.addEventListener(REFRESH_EVENT, onRefresh);
        return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
    }, [load]);

    if (hidden) {
        return null;
    }

    if (loading) {
        return (
            <div className="mb-1 px-1 py-1 text-[10px]" style={{ color: derived.textSecondary }}>
                Recent AI actions…
            </div>
        );
    }

    if (items.length === 0) {
        return null;
    }

    return (
        <>
            <div
                className="mb-1 rounded-t-lg border border-b-0 px-2 py-1.5"
                style={{
                    borderColor: derived.border,
                    backgroundColor: derived.inspectorCommandRailWash,
                }}
            >
                <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: derived.inspectorSectionMuted }}>
                        Recent AI actions
                    </span>
                    <Link
                        href="/admin/v2/ai-activity"
                        className="text-[10px] font-medium underline-offset-2 hover:underline"
                        style={{ color: derived.textSecondary }}
                    >
                        Full log
                    </Link>
                </div>
                <ul className="space-y-0.5">
                    {items.map((it) => (
                        <li key={it.id}>
                            <button
                                type="button"
                                onClick={() => setDetail(it)}
                                className="w-full rounded px-1.5 py-0.5 text-left text-[11px] leading-snug transition-colors hover:bg-white/80"
                                style={{ color: neutral.textPrimary }}
                                title={activitySummaryLine(it)}
                            >
                                <span className="line-clamp-1">{activitySummaryLine(it)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
            <AiActivityDetailModal item={detail} open={detail != null} onClose={() => setDetail(null)} />
        </>
    );
}
