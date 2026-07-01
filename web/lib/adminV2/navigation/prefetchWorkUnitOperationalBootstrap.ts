import type { WorkUnitBootstrapOwnership } from "@/lib/adminV2/workUnitBootstrapClientSession";
import {
    buildCanonicalWorkUnitOperationalBootstrapUrl,
    fetchWorkUnitOperationalBootstrapSession,
} from "@/lib/adminV2/workUnitBootstrapClientSession";

export type WorkUnitOperationalBootstrapPrefetchOpts = {
    departmentId: string;
    workUnitId: string;
    selectedSiteId?: string | null;
    focusQueue?: string | null;
    attentionBucket?: string | null;
};

/** Query params aligned with canonical work-unit bootstrap (includes route queue when set). */
export function buildWorkUnitOperationalBootstrapUrl(
    workUnitId: string,
    opts: WorkUnitOperationalBootstrapPrefetchOpts
): string {
    return buildCanonicalWorkUnitOperationalBootstrapUrl({
        departmentId: opts.departmentId,
        workUnitId,
        selectedSiteId: opts.selectedSiteId ?? null,
        focusQueue: opts.focusQueue ?? null,
        attentionBucket: opts.attentionBucket ?? null,
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
 * Disabled for route load — page mount owns bootstrap. Joins in-flight/completed session only.
 */
export async function prefetchWorkUnitOperationalBootstrap(
    opts: WorkUnitOperationalBootstrapPrefetchOpts
): Promise<void> {
    const ownership: WorkUnitBootstrapOwnership = {
        departmentId: opts.departmentId,
        workUnitId: opts.workUnitId,
        selectedSiteId: opts.selectedSiteId ?? null,
        focusQueue: opts.focusQueue ?? null,
        attentionBucket: opts.attentionBucket ?? null,
    };
    const { response } = await fetchWorkUnitOperationalBootstrapSession(ownership, "prefetch");
    if (!response.ok) {
        throw new Error(`work-unit operational-bootstrap prefetch failed (${response.status})`);
    }
    await response.json().catch(() => ({}));
}
