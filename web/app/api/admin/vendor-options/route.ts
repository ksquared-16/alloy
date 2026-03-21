import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { withVendorSelectLabels } from "@/lib/admin/withVendorSelectLabels";
import { DEFAULT_VENDOR_ASSIGNMENT_POLICY } from "@/lib/admin/vendorAssignmentPolicy";

/** GET: vendor options for dropdowns (`id`, `name`, `label`). `value` = id; `label` = human-readable.
 *  `?for_assignment=true` — only vendors with `status_key` matching the assignment policy (default `approved`).
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    const forAssignment = ["1", "true", "yes"].includes(
        (request.nextUrl.searchParams.get("for_assignment") ?? "").toLowerCase()
    );

    let q = supabase
        .from("vendors")
        .select("id, name, company_name, email, phone, primary_person_id")
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true });
    if (forAssignment) {
        q = q.eq("status_key", DEFAULT_VENDOR_ASSIGNMENT_POLICY.vendorStatusKey);
    }

    const { data: rows, error } = await q;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const vendors = await withVendorSelectLabels(supabase, rows ?? []);
    return NextResponse.json({ vendors });
}
