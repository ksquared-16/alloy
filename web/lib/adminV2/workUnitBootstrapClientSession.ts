import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { recordAdminV2JankBudgetRequest } from "@/lib/perf/adminV2JankBudget";
import {
    dedupeAdminFetchWithTtl,
    resetWorkspaceAdminFetchDedupeForTests,
} from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const BOOTSTRAP_TTL_MS = 15_000;

export type WorkUnitBootstrapOwner = "page" | "prefetch" | "reuse" | "suppressed";

export type WorkUnitBootstrapOwnership = {
    departmentId: string;
    workUnitId: string;
    selectedSiteId: string | null;
};

/** One bootstrap per work unit scope — ignores focus_queue, attention_bucket, defer_bundle URL variance. */
export function workUnitBootstrapOwnershipKey(params: WorkUnitBootstrapOwnership): string {
    return [params.departmentId, params.workUnitId, params.selectedSiteId ?? ""].join("|");
}

/**
 * Canonical GET URL for a work-unit route load. Lane selection stays client-side from URL/session refs.
 */
export function buildCanonicalWorkUnitOperationalBootstrapUrl(params: WorkUnitBootstrapOwnership): string {
    const qs = new URLSearchParams({
        department_id: params.departmentId,
        include_previews: "false",
        count_mode: "exact",
        summary_mode: "all",
        limit: "3",
        omit_total_count: "true",
        primary_row_limit: "20",
        defer_bundle: "false",
    });
    const base = `/api/admin/work-units/${encodeURIComponent(params.workUnitId)}/operational-bootstrap?${qs.toString()}`;
    return appendWorkspaceSiteToUrl(base, params.selectedSiteId);
}

let completedOwnershipKey: string | null = null;
let inflightOwnershipKey: string | null = null;
let inflightPromise: Promise<Response> | null = null;
let canonicalUrlForOwnership: string | null = null;

export function clearWorkUnitBootstrapSessionForEntity(departmentId: string, workUnitId: string): void {
    const prefix = `${departmentId}|${workUnitId}|`;
    if (completedOwnershipKey?.startsWith(prefix)) {
        completedOwnershipKey = null;
        canonicalUrlForOwnership = null;
    }
    if (inflightOwnershipKey?.startsWith(prefix)) {
        inflightOwnershipKey = null;
        inflightPromise = null;
    }
}

export function resetWorkUnitBootstrapClientSession(): void {
    completedOwnershipKey = null;
    inflightOwnershipKey = null;
    inflightPromise = null;
    canonicalUrlForOwnership = null;
    resetWorkspaceAdminFetchDedupeForTests();
}

export type FetchWorkUnitBootstrapResult = {
    response: Response;
    ownershipKey: string;
    bootstrapOwner: WorkUnitBootstrapOwner;
};

function logWuBootstrapOwner(
    bootstrapOwner: WorkUnitBootstrapOwner,
    detail: Record<string, unknown>
): void {
    if (typeof window === "undefined") return;
    console.info("[wu-route-perf]", { bootstrap_owner: bootstrapOwner, ...detail });
}

function startWorkUnitBootstrapInflight(
    ownershipKey: string,
    url: string,
    init: RequestInit,
    caller: "page" | "prefetch"
): void {
    if (completedOwnershipKey === ownershipKey) return;
    if (inflightOwnershipKey === ownershipKey && inflightPromise) return;

    inflightOwnershipKey = ownershipKey;
    canonicalUrlForOwnership = url;
    logWuBootstrapOwner(caller, { ownershipKey, url });
    recordAdminV2JankBudgetRequest({ phase: "wu_bootstrap", url });
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;

    inflightPromise = dedupeAdminFetchWithTtl(url, init, BOOTSTRAP_TTL_MS).finally(() => {
        inflightOwnershipKey = null;
        inflightPromise = null;
    });

    void inflightPromise
        .then((response) => {
            completedOwnershipKey = ownershipKey;
            logWuBootstrapOwner(caller, {
                ownershipKey,
                url,
                status: response.status,
                ms: typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null,
                event: "bootstrap_request_end",
            });
        })
        .catch(() => {
            if (completedOwnershipKey !== ownershipKey) {
                completedOwnershipKey = null;
                canonicalUrlForOwnership = null;
            }
        });
}

/**
 * Page mount and dept intent prefetch share one canonical inflight GET per ownership key.
 */
export async function fetchWorkUnitOperationalBootstrapSession(
    params: WorkUnitBootstrapOwnership,
    caller: "page" | "prefetch" = "page"
): Promise<FetchWorkUnitBootstrapResult> {
    const ownershipKey = workUnitBootstrapOwnershipKey(params);
    const url = buildCanonicalWorkUnitOperationalBootstrapUrl(params);
    const init = workspaceDataFetchInit() ?? {};

    if (completedOwnershipKey === ownershipKey) {
        logWuBootstrapOwner("reuse", { ownershipKey, url: canonicalUrlForOwnership ?? url, caller });
        const response = await dedupeAdminFetchWithTtl(canonicalUrlForOwnership ?? url, init, BOOTSTRAP_TTL_MS);
        return { response, ownershipKey, bootstrapOwner: caller === "prefetch" ? "prefetch" : "reuse" };
    }

    if (inflightOwnershipKey === ownershipKey && inflightPromise) {
        logWuBootstrapOwner("reuse", {
            ownershipKey,
            url: canonicalUrlForOwnership ?? url,
            inflight: true,
            caller,
        });
        const response = await inflightPromise;
        return { response, ownershipKey, bootstrapOwner: caller === "prefetch" ? "prefetch" : "reuse" };
    }

    startWorkUnitBootstrapInflight(ownershipKey, url, init, caller);

    if (!inflightPromise) {
        throw new Error("work_unit_bootstrap_inflight_missing");
    }

    const response = await inflightPromise;
    return {
        response,
        ownershipKey,
        bootstrapOwner: caller === "prefetch" ? "prefetch" : "page",
    };
}

/** @deprecated Use {@link buildCanonicalWorkUnitOperationalBootstrapUrl} — query variance must not fork bootstrap. */
export function buildWorkUnitOperationalBootstrapClientUrl(
    params: WorkUnitBootstrapOwnership & { focusQueue?: string; attentionBucket?: string; deferBundle?: boolean }
): string {
    return buildCanonicalWorkUnitOperationalBootstrapUrl(params);
}
