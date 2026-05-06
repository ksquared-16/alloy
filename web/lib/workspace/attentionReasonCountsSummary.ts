import { DEFAULT_OPPORTUNITY_ATTENTION_LABELS } from "@/lib/opportunities/opportunityAttentionConfig";
import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/opportunityAttentionResolver";
import { attentionReasonLabel, type OpportunityAttentionReason } from "@/lib/workspace/opportunityAttentionRules";

/** Authoritative histogram row — produced server-side alongside attention queue items. */
export type AttentionReasonCountSummary = {
    reason_key: string;
    label: string;
    count: number;
};

function displayLabelForReasonKey(reason_key: string, labelRaw: string): string {
    if (labelRaw.trim()) return labelRaw.trim();
    if (reason_key in DEFAULT_OPPORTUNITY_ATTENTION_LABELS) {
        return DEFAULT_OPPORTUNITY_ATTENTION_LABELS[reason_key as OpportunityAttentionReasonCode];
    }
    const knownLegacy: readonly OpportunityAttentionReason[] = [
        "stale_new_inquiry",
        "stale_qualified",
        "stale_quote_followup",
        "missing_quote_after_execution",
    ];
    if ((knownLegacy as readonly string[]).includes(reason_key)) {
        return attentionReasonLabel(reason_key as OpportunityAttentionReason);
    }
    return reason_key.trim() || "Needs attention";
}

/** Histogram by primary attention reason code (resolver `primary_reason.code`). */
export function summarizeAttentionReasonCounts(
    pairs: ReadonlyArray<{ reason_key: string; label: string }>
): AttentionReasonCountSummary[] {
    const m = new Map<string, number>();
    const labelByKey = new Map<string, string>();
    for (const p of pairs) {
        const k = p.reason_key.trim();
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
        if (!labelByKey.has(k)) labelByKey.set(k, p.label.trim());
    }
    const rows: AttentionReasonCountSummary[] = [...m.entries()].map(([reason_key, count]) => ({
        reason_key,
        label: displayLabelForReasonKey(reason_key, labelByKey.get(reason_key) ?? ""),
        count,
    }));
    rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return rows;
}

/** Parse JSON array from attention-queue API responses (clients). */
export function parseAttentionReasonCountsPayload(raw: unknown): AttentionReasonCountSummary[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: AttentionReasonCountSummary[] = [];
    for (const row of raw) {
        if (row == null || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const reason_key = typeof r.reason_key === "string" ? r.reason_key.trim() : "";
        const labelRaw = typeof r.label === "string" ? r.label.trim() : "";
        const count =
            typeof r.count === "number" && Number.isFinite(r.count) ? Math.max(0, Math.floor(r.count)) : 0;
        if (!reason_key || count <= 0) continue;
        out.push({
            reason_key,
            label: displayLabelForReasonKey(reason_key, labelRaw),
            count,
        });
    }
    return out.length ? out : undefined;
}
