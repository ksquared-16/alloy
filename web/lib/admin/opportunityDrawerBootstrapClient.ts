import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import type { OperationalSummaryRiskHint } from "@/lib/ai/enrichmentContracts";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type { RecordLayoutRow } from "@/lib/recordChrome/types";
import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

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

/**
 * Canonical bootstrap URL for fetch dedupe (intent prefetch + drawer open).
 * Client-only preview hints (trust/status) are not part of the URL so identical scope coalesces to one GET.
 */
export function buildOpportunityDrawerBootstrapCanonicalUrl(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined
): string {
    const qs = new URLSearchParams();
    const dept = workspaceContext?.department_id?.trim() ?? "";
    const wu = workspaceContext?.work_unit_id?.trim() ?? "";
    if (dept) qs.set("department_id", dept);
    if (wu) qs.set("work_unit_id", wu);
    const q = qs.toString();
    return `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/drawer-operational-bootstrap${q ? `?${q}` : ""}`;
}

/** @deprecated Alias of {@link buildOpportunityDrawerBootstrapCanonicalUrl} — hints are client-only. */
export function buildOpportunityDrawerBootstrapUrl(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    _entityHints?: { statusKey?: string | null; metadata?: Record<string, unknown> | null } | null,
    _trustHints?: { headline: string | null; urgency: string | null }
): string {
    return buildOpportunityDrawerBootstrapCanonicalUrl(opportunityId, workspaceContext);
}

const DRAWER_BOOTSTRAP_CACHE_TTL_MS = 8_000;

type DrawerBootstrapCacheEntry = {
    promise: Promise<OpportunityDrawerOperationalBootstrapResponse>;
};

/** One bootstrap GET per opportunity id (intent prefetch + drawer open + Strict Mode share this). */
const drawerBootstrapByOpportunityId = new Map<string, DrawerBootstrapCacheEntry>();

function drawerBootstrapCacheKey(opportunityId: string): string {
    return opportunityId.trim();
}

/** True when intent prefetch or a prior open still has bootstrap in the 8s coalesce window. */
export function isOpportunityDrawerBootstrapWarm(opportunityId: string): boolean {
    const key = drawerBootstrapCacheKey(opportunityId);
    return key.length > 0 && drawerBootstrapByOpportunityId.has(key);
}

/** One in-flight bootstrap payload per opportunity (survives Strict Mode; coalesces prefetch vs open). */
export async function fetchOpportunityDrawerOperationalBootstrap(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit
): Promise<OpportunityDrawerOperationalBootstrapResponse> {
    const cacheKey = drawerBootstrapCacheKey(opportunityId);
    if (!cacheKey) {
        throw new Error("missing_opportunity_id");
    }

    const cached = drawerBootstrapByOpportunityId.get(cacheKey);
    if (cached) {
        return cached.promise;
    }

    const url = buildOpportunityDrawerBootstrapCanonicalUrl(opportunityId, workspaceContext);
    const promise = dedupeAdminFetch(url, init ?? workspaceDataFetchInit())
        .then((res) => {
            if (!res.ok) {
                throw new Error(res.status === 404 ? "Not found" : "bootstrap_failed");
            }
            return res.json() as Promise<OpportunityDrawerOperationalBootstrapResponse>;
        })
        .catch((err) => {
            drawerBootstrapByOpportunityId.delete(cacheKey);
            throw err;
        });

    drawerBootstrapByOpportunityId.set(cacheKey, { promise });

    void promise.finally(() => {
        setTimeout(() => {
            if (drawerBootstrapByOpportunityId.get(cacheKey)?.promise === promise) {
                drawerBootstrapByOpportunityId.delete(cacheKey);
            }
        }, DRAWER_BOOTSTRAP_CACHE_TTL_MS);
    });

    return promise;
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
