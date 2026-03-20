import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { withVendorSelectLabels } from "@/lib/admin/withVendorSelectLabels";

/** GET: vendor options for dropdowns (`id`, `name`, `label`). `value` = id; `label` = human-readable. */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("vendors")
        .select("id, name, company_name, email, phone, primary_person_id")
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const vendors = await withVendorSelectLabels(supabase, rows ?? []);
    return NextResponse.json({ vendors });
}
