import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import {
    fetchWorkUnitOperationalBootstrapSession,
    type WorkUnitBootstrapOwnership,
} from "@/lib/adminV2/workUnitBootstrapClientSession";

/** Parse `/adminV2/workspace/dept/:deptId/work-unit/:wuId` from a dept oper console href. */
export function parseWorkUnitBootstrapOwnershipFromHref(
    href: string,
    departmentId: string,
    selectedSiteId: string | null
): WorkUnitBootstrapOwnership | null {
    if (!href.trim() || !departmentId.trim()) return null;
    try {
        const base =
            typeof window !== "undefined" ? window.location.origin : "https://alloy.local";
        const url = new URL(href, base);
        const match = url.pathname.match(/\/work-unit\/([^/]+)/);
        if (!match?.[1]) return null;
        const queue = url.searchParams.get("queue")?.trim() ?? "";
        const attentionBucket = url.searchParams.get("attention_bucket")?.trim() ?? "";
        return {
            departmentId,
            workUnitId: decodeURIComponent(match[1]),
            selectedSiteId,
            focusQueue: queue || null,
            attentionBucket: attentionBucket || null,
        };
    } catch {
        return null;
    }
}

/** Start canonical WU operational-bootstrap inflight before hard navigation from /dept. */
export function prefetchWorkUnitOperationalBootstrapFromDeptHref(
    href: string,
    departmentId: string,
    selectedSiteId: string | null
): void {
    const ownership = parseWorkUnitBootstrapOwnershipFromHref(href, departmentId, selectedSiteId);
    if (!ownership) return;
    logPrefetchAdminV2("work_unit", "start", {
        department_id: ownership.departmentId,
        work_unit_id: ownership.workUnitId,
        reason: "dept_pointer",
    });
    void fetchWorkUnitOperationalBootstrapSession(ownership, "prefetch")
        .then(() => {
            logPrefetchAdminV2("work_unit", "complete", {
                department_id: ownership.departmentId,
                work_unit_id: ownership.workUnitId,
            });
        })
        .catch(() => {
            logPrefetchAdminV2("work_unit", "error", {
                department_id: ownership.departmentId,
                work_unit_id: ownership.workUnitId,
            });
        });
}

/** Idle prefetch visible/likely work-unit bootstraps from dept oper console (capped). */
export function prefetchVisibleWorkUnitBootstrapsFromDept(params: {
    departmentId: string;
    hrefs: string[];
    selectedSiteId: string | null;
    reason?: "dept_idle_visible" | "dept_hover";
}): void {
    const cap = 3;
    const unique = [...new Set(params.hrefs.map((h) => h.trim()).filter(Boolean))].slice(0, cap);
    if (!unique.length) {
        logPrefetchAdminV2("work_unit", "skipped", { reason: "no_visible_wu_hrefs" });
        return;
    }
    logPrefetchAdminV2("work_unit", "start", {
        reason: params.reason ?? "dept_idle_visible",
        department_id: params.departmentId,
        href_count: unique.length,
        cap,
    });
    for (const href of unique) {
        prefetchWorkUnitOperationalBootstrapFromDeptHref(href, params.departmentId, params.selectedSiteId);
    }
}
