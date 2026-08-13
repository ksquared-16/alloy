import { redirect } from "next/navigation";

import StaffDirectoryPage from "@/components/adminV2/settings/staff/StaffDirectoryPage";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { listEmploymentPositions } from "@/lib/employment/employmentService";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Canonical Organization Staff — `/organization/staff`.
 *
 * An Organization chapter alongside Access, Locations and Programs. Kept out of
 * Access on purpose: employment and authorization are different questions with
 * different owners, and the platform depends on them not being conflated.
 */
export default async function OrganizationStaffPage() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        redirect(ctx.status === 401 ? "/login" : "/unauthorized");
    }

    const supabase = createAdminClient();
    const [positions, sitesResult, todayYmd] = await Promise.all([
        listEmploymentPositions(supabase, ctx.orgId, { activeOnly: true }),
        supabase
            .from("locations")
            .select("id, label")
            .eq("org_id", ctx.orgId)
            .eq("location_type", "site")
            .eq("is_active", true)
            .order("label"),
        resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId),
    ]);

    const sites = ((sitesResult.data ?? []) as { id: string; label: string | null }[]).map((s) => ({
        id: s.id,
        label: (s.label ?? "").trim() || "Untitled location",
    }));

    return (
        <StaffDirectoryPage
            positions={positions.map((p) => ({ id: p.id, label: p.label }))}
            sites={sites}
            todayYmd={todayYmd}
        />
    );
}
