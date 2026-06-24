import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import type { MetricDefinitionRow } from "@/lib/metrics/platform/types";
import { loadMetricDefinitionsForOrg } from "@/lib/metrics/platform/placementResolver";
import { evaluateAndSnapshotMetric } from "@/lib/metrics/platform/metricSnapshots";
import { isSourceKeyAvailable } from "@/lib/metrics/platform/metricSourceRegistry";

export type MetricSnapshotRunResult = {
    orgId: string;
    written: number;
    skipped: number;
    errors: string[];
};

export type MetricSnapshotRunOptions = {
    orgId: string;
    metricDefinitionIds?: string[];
    contextType?: string;
    contextId?: string | null;
    workUnitId?: string | null;
    siteLocationId?: string | null;
    accessScope?: AdminAccessScopeDimensions;
    activeOnly?: boolean;
};

/** Run snapshots for active metric definitions in an org. */
export async function runMetricSnapshotsForOrg(
    supabase: SupabaseClient,
    options: MetricSnapshotRunOptions
): Promise<MetricSnapshotRunResult> {
    const { orgId, metricDefinitionIds, contextType = "org", contextId = null, activeOnly = true } = options;

    let definitions = await loadMetricDefinitionsForOrg(supabase, orgId, activeOnly ? "active" : undefined);
    if (metricDefinitionIds?.length) {
        const idSet = new Set(metricDefinitionIds);
        definitions = definitions.filter((d) => idSet.has(d.id));
    }
    definitions = definitions.filter((d) => isSourceKeyAvailable(d.source_key));

    let written = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const definition of definitions) {
        try {
            const { snapshotId, error } = await evaluateAndSnapshotMetric({
                supabase,
                definition,
                ctx: {
                    orgId,
                    contextType,
                    contextId,
                    workUnitId: options.workUnitId ?? null,
                    siteLocationId: options.siteLocationId ?? null,
                },
            });
            if (error || !snapshotId) {
                errors.push(`${definition.key}: ${error ?? "no snapshot id"}`);
                skipped += 1;
            } else {
                written += 1;
            }
        } catch (e) {
            errors.push(`${definition.key}: ${e instanceof Error ? e.message : "evaluation failed"}`);
            skipped += 1;
        }
    }

    return { orgId, written, skipped, errors };
}

/** Cron-style runner across orgs (mirrors V1 writeAllOrgMetricSnapshots). */
export async function runAllOrgMetricPlatformSnapshots(params: {
    supabase: SupabaseClient;
    orgIdFilter?: string | null;
    metricDefinitionIds?: string[];
}): Promise<{ orgs: number; written: number; skipped: number; errors: string[] }> {
    let orgQuery = params.supabase.from("orgs").select("id");
    if (params.orgIdFilter) orgQuery = orgQuery.eq("id", params.orgIdFilter);

    const { data: orgRows, error: orgErr } = await orgQuery;
    if (orgErr) return { orgs: 0, written: 0, skipped: 0, errors: [orgErr.message] };

    let written = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of orgRows ?? []) {
        const orgId = String((row as { id: string }).id);
        const result = await runMetricSnapshotsForOrg(params.supabase, {
            orgId,
            metricDefinitionIds: params.metricDefinitionIds,
        });
        written += result.written;
        skipped += result.skipped;
        errors.push(...result.errors);
    }

    return { orgs: orgRows?.length ?? 0, written, skipped, errors };
}

export async function runSnapshotsForDefinitions(
    supabase: SupabaseClient,
    orgId: string,
    definitions: MetricDefinitionRow[],
    ctx?: { contextType?: string; contextId?: string | null; workUnitId?: string | null }
): Promise<MetricSnapshotRunResult> {
    const ids = definitions.map((d) => d.id);
    return runMetricSnapshotsForOrg(supabase, { orgId, metricDefinitionIds: ids, ...ctx });
}
