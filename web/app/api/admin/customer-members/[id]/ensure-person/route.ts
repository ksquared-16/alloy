import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { findOrCreateChildPersonInOrg } from "@/lib/admin/person/findOrCreateChildPersonInOrg";

/**
 * Ensure a child customer_member has a linked `person_id` (find-or-create).
 * Used by Surfaces → Runtime avatar upload when inquiry evidence lacks person_id.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!id?.trim()) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: member, error } = await supabase
        .from("customer_members")
        .select("id, org_id, customer_id, person_id, first_name, last_name, display_name, dob, relationship")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!member) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const row = member as {
        id: string;
        customer_id: string | null;
        person_id: string | null;
        first_name: string | null;
        last_name: string | null;
        display_name: string | null;
        dob: string | null;
        relationship: string | null;
    };

    const existing = typeof row.person_id === "string" ? row.person_id.trim() : "";
    if (existing) {
        return NextResponse.json({ person_id: existing, created: false });
    }

    if (!row.customer_id) {
        return NextResponse.json({ error: "Member has no household" }, { status: 400 });
    }

    let first = (row.first_name ?? "").trim();
    let last = (row.last_name ?? "").trim();
    if (!first || !last) {
        const parts = (row.display_name ?? "").trim().split(/\s+/).filter(Boolean);
        if (!first && parts[0]) first = parts[0]!;
        if (!last && parts.length > 1) last = parts.slice(1).join(" ");
    }
    if (!first || !last) {
        return NextResponse.json(
            { error: "Child needs a first and last name before a photo can be saved." },
            { status: 400 },
        );
    }

    const resolved = await findOrCreateChildPersonInOrg(supabase, {
        orgId: ctx.orgId,
        customerId: row.customer_id,
        firstName: first,
        lastName: last,
        dob: row.dob ? String(row.dob).slice(0, 10) : null,
    });
    if (!resolved?.person_id) {
        return NextResponse.json({ error: "Could not resolve child person identity." }, { status: 500 });
    }

    const { error: updateErr } = await supabase
        .from("customer_members")
        .update({ person_id: resolved.person_id })
        .eq("id", row.id)
        .eq("org_id", ctx.orgId);
    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({
        person_id: resolved.person_id,
        created: resolved.created,
        source: resolved.source,
    });
}
