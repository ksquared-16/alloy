"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import { activitySummaryLine, type ActivityItem } from "@/lib/adminV2/aiActivity/activityTypes";
import AiActivityDetailModal from "./AiActivityDetailModal";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";

const REFRESH_EVENT = "adminv2-ai-activity-refresh";

/** Reserved strip height — one header row + one activity line (Card 19). */
const STRIP_MIN_HEIGHT_PX = 52;

export function dispatchAiActivityRefresh(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
    }
}

const STRIP_MAX = 3;

type StripPhase = "loading" | "ready" | "empty" | "unavailable";

function stripShell(children: ReactNode) {
    return (
        <div
            className="mb-1 rounded-t-lg border border-b-0 px-2 py-1.5"
            style={{
                borderColor: derived.border,
                backgroundColor: derived.inspectorCommandRailWash,
                minHeight: `${STRIP_MIN_HEIGHT_PX}px`,
            }}
            data-recent-operational-activity-strip="true"
        >
            {children}
        </div>
    );
}

export default function RecentAiActionsStrip() {
    const [items, setItems] = useState<ActivityItem[]>([]);
    const [phase, setPhase] = useState<StripPhase>("loading");
    const [detail, setDetail] = useState<ActivityItem | null>(null);

    const load = useCallback(async (opts?: { soft?: boolean }) => {
        if (!opts?.soft) setPhase((p) => (p === "ready" || p === "empty" ? p : "loading"));
        try {
            const res = await fetch(`/api/admin/agent/v1/activity?limit=${STRIP_MAX}`, { credentials: "include" });
            const data = (await res.json()) as { ok?: boolean; items?: ActivityItem[] };
            if (!res.ok) {
                setItems([]);
                setPhase("unavailable");
                return;
            }
            const list = Array.isArray(data.items) ? data.items.slice(0, STRIP_MAX) : [];
            setItems(list);
            setPhase(list.length > 0 ? "ready" : "empty");
        } catch {
            setItems([]);
            setPhase("unavailable");
        }
    }, []);

    useEffect(() => {
        return runWhenAdminV2PrimarySurfaceReady(() => load(), "agent_activity_strip");
    }, [load]);

    useEffect(() => {
        const onRefresh = () => void load({ soft: true });
        window.addEventListener(REFRESH_EVENT, onRefresh);
        return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
    }, [load]);

    const header = (
        <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: derived.inspectorSectionMuted }}>
                Recent operational activity
            </span>
            <Link
                href="/adminV2/ai-activity"
                prefetch={shouldDisableAdminV2LinkPrefetch("/adminV2/ai-activity") ? false : undefined}
                className="text-[10px] font-medium underline-offset-2 hover:underline"
                style={{ color: derived.textSecondary }}
            >
                Full log
            </Link>
        </div>
    );

    if (phase === "loading") {
        return stripShell(
            <>
                {header}
                <p className="text-[10px] leading-snug" style={{ color: derived.textSecondary }} aria-live="polite">
                    Loading activity…
                </p>
            </>
        );
    }

    if (phase === "unavailable") {
        return stripShell(
            <>
                {header}
                <p className="text-[10px] leading-snug" style={{ color: derived.textSecondary }}>
                    Activity log unavailable.{" "}
                    <button
                        type="button"
                        className="font-semibold underline-offset-2 hover:underline"
                        style={{ color: brand.secondary }}
                        onClick={() => void load()}
                    >
                        Retry
                    </button>
                </p>
            </>
        );
    }

    if (phase === "empty") {
        return stripShell(
            <>
                {header}
                <p className="text-[10px] leading-snug text-alloy-midnight/45">No recent operational activity.</p>
            </>
        );
    }

    return (
        <>
            {stripShell(
                <>
                    {header}
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
                </>
            )}
            <AiActivityDetailModal item={detail} open={detail != null} onClose={() => setDetail(null)} />
        </>
    );
}
