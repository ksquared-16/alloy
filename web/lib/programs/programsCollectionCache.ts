/**
 * Programs collection cache — Checkpoint D.
 *
 * Org-scoped snapshot for the Programs publication read model.
 * Inflight reuse, stale retention during refresh, Continuity warm/invalidation.
 * Server APIs remain the write/read authority — this is not business truth.
 */

import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";
import { publishConfigurationInvalidation } from "@/lib/configRuntime/configurationInvalidation";
import {
    ConfigurationRuntimeIssueError,
    readConfigurationRuntimeIssue,
    type ConfigurationRuntimeIssue,
} from "@/lib/configPublication/runtimeIssue";

export const PROGRAMS_COLLECTION_TTL_MS = 60_000;

export type ProgramsCollectionSnapshot = ProgramPublicationSnapshot & {
    orgId: string;
    fetchedAtMs: number;
};

export type ProgramsCollectionLoadMeta = {
    cacheHit: boolean;
    inflightJoin: boolean;
    staleReuse: boolean;
};

const cache = new Map<string, ProgramsCollectionSnapshot>();
const inflight = new Map<string, Promise<ProgramsCollectionSnapshot>>();

function cacheKey(orgId: string): string {
    return `programs-collection:v1:${orgId.trim()}`;
}

export function peekProgramsCollection(orgId: string): ProgramsCollectionSnapshot | null {
    const id = orgId.trim();
    if (!id) return null;
    return cache.get(cacheKey(id)) ?? null;
}

export function isProgramsCollectionFresh(
    snapshot: ProgramsCollectionSnapshot | null,
    nowMs = Date.now(),
): boolean {
    if (!snapshot) return false;
    return nowMs - snapshot.fetchedAtMs <= PROGRAMS_COLLECTION_TTL_MS;
}

async function fetchProgramsCollectionNetwork(orgId: string): Promise<ProgramsCollectionSnapshot> {
    const response = await fetch("/api/admin/configuration/programs", { credentials: "include" });
    const payload = (await response.json().catch(() => ({}))) as ProgramPublicationSnapshot & {
        error?: ConfigurationRuntimeIssue | string;
    };
    if (!response.ok) {
        throw new ConfigurationRuntimeIssueError(
            readConfigurationRuntimeIssue(payload.error, "Programs"),
        );
    }
    return {
        ...payload,
        orgId,
        fetchedAtMs: Date.now(),
    };
}

export async function loadProgramsCollection(
    orgId: string,
    options?: { force?: boolean },
): Promise<{ snapshot: ProgramsCollectionSnapshot; meta: ProgramsCollectionLoadMeta }> {
    const id = orgId.trim();
    if (!id) throw new Error("orgId is required for Programs collection cache");

    const key = cacheKey(id);
    const existing = cache.get(key) ?? null;
    const force = options?.force === true;

    if (!force && isProgramsCollectionFresh(existing)) {
        return {
            snapshot: existing!,
            meta: { cacheHit: true, inflightJoin: false, staleReuse: false },
        };
    }

    const joined = inflight.get(key);
    if (joined) {
        const snapshot = await joined;
        return {
            snapshot,
            meta: {
                cacheHit: false,
                inflightJoin: true,
                staleReuse: Boolean(existing) && !isProgramsCollectionFresh(existing),
            },
        };
    }

    const promise = fetchProgramsCollectionNetwork(id)
        .then((snapshot) => {
            cache.set(key, snapshot);
            return snapshot;
        })
        .finally(() => {
            if (inflight.get(key) === promise) inflight.delete(key);
        });
    inflight.set(key, promise);

    const snapshot = await promise;
    return {
        snapshot,
        meta: {
            cacheHit: false,
            inflightJoin: false,
            staleReuse: Boolean(existing) && !force,
        },
    };
}

export function invalidateProgramsCollection(
    orgId: string,
    reason: string,
    options?: { publishBus?: boolean },
): void {
    const id = orgId.trim();
    if (!id) return;
    const key = cacheKey(id);
    cache.delete(key);
    inflight.delete(key);
    if (options?.publishBus !== false) {
        publishConfigurationInvalidation("programs", reason);
    }
}

/** Test-only reset. */
export function resetProgramsCollectionCacheForTests(): void {
    cache.clear();
    inflight.clear();
}
