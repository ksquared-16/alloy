import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { displayLabelsFromDefinitions, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

/** GET: list persons for org. Returns rows with _person_name, _customer_count, _compatibility_contacts_count, _compatibility_members_count, _updated. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 500, 500);

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("persons")
        .select("id, org_id, first_name, last_name, email, phone, status_key, person_number, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
        status_key?: string | null;
        created_at?: string | null;
        updated_at?: string | null;
    }[];
    const personIds = list.map((r) => r.id);

    const personDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "persons", { activeOnly: true });
    const personStatusLabels = displayLabelsFromDefinitions(personDefs);

    const [cpRes, contactCountRes, memberCountRes] = await Promise.all([
        personIds.length > 0
            ? supabase.from("customer_persons").select("person_id, customer_id").in("person_id", personIds)
            : { data: [] as { person_id: string; customer_id: string }[] },
        personIds.length > 0
            ? supabase.from("contacts").select("person_id").eq("org_id", ctx.orgId).in("person_id", personIds)
            : { data: [] as { person_id: string }[] },
        personIds.length > 0
            ? supabase.from("customer_members").select("person_id").eq("org_id", ctx.orgId).in("person_id", personIds)
            : { data: [] as { person_id: string }[] },
    ]);

    const customerCountByPerson = new Map<string, number>();
    (cpRes.data ?? []).forEach((r: { person_id: string }) => {
        customerCountByPerson.set(r.person_id, (customerCountByPerson.get(r.person_id) ?? 0) + 1);
    });
    const contactCountByPerson = new Map<string, number>();
    (contactCountRes.data ?? []).forEach((r: { person_id: string }) => {
        contactCountByPerson.set(r.person_id, (contactCountByPerson.get(r.person_id) ?? 0) + 1);
    });
    const memberCountByPerson = new Map<string, number>();
    (memberCountRes.data ?? []).forEach((r: { person_id: string }) => {
        memberCountByPerson.set(r.person_id, (memberCountByPerson.get(r.person_id) ?? 0) + 1);
    });

    const persons = list.map((r) => {
        const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || null;
        const sk = r.status_key != null && String(r.status_key).trim() !== "" ? String(r.status_key).trim() : null;
        const _status_display = sk ? (personStatusLabels.get(sk) ?? sk) : null;
        return {
            ...r,
            _person_name: name,
            _customer_count: customerCountByPerson.get(r.id) ?? 0,
            _compatibility_contacts_count: contactCountByPerson.get(r.id) ?? 0,
            _compatibility_members_count: memberCountByPerson.get(r.id) ?? 0,
            _updated: r.updated_at ?? r.created_at ?? null,
            _status_display,
        };
    });

    return NextResponse.json({ persons });
}

/** POST: create a canonical person. Admin only. Body: first_name?, last_name?, email?, phone? (at least one recommended). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { first_name?: string; last_name?: string; email?: string; phone?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const first_name = typeof body.first_name === "string" ? body.first_name.trim() || null : null;
    const last_name = typeof body.last_name === "string" ? body.last_name.trim() || null : null;
    const email = typeof body.email === "string" ? body.email.trim() || null : null;
    const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
    const full_name = [first_name, last_name].filter(Boolean).join(" ").trim() || null;

    const supabase = createAdminClient();
    const insert = {
        org_id: ctx.orgId,
        first_name,
        last_name,
        full_name,
        email,
        phone,
    };

    const { data: created, error } = await supabase
        .from("persons")
        .insert(insert)
        .select("id, org_id, first_name, last_name, full_name, email, phone, created_at, updated_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(created, { status: 201 });
}
