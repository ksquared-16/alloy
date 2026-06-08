/**
 * Grounded timing phrases for operational recommendation templates.
 * Values must trace to resolver SLA tier + opportunity `created_at` (intake), not invented copy.
 */

import type { AttentionSlaTier } from "@/lib/opportunities/attentionSla";
import { slaTierPhrase } from "@/lib/opportunities/operationalAttentionExplain";

export function roughDaysBetween(nowMs: number, pastIso: string | null | undefined): number | null {
    if (!pastIso?.trim()) return null;
    const t = Date.parse(pastIso);
    if (!Number.isFinite(t)) return null;
    const d = (nowMs - t) / (24 * 60 * 60 * 1000);
    return d >= 0 ? Math.round(d) : null;
}

/** Calendar days since opportunity intake (`created_at`). */
export function intakeAgeDaysFromRow(
    row: Record<string, unknown>,
    nowMs: number
): number | null {
    const created =
        typeof row.created_at === "string" ? row.created_at.trim() : "";
    return roughDaysBetween(nowMs, created || null);
}

export function formatIntakeAgePhrase(days: number | null | undefined): string | null {
    if (days == null || !Number.isFinite(days)) return null;
    if (days <= 0) return "Inquiry received today";
    if (days === 1) return "1 day since the inquiry was created";
    return `${days} days since the inquiry was created`;
}

/**
 * Drawer / queue urgency line — only claims SLA breach when resolver tier is breached.
 */
export function buildGroundedUrgencyReasonLine(
    slaTier: AttentionSlaTier,
    intakeAgePhrase: string | null
): string {
    const windowLabel =
        slaTier === "breached"
            ? "Response window exceeded"
            : slaTier === "approaching"
              ? "First-response window due soon"
              : "";
    if (windowLabel && intakeAgePhrase) return `${windowLabel} · ${intakeAgePhrase}`;
    if (intakeAgePhrase) return intakeAgePhrase;
    return slaTierPhrase(slaTier);
}
