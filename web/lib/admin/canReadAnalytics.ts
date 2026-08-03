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
    /** admin/ops role_key present for the resolved org (today's portal admission). */
    portalEligible: boolean;
    permissionKeys: string[];
};

/**
 * True when the caller may read org-wide analytics.
 *
 * Portal-eligible principals qualify unconditionally — that preserves today's behaviour for every
 * `admin`/`ops` operator exactly. Everyone else needs an explicit grant, which closes the exposure
 * where any authenticated org member (`regional_lead`, `school_director`) could read org-wide
 * metrics from a route that gated on `access.ok` alone.
 *
 * Shape mirrors `canReadProgramPublication` in `app/api/admin/configuration/programs/route.ts`.
 * The `portalEligible` leg is what W-13 replaces with a `portal.access` capability.
 */
export function canReadAnalytics(subject: AnalyticsReadSubject): boolean {
    if (subject.portalEligible) return true;
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
