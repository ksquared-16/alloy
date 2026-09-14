import { NextResponse } from "next/server";
import {
    loadAdminAccessBundleCached,
    type AdminAccessContextSuccess,
} from "@/lib/admin/getAdminAccessContext";

/**
 * Capability required to read org-wide analytics (metrics, trends, operational intelligence).
 * Catalog keys seeded in `20260505164000_permission_grid_keys.sql` — the `reports` grid row.
 */
export const ANALYTICS_READ_PERMISSION = "reports.read" as const;
export const ANALYTICS_MANAGE_PERMISSION = "reports.write" as const;

export type AnalyticsReadSubject = {
    /**
     * admin/ops role_key present for the resolved org. Carried, and deliberately NOT consulted —
     * see `canReadAnalytics`. `I-35`ᴮ: admission may deny, never authorize.
     */
    portalEligible: boolean;
    permissionKeys: string[];
};

/**
 * True when the caller may read org-wide analytics.
 *
 * **W-13 / `I-35`ᴮ — this gate no longer accepts an admission predicate.** It opened with
 * `if (subject.portalEligible) return true`, which is `I-35`ᴮ's exact prohibition: *an admission
 * predicate MUST NOT satisfy a capability gate*. `04…:752` names the cost of leaving it — *"the
 * fifth layer survives under a new name"* — and it was the third and last site where
 * `portalEligible` conferred authority rather than merely filtering admission. Every other reader
 * in the tree DENIES on it (`if (!portalEligible) → 403`), which `I-35`ᴮ permits, because admission
 * may refuse.
 *
 * **Admission is preserved, not narrowed.** `portalEligible` is `admin` OR `ops`, and `reports.read`
 * was granted to `admin` only. `20260819120000` grants it to `ops` for every org that defines the
 * role, and aborts if any org is left uncovered — so every principal admitted by the removed leg is
 * admitted by a capability instead. The read key only: this gate reads, and granting `reports.write`
 * would have handed `ops` a mutation capability it does not have.
 *
 * `portalEligible` remains in the SUBJECT TYPE deliberately. Callers still resolve it, and the field
 * documents that this gate was told about admission and declined to authorize on it. Deleting the
 * field would make the refusal invisible.
 */
export function canReadAnalytics(subject: AnalyticsReadSubject): boolean {
    return (
        subject.permissionKeys.includes(ANALYTICS_READ_PERMISSION)
        || subject.permissionKeys.includes(ANALYTICS_MANAGE_PERMISSION)
    );
}

export type AnalyticsReadAuth =
    | { ok: true; access: AdminAccessContextSuccess }
    | { ok: false; response: NextResponse };

/**
 * Use on analytics read routes. Returns 401 unauthenticated, 403 for an authenticated org member
 * who is neither portal-eligible nor granted an analytics capability, otherwise the access context
 * (including scope dimensions) for the handler to filter with.
 */
export async function requireAnalyticsReadAccess(): Promise<AnalyticsReadAuth> {
    const bundle = await loadAdminAccessBundleCached();
    if (!bundle.ok) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: bundle.status === 401 ? "Unauthorized" : "Forbidden" },
                { status: bundle.status }
            ),
        };
    }

    const { portalEligible, ...access } = bundle;
    if (!canReadAnalytics({ portalEligible, permissionKeys: access.permissionKeys })) {
        return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return { ok: true, access };
}

/**
 * True when the caller may CHANGE Operational Intelligence — calculations, KPI targets, OI
 * configuration and measurements.
 *
 * Deliberately NOT a superset test. `reports.write` alone, because manage implies read and never the
 * reverse: {@link canReadAnalytics} already accepts either key, so a writer reads through that gate
 * and a reader never reaches this one.
 */
export function canManageAnalytics(subject: { permissionKeys: string[] }): boolean {
    return subject.permissionKeys.includes(ANALYTICS_MANAGE_PERMISSION);
}

/**
 * OPERATIONAL INTELLIGENCE WRITE AUTHORITY — the activation of a key that already existed.
 *
 * Ten mutation handlers under `organization-calculations/` and `metrics/` asked `ctx.role !== "admin"`
 * while `reports.write` sat in the catalog, named in this very file as ANALYTICS_MANAGE_PERMISSION,
 * describing exactly these operations. It was seeded and enforced NOWHERE: before this helper its
 * only executable effect was satisfying the read gate above as a superset of `reports.read`.
 *
 * ── WHY THE OPS DEFAULT MOVED WITH IT ──
 *
 * A key that authorizes nothing can be granted freely, and `ops` held it. The moment enforcement
 * becomes real that dormant grant would confer ten mutations `ops` has never been able to perform —
 * the measurement was unambiguous: zero custom roles held it, zero audit events ever named it, and
 * every one of these routes answered ops 403. So `20260915120000` withholds it from the ops default
 * package, exactly as `20260914114000` withheld `scheduling.write` and `ops.jobs.write` on finding
 * the same shape. Ops keeps `reports.read`, so Operational Intelligence stays readable and only
 * authoring narrows.
 *
 * Activating existing vocabulary is not the same as inventing some. No `organization_calculations.*`
 * or `metrics.*` family was created: a folder is not a product, and Operational Intelligence already
 * owns this authority under a name the catalog has carried since the permission grid.
 */
export async function requireAnalyticsManageAccess(): Promise<AnalyticsReadAuth> {
    const bundle = await loadAdminAccessBundleCached();
    if (!bundle.ok) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: bundle.status === 401 ? "Unauthorized" : "Forbidden" },
                { status: bundle.status }
            ),
        };
    }

    const { portalEligible: _portalEligible, ...access } = bundle;
    if (!canManageAnalytics({ permissionKeys: access.permissionKeys })) {
        return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return { ok: true, access };
}
