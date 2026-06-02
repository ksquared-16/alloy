/**
 * Guardrails for lifecycle simulation scripts — never write to dev org without explicit env.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

export function getSimulationOrgId(): string {
    const orgId = (process.env.SIMULATION_ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) {
        throw new Error(
            "Set SIMULATION_ORG_ID (preferred) or DEV_QUEUE_ORG_ID to the org used for simulation/cleanup."
        );
    }
    return orgId;
}

/** Call at top of any script that INSERT/UPDATE/DELETE lifecycle simulation data. */
export function requireSimulationWrites(scriptName: string): string {
    if (process.env.ALLOW_SIMULATION_WRITES !== "1") {
        throw new Error(
            `${scriptName} refused: set ALLOW_SIMULATION_WRITES=1 to permit simulation writes. ` +
                `Prefer SIMULATION_ORG_ID for a disposable org.`
        );
    }
    return getSimulationOrgId();
}

/** Cleanup may run without ALLOW_SIMULATION_WRITES but requires explicit confirm. */
export function requireCleanupConfirm(scriptName: string): string {
    if (process.env.CONFIRM_SIMULATION_CLEANUP !== "1") {
        throw new Error(
            `${scriptName} dry-run only. Set CONFIRM_SIMULATION_CLEANUP=1 to delete simulation departments.`
        );
    }
    return getSimulationOrgId();
}
