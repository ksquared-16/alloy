import { redirect } from "next/navigation";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { CANONICAL_OPERATOR_BASE } from "@/lib/admin/canonicalAdminRoutes";

export const dynamic = "force-dynamic";

/**
 * `/organization/staff` — COMPATIBILITY ONLY. The Staff product lives in Records.
 *
 * ── WHY THIS PAGE NO LONGER RENDERS A DIRECTORY ──
 *
 * It used to host the staff list, and its own doctrine comment said selecting a staff member "opens
 * the canonical Person surface". It never did: the row linked to `?personId=`, nothing read that
 * param, and clicking a staff member reloaded the list. That was not a wiring slip — until Durable
 * Record Attention there was no destination to write, because a staff member has no household and
 * no case and so had no representable attention target at all.
 *
 * Records is now the durable record-management home and owns this population, so keeping a second
 * directory alive here would be two products answering one question — with only one of them able to
 * open a record.
 *
 * ── WHAT STAYS UNDER ORGANIZATION ──
 *
 * Staff CONFIGURATION, and only that: employment positions, employment types and configured
 * employment facts remain owned by their configuration surfaces. Organization configures the
 * business; Records is where you find a human. That boundary is why Staff was deliberately kept out
 * of Organization → Access in the first place, and it is unchanged.
 *
 * Old bookmarks and deep links keep working: they land on Records → Staff rather than 404.
 */
export default async function OrganizationStaffCompatibilityPage() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        redirect(ctx.status === 401 ? "/login" : "/unauthorized");
    }

    // `?section=staff` is read by the Records workspace on mount, so the deep link lands on the
    // section rather than on the workspace default.
    redirect(`${CANONICAL_OPERATOR_BASE}?workspace=records&section=staff`);
}
