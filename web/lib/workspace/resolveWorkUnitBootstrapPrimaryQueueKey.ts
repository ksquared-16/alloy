import { resolveAuthoritativeWorkUnitQueueKey } from "@/lib/adminV2/workUnitQueueSelection";

export type WorkUnitBootstrapQueueSummary = { key: string };

export type WorkUnitBootstrapWorkUnitRow = {
    queue_definition?: unknown;
};

/** Server mirror of client bootstrap primary lane — explicit queue wins over summary defaults. */
export function resolveWorkUnitBootstrapPrimaryQueueKey(
    wu: WorkUnitBootstrapWorkUnitRow,
    summaries: WorkUnitBootstrapQueueSummary[] | null,
    qFromUrl: string
): string | null {
    return resolveAuthoritativeWorkUnitQueueKey(wu, summaries, qFromUrl);
}
