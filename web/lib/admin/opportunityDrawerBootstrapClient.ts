import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import type { OperationalSummaryRiskHint } from "@/lib/ai/enrichmentContracts";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type { RecordLayoutRow } from "@/lib/recordChrome/types";
import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";

export function adminV2DrawerBootstrapEnabled(): boolean {
    if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ADMINV2_DRAWER_BOOTSTRAP === "0") {
        return false;
    }
    return true;
}

export function urgencyTierToOperTrustRisk(
    tier: OpportunityDrawerQueuePreviewSeed["urgencyTier"] | undefined
): OperationalSummaryRiskHint {
    if (tier === "critical") return "high";
    if (tier === "warning") return "medium";
    return "low";
}

export function operTrustHintsFromQueueSeed(
    seed: OpportunityDrawerQueuePreviewSeed | null | undefined
): { headline: string | null; urgency: string | null } {
    if (!seed) return { headline: null, urgency: null };
    const headline =
        seed.operTrustHeadline?.trim() ||
        seed.activityStaleLabel?.trim() ||
        seed.statusLabel?.trim() ||
        null;
    const urgency = seed.operTrustUrgency?.trim() || urgencyTierToOperTrustRisk(seed.urgencyTier);
    return { headline, urgency };
}

export function buildOpportunityDrawerBootstrapUrl(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    entityHints: { statusKey?: string | null; metadata?: Record<string, unknown> | null } | null,
    trustHints: { headline: string | null; urgency: string | null }
): string {
    const qs = new URLSearchParams();
    const dept = workspaceContext?.department_id?.trim() ?? "";
    const wu = workspaceContext?.work_unit_id?.trim() ?? "";
    if (dept) qs.set("department_id", dept);
    if (wu) qs.set("work_unit_id", wu);
    const sk = entityHints?.statusKey?.trim() ?? "";
    if (sk) qs.set("hint_opportunity_status_key", sk);
    if (entityHints?.metadata && typeof entityHints.metadata === "object") {
        try {
            qs.set("hint_opportunity_metadata", JSON.stringify(entityHints.metadata));
        } catch {
            /* ignore */
        }
    }
    const hl = trustHints.headline?.trim() ?? "";
    if (hl) qs.set("hint_oper_trust_headline", hl);
    const urg = trustHints.urgency?.trim() ?? "";
    if (urg) qs.set("hint_oper_trust_urgency", urg);
    const q = qs.toString();
    return `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/drawer-operational-bootstrap${q ? `?${q}` : ""}`;
}

export function mapBootstrapLayoutToRecordLayoutRow(
    bootstrap: OpportunityDrawerOperationalBootstrapResponse
): RecordLayoutRow | null {
    const rl = bootstrap.record_layout;
    if (!rl) return null;
    return {
        id: rl.source === "org_drawer_override" ? rl.key : `global-${rl.key}`,
        entity_type: "opportunity",
        key: rl.key,
        config_json: rl.config_json,
        is_active: true,
        created_at: new Date().toISOString(),
    };
}
