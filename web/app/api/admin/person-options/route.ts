import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

const LIMIT = 500;

function personLabel(p: { full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; id: string }): string {
    const name =
        (p.full_name && String(p.full_name).trim()) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        "";
    return name || (p.email && String(p.email).trim()) || (p.phone && String(p.phone).trim()) || p.id.slice(0, 8) + "…";
}

/** GET: persons for admin dropdowns (e.g. opportunity primary person). Optional customer_id narrows to persons linked to that customer. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id")?.trim() || null;

    const supabase = createAdminClient();

    if (customerId) {
        const [cpRes, ctRes] = await Promise.all([
            supabase.from("customer_persons").select("person_id").eq("org_id", ctx.orgId).eq("customer_id", customerId),
            supabase.from("contacts").select("person_id").eq("org_id", ctx.orgId).eq("customer_id", customerId).not("person_id", "is", null),
        ]);
        const ids = new Set<string>();
        for (const r of cpRes.data ?? []) {
            const pid = (r as { person_id?: string }).person_id;
            if (pid) ids.add(pid);
        }
        for (const r of ctRes.data ?? []) {
            const pid = (r as { person_id?: string | null }).person_id;
            if (pid) ids.add(pid);
        }
        if (ids.size === 0) {
            return NextResponse.json({ persons: [] });
        }
        const { data: rows, error } = await supabase
            .from("persons")
            .select("id, first_name, last_name, full_name, email, phone")
            .eq("org_id", ctx.orgId)
            .in("id", [...ids])
            .order("last_name", { ascending: true, nullsFirst: false })
            .order("first_name", { ascending: true, nullsFirst: false });
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const persons = (rows ?? []).map((r) => ({
            id: (r as { id: string }).id,
            label: personLabel(r as { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }),
        }));
        return NextResponse.json({ persons });
    }

    const { data: rows, error } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email, phone")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false })
        .limit(LIMIT);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const persons = (rows ?? []).map((r) => ({
        id: (r as { id: string }).id,
        label: personLabel(r as { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }),
    }));

    return NextResponse.json({ persons });
}
