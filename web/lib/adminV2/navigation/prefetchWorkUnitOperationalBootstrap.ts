import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    buildWorkUnitOperationalBootstrapClientUrl,
    type WorkUnitBootstrapRequestParams,
} from "@/lib/adminV2/workUnitBootstrapClientSession";

export type WorkUnitOperationalBootstrapPrefetchOpts = {
    departmentId: string;
    workUnitId: string;
    selectedSiteId?: string | null;
    focusQueue?: string | null;
    attentionBucket?: string | null;
};

/** Query params aligned with `work-unit/[workUnitId]/page.tsx` operational-bootstrap request. */
export function buildWorkUnitOperationalBootstrapUrl(
    workUnitId: string,
    opts: WorkUnitOperationalBootstrapPrefetchOpts
): string {
    return buildWorkUnitOperationalBootstrapClientUrl({
        departmentId: opts.departmentId,
        workUnitId,
        selectedSiteId: opts.selectedSiteId ?? null,
        focusQueue: opts.focusQueue ?? undefined,
        attentionBucket: opts.attentionBucket ?? undefined,
        deferBundle: true,
    });
}

/** Parse dept oper card `href` for work-unit bootstrap prefetch (future orchestrated nav). */
export function parseWorkUnitNavFromDeptOperHref(href: string): WorkUnitOperationalBootstrapPrefetchOpts | null {
    try {
        const url = new URL(href, "https://alloy.local");
        const match = url.pathname.match(/\/adminV2\/workspace\/dept\/([^/]+)\/work-unit\/([^/]+)/);
        if (!match?.[1] || !match[2]) return null;
        return {
            departmentId: decodeURIComponent(match[1]),
            workUnitId: decodeURIComponent(match[2]),
            focusQueue: url.searchParams.get("queue"),
            attentionBucket: url.searchParams.get("attention_bucket"),
        };
    } catch {
        return null;
    }
}

/**
 * Best-effort warm-up for dept → work-unit navigation (GET only; does not change routing).
 * Intended for pointer/click intent before `adminV2CommitNavigation` in a future orchestrated card.
 */
export async function prefetchWorkUnitOperationalBootstrap(
    opts: WorkUnitOperationalBootstrapPrefetchOpts
): Promise<void> {
    const url = buildWorkUnitOperationalBootstrapUrl(opts.workUnitId, opts);
    const res = await dedupeAdminFetch(url, workspaceDataFetchInit());
    if (!res.ok) {
        throw new Error(`work-unit operational-bootstrap prefetch failed (${res.status})`);
    }
    await res.json().catch(() => ({}));
}

export type { WorkUnitBootstrapRequestParams };
