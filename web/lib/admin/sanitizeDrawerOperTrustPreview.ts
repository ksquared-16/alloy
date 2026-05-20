import type { DrawerOperTrustPreviewV1 } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import type { OperationalSummaryRiskHint } from "@/lib/ai/enrichmentContracts";

const TRUST_HEADLINE_MAX = 140;
const URGENCY_HINTS = new Set<OperationalSummaryRiskHint>(["low", "medium", "high"]);

function clipHeadline(raw: string): string {
    const t = raw.trim();
    if (t.length <= TRUST_HEADLINE_MAX) return t;
    return `${t.slice(0, TRUST_HEADLINE_MAX - 1)}…`;
}

/**
 * v1: sanitize/echo trusted client queue seed hints only — no server attention compute.
 */
export function sanitizeDrawerOperTrustPreviewFromHints(params: {
    hintHeadline?: string | null;
    hintUrgency?: string | null;
}): DrawerOperTrustPreviewV1 | null {
    const headline = params.hintHeadline?.trim() ?? "";
    if (!headline) return null;
    const u = (params.hintUrgency ?? "").trim().toLowerCase();
    const risk_urgency_hint: OperationalSummaryRiskHint = URGENCY_HINTS.has(u as OperationalSummaryRiskHint)
        ? (u as OperationalSummaryRiskHint)
        : "medium";
    return { headline: clipHeadline(headline), risk_urgency_hint };
}
