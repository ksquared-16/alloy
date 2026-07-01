import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { parseInquirySummaryTaskPreview } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";

export type LegacyDrawerOpenShadowSnapshot = {
    opportunity_id: string;
    layout_mode: "workflow_v1" | "classic" | "unknown";
    header_action_keys: string[];
    status_key: string | null;
    status_display: string | null;
    paint_record_surface: string | null;
    inquiry_children_count: number;
    tasks_open_count: number;
    reminders_next_follow_up_iso: string | null;
};

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function nextFollowUpFromRecord(record: Record<string, unknown>): string | null {
    const top = record.next_follow_up_at;
    if (typeof top === "string" && top.trim()) return top.trim();
    const md = record.metadata;
    if (md && typeof md === "object") {
        const nested = (md as { next_follow_up_at?: unknown }).next_follow_up_at;
        if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
    return null;
}

function opportunityStatusKey(record: Record<string, unknown>): string | null {
    const sk = record.status_key;
    if (sk != null && String(sk).trim()) return String(sk).trim();
    const legacy = record.status;
    if (legacy != null && String(legacy).trim()) return String(legacy).trim();
    return null;
}

/** Structural snapshot from composed-open preload — no additional fetches. */
export function assembleLegacyDrawerOpenShadowSnapshot(
    preload: OpportunityDrawerOpenPreload
): LegacyDrawerOpenShadowSnapshot {
    const paint = (preload.fullEntity ?? preload.primaryEntity) as Record<string, unknown>;
    const layoutModeRaw = preload.bootstrap.record_layout?.inquiry_drawer_mode;
    const layout_mode =
        layoutModeRaw === "workflow_v1" ? "workflow_v1"
        : layoutModeRaw === "classic" ? "classic"
        : "unknown";

    const taskPreview = parseInquirySummaryTaskPreview(paint);
    const header_action_keys = (preload.headerActions.header ?? [])
        .map((a) => a.key)
        .filter(Boolean)
        .sort();

    return {
        opportunity_id: preload.opportunityId,
        layout_mode,
        header_action_keys,
        status_key: opportunityStatusKey(paint),
        status_display: trimOrNull(paint._status_display),
        paint_record_surface: trimOrNull(paint._record_surface),
        inquiry_children_count: Array.isArray(paint._inquiry_children) ? paint._inquiry_children.length : 0,
        tasks_open_count: taskPreview?.open_count ?? 0,
        reminders_next_follow_up_iso: nextFollowUpFromRecord(paint),
    };
}
