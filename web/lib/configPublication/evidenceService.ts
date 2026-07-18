import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    ConfigurationConsumptionRecord,
    ConfigurationDeliveryAttemptRecord,
    ConfigurationDistributionRunRecord,
    ConfigurationDistributionTargetRecord,
    ConfigurationPublicationRecord,
} from "@/lib/configPublication/types";

type DbRow = Record<string, unknown>;

export type ConfigurationPublicationEvidenceSnapshot = {
    publications: ConfigurationPublicationRecord[];
    runs: ConfigurationDistributionRunRecord[];
    attempts: ConfigurationDeliveryAttemptRecord[];
    consumptions: ConfigurationConsumptionRecord[];
};

function stringValue(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
    const result = stringValue(value).trim();
    return result || null;
}

function recordValue(value: unknown): Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function assertNoError(error: { message: string } | null, operation: string): void {
    if (error) throw new Error(`${operation}: ${error.message}`);
}

function mapPublication(row: DbRow): ConfigurationPublicationRecord {
    return {
        id: stringValue(row.id),
        orgId: stringValue(row.org_id),
        domainKey: stringValue(row.domain_key),
        subjectId: stringValue(row.subject_id),
        revision: {
            id: stringValue(row.revision_id),
            number: Number(row.revision_number),
            checksum: stringValue(row.payload_checksum),
        },
        publishedAt: stringValue(row.published_at),
    };
}

export async function loadConfigurationPublicationEvidence(input: {
    supabase: SupabaseClient;
    orgId: string;
    domainKey: string;
    runLimit?: number;
}): Promise<ConfigurationPublicationEvidenceSnapshot> {
    const [publicationsResult, runsResult, consumptionsResult] = await Promise.all([
        input.supabase
            .from("configuration_publications")
            .select("*")
            .eq("org_id", input.orgId)
            .eq("domain_key", input.domainKey)
            .order("revision_number", { ascending: false }),
        input.supabase
            .from("configuration_distribution_runs")
            .select("*")
            .eq("org_id", input.orgId)
            .eq("domain_key", input.domainKey)
            .order("created_at", { ascending: false })
            .limit(input.runLimit ?? 100),
        input.supabase
            .from("configuration_consumptions")
            .select("*")
            .eq("org_id", input.orgId)
            .eq("domain_key", input.domainKey)
            .order("updated_at", { ascending: false }),
    ]);
    assertNoError(publicationsResult.error, "Load publications");
    assertNoError(runsResult.error, "Load distribution history");
    assertNoError(consumptionsResult.error, "Load current consumptions");

    const runRows = (runsResult.data ?? []) as DbRow[];
    const runIds = runRows.map((row) => stringValue(row.id)).filter(Boolean);
    const [targetsResult, attemptsResult] =
        runIds.length > 0 ?
            await Promise.all([
                input.supabase
                    .from("configuration_distribution_targets")
                    .select("*")
                    .eq("org_id", input.orgId)
                    .in("run_id", runIds)
                    .order("updated_at", { ascending: false }),
                input.supabase
                    .from("configuration_delivery_attempts")
                    .select("*")
                    .eq("org_id", input.orgId)
                    .in("run_id", runIds)
                    .order("attempted_at", { ascending: false }),
            ])
        :   [{ data: [], error: null }, { data: [], error: null }];
    assertNoError(targetsResult.error, "Load distribution targets");
    assertNoError(attemptsResult.error, "Load delivery attempts");

    const targetRows = (targetsResult.data ?? []) as DbRow[];
    const targetsByRun = new Map<string, ConfigurationDistributionTargetRecord[]>();
    for (const row of targetRows) {
        const runId = stringValue(row.run_id);
        const targets = targetsByRun.get(runId) ?? [];
        targets.push({
            id: stringValue(row.id),
            locationId: stringValue(row.location_id),
            status: row.status as ConfigurationDistributionTargetRecord["status"],
            attemptCount: Number(row.attempt_count ?? 0),
            errorCode: nullableString(row.error_code),
            errorMessage: nullableString(row.error_message),
            result: recordValue(row.result),
        });
        targetsByRun.set(runId, targets);
    }

    return {
        publications: ((publicationsResult.data ?? []) as DbRow[]).map(mapPublication),
        runs: runRows.map((row) => ({
            id: stringValue(row.id),
            publicationId: stringValue(row.publication_id),
            status: row.status as ConfigurationDistributionRunRecord["status"],
            idempotencyKey: stringValue(row.idempotency_key),
            createdAt: stringValue(row.created_at),
            completedAt: nullableString(row.completed_at),
            targets: targetsByRun.get(stringValue(row.id)) ?? [],
        })),
        attempts: ((attemptsResult.data ?? []) as DbRow[]).map((row) => ({
            id: stringValue(row.id),
            runId: stringValue(row.run_id),
            targetId: stringValue(row.target_id),
            locationId: stringValue(row.location_id),
            attemptNumber: Number(row.attempt_number),
            status: row.status as ConfigurationDeliveryAttemptRecord["status"],
            errorCode: nullableString(row.error_code),
            errorMessage: nullableString(row.error_message),
            attemptedAt: stringValue(row.attempted_at),
        })),
        consumptions: ((consumptionsResult.data ?? []) as DbRow[]).map((row) => ({
            id: stringValue(row.id),
            orgId: stringValue(row.org_id),
            domainKey: stringValue(row.domain_key),
            subjectId: stringValue(row.subject_id),
            locationId: stringValue(row.location_id),
            publicationId: stringValue(row.publication_id),
            revisionId: stringValue(row.revision_id),
            consumedAt: stringValue(row.consumed_at),
            deliveredByRunId: stringValue(row.delivered_by_run_id),
        })),
    };
}
