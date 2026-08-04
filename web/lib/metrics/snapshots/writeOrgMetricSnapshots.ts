import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { getMetricDefinition, listMetricDefinitions } from "@/lib/metrics/registry";
import { resolveMetrics } from "@/lib/metrics/metricEngine";
import { writeMetricSnapshot } from "@/lib/metrics/snapshots/writeMetricSnapshot";
import type { MetricSnapshotScopeType } from "@/lib/metrics/snapshots/types";
import type { MetricTimeWindowKey, OipMetricKey } from "@/lib/metrics/types";

const DEFAULT_WINDOWS: MetricTimeWindowKey[] = ["rolling_7d", "rolling_30d"];

export type MetricSnapshotScopeTarget = {
    scopeType: MetricSnapshotScopeType;
    scopeId: string | null;
};

export type WriteOrgMetricSnapshotsResult = {
    orgId: string;
    written: number;
    skipped: number;
    errors: string[];
};

async function listOrgSiteIds(supabase: SupabaseClient, orgId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from("locations")
        .select("id")
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .eq("is_active", true);

    if (error) {
        console.warn("[writeOrgMetricSnapshots] list sites", error.message);
        return [];
    }
    return (data ?? []).map((r) => String((r as { id: string }).id));
}

function scopeTargets(includeSiteScopes: boolean, siteIds: string[]): MetricSnapshotScopeTarget[] {
    const targets: MetricSnapshotScopeTarget[] = [{ scopeType: "org", scopeId: null }];
    if (!includeSiteScopes) return targets;
    for (const siteId of siteIds) {
        targets.push({ scopeType: "site", scopeId: siteId });
    }
    return targets;
}

/**
 * Resolve live metrics and append snapshot rows for one org.
 * Intended for cron (`INTERNAL_CRON_TOKEN`) or admin-triggered backfill — not client calls.
 */
export async function writeOrgMetricSnapshots(params: {
    supabase: SupabaseClient;
    orgId: string;
    scope?: AdminAccessScopeDimensions;
    windows?: MetricTimeWindowKey[];
    metricKeys?: OipMetricKey[];
    includeSiteScopes?: boolean;
    computedAt?: Date;
    orgMetadata?: unknown;
}): Promise<WriteOrgMetricSnapshotsResult> {
    const windows = params.windows ?? DEFAULT_WINDOWS;
    const metricKeys = params.metricKeys ?? listMetricDefinitions().map((d) => d.key);
    const computedAtIso = (params.computedAt ?? new Date()).toISOString();
    const includeSiteScopes = params.includeSiteScopes !== false;

    const siteIds = includeSiteScopes ? await listOrgSiteIds(params.supabase, params.orgId) : [];
    const targets = scopeTargets(includeSiteScopes, siteIds);

    let written = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const window of windows) {
        for (const target of targets) {
            // A metric whose source data carries no site linkage can only be
            // answered org-wide. Snapshotting the org number under a site scope
            // would persist a row that READS as a site figure and is not one, so
            // those keys are skipped for narrowed targets rather than written.
            const keysForTarget =
                target.scopeType === "org"
                    ? metricKeys
                    : metricKeys.filter((key) => !getMetricDefinition(key).orgScopeOnly);
            if (keysForTarget.length === 0) continue;

            const resolved = await resolveMetrics({
                ctx: {
                    supabase: params.supabase,
                    orgId: params.orgId,
                    scope: params.scope ?? {
                        departmentScope: "all",
                        allowedDepartmentIds: [],
                        siteScope: "all",
                        allowedSiteLocationIds: [],
                    },
                    window,
                    siteLocationId: target.scopeType === "site" ? target.scopeId : null,
                    mode: "live",
                },
                keys: keysForTarget,
                orgMetadata: params.orgMetadata,
                includeKpi: false,
            });

            for (const row of resolved) {
                const m = row.metric;
                const { id, error } = await writeMetricSnapshot(params.supabase, {
                    orgId: params.orgId,
                    metricKey: m.key,
                    windowKey: window,
                    scopeType: target.scopeType,
                    scopeId: target.scopeId,
                    valueNumeric: m.value,
                    valueJson: {
                        formatted_value: m.formattedValue,
                        resolve_mode: m.resolveMode,
                        ...(m.meta ?? {}),
                    },
                    computedAt: computedAtIso,
                });

                if (error) {
                    errors.push(`${m.key}:${window}:${target.scopeType}:${target.scopeId ?? "org"}:${error}`);
                    skipped += 1;
                } else if (id) {
                    written += 1;
                } else {
                    skipped += 1;
                }
            }
        }
    }

    return { orgId: params.orgId, written, skipped, errors };
}

/** Cron runner — iterates active org rows. */
export async function writeAllOrgMetricSnapshots(params: {
    supabase: SupabaseClient;
    orgIdFilter?: string | null;
    windows?: MetricTimeWindowKey[];
    includeSiteScopes?: boolean;
}): Promise<{ orgs: number; written: number; skipped: number; errors: string[] }> {
    let orgQuery = params.supabase.from("orgs").select("id");
    if (params.orgIdFilter) {
        orgQuery = orgQuery.eq("id", params.orgIdFilter);
    }

    const { data: orgRows, error: orgErr } = await orgQuery;
    if (orgErr) {
        return { orgs: 0, written: 0, skipped: 0, errors: [orgErr.message] };
    }

    let written = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of orgRows ?? []) {
        const orgId = String((row as { id: string }).id);
        const { data: orgSettings } = await params.supabase
            .from("org_settings")
            .select("metadata")
            .eq("org_id", orgId)
            .maybeSingle();
        const orgMetadata = (orgSettings as { metadata?: unknown } | null)?.metadata ?? null;

        const result = await writeOrgMetricSnapshots({
            supabase: params.supabase,
            orgId,
            windows: params.windows,
            includeSiteScopes: params.includeSiteScopes,
            orgMetadata,
        });
        written += result.written;
        skipped += result.skipped;
        errors.push(...result.errors);
    }

    return { orgs: orgRows?.length ?? 0, written, skipped, errors };
}
