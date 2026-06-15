import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { WORK_UNIT_QUEUE_ROWS_FETCH_MIN } from "@/lib/adminV2/workUnitQueueRowsFetchLimit";
import { recordAdminV2JankBudgetRequest } from "@/lib/perf/adminV2JankBudget";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import { perfWorkUnit } from "@/lib/perf/perfNamespaceLog";
import { ADMINV2_ABOVE_FOLD_CACHE_TTL_MS } from "@/lib/adminV2/adminV2AboveFoldCacheContracts";
import {
    dedupeAdminFetchWithTtlMeta,
    resetWorkspaceAdminFetchDedupeForTests,
} from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const BOOTSTRAP_TTL_MS = ADMINV2_ABOVE_FOLD_CACHE_TTL_MS.work_unit_above_fold;

export type WorkUnitBootstrapOwner = "page" | "prefetch" | "reuse" | "suppressed";

export type WorkUnitBootstrapOwnership = {
    departmentId: string;
    workUnitId: string;
    selectedSiteId: string | null;
    /** Route `?queue=` — maps to API `focus_queue` for primary lane + summary priority. */
    focusQueue?: string | null;
    attentionBucket?: string | null;
};

/** One bootstrap per work unit + explicit lane (dept oper card selection must not share default-lane cache). */
export function workUnitBootstrapOwnershipKey(params: WorkUnitBootstrapOwnership): string {
    return [
        params.departmentId,
        params.workUnitId,
        params.selectedSiteId ?? "",
        params.focusQueue?.trim() || "",
        params.attentionBucket?.trim() || "",
    ].join("|");
}

/**
 * Canonical GET URL for a work-unit route load. When `focusQueue` is set, primary lane matches dept selection.
 */
export function buildCanonicalWorkUnitOperationalBootstrapUrl(params: WorkUnitBootstrapOwnership): string {
    const qs = new URLSearchParams({
        department_id: params.departmentId,
        include_previews: "false",
        count_mode: "exact",
        summary_mode: "initial",
        limit: "3",
        omit_total_count: "true",
        primary_row_limit: String(WORK_UNIT_QUEUE_ROWS_FETCH_MIN),
        defer_bundle: "false",
    });
    const focus = params.focusQueue?.trim();
    const bucket = params.attentionBucket?.trim();
    if (focus) qs.set("focus_queue", focus);
    if (bucket) qs.set("attention_bucket", bucket);
    const base = `/api/admin/work-units/${encodeURIComponent(params.workUnitId)}/operational-bootstrap?${qs.toString()}`;
    return appendWorkspaceSiteToUrl(base, params.selectedSiteId);
}

let completedOwnershipKey: string | null = null;
let inflightOwnershipKey: string | null = null;
let inflightPromise: Promise<Response> | null = null;
let canonicalUrlForOwnership: string | null = null;

export function clearWorkUnitBootstrapSessionForEntity(departmentId: string, workUnitId: string): void {
    const deptPrefix = `${departmentId}|`;
    const ownPrefix = `${departmentId}|${workUnitId}|`;
    if (completedOwnershipKey?.startsWith(deptPrefix) && !completedOwnershipKey.startsWith(ownPrefix)) {
        completedOwnershipKey = null;
        canonicalUrlForOwnership = null;
    }
    if (inflightOwnershipKey?.startsWith(deptPrefix) && !inflightOwnershipKey.startsWith(ownPrefix)) {
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
    perfWorkUnit("bootstrap_owner", { bootstrap_owner: bootstrapOwner, ...detail });
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

    inflightPromise = dedupeAdminFetchWithTtlMeta(url, init, BOOTSTRAP_TTL_MS)
        .then((m) => m.response)
        .finally(() => {
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
        const meta = await dedupeAdminFetchWithTtlMeta(canonicalUrlForOwnership ?? url, init, BOOTSTRAP_TTL_MS);
        logPrefetchAdminV2("work_unit", meta.cache_hit ? "hit" : meta.inflight_join ? "inflight_join" : "miss", {
            cache_key: ownershipKey,
            department_id: params.departmentId,
            work_unit_id: params.workUnitId,
            url: canonicalUrlForOwnership ?? url,
            caller,
        });
        return {
            response: meta.response,
            ownershipKey,
            bootstrapOwner: caller === "prefetch" ? "prefetch" : "reuse",
        };
    }

    if (inflightOwnershipKey === ownershipKey && inflightPromise) {
        logWuBootstrapOwner("reuse", {
            ownershipKey,
            url: canonicalUrlForOwnership ?? url,
            inflight: true,
            caller,
        });
        logPrefetchAdminV2("work_unit", "inflight_join", {
            cache_key: ownershipKey,
            department_id: params.departmentId,
            work_unit_id: params.workUnitId,
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
