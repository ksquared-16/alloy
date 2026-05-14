import type { AttentionSlaTier } from "@/lib/opportunities/attentionSla";
import { worstSlaTier } from "@/lib/opportunities/attentionSla";

const MAX_LEN = 100;

/**
 * Compact deterministic line for needs-attention work-unit queue rows (not AI).
 * Prefer resolver primary label; append worst-case SLA tier when it adds signal.
 */
export function buildQueueRowPriorityExplanationLine(row: Record<string, unknown>): string | null {
    if (row._needs_attention !== true) return null;
    const label = String(row._attention_reason_label ?? "").trim();
    if (!label) return null;

    const details = row._attention_reasons_detail;
    const tiers: AttentionSlaTier[] = Array.isArray(details)
        ? (details as { sla_tier?: AttentionSlaTier }[])
              .map((x) => x.sla_tier)
              .filter((t): t is AttentionSlaTier => t === "ok" || t === "approaching" || t === "breached")
        : [];
    let worst: AttentionSlaTier = "ok";
    for (const t of tiers) worst = worstSlaTier(worst, t);

    let out = label;
    if (worst === "breached") out = `${out} · Past due vs goal`;
    else if (worst === "approaching") out = `${out} · Due soon`;

    if (out.length > MAX_LEN) return `${out.slice(0, MAX_LEN - 1)}…`;
    return out;
}
