import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";
import { findOrCreateChildPersonInOrg } from "@/lib/admin/person/findOrCreateChildPersonInOrg";
import { createHouseholdChildMember } from "@/lib/records/childMemberAuthority";

/** GET: list customer_members for org. Optional ?customer_id= filter. Admin + ops can read. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const customerId = request.nextUrl.searchParams.get("customer_id")?.trim() || undefined;
    const supabase = createAdminClient();

    let query = supabase
        .from("customer_members")
        .select(
            "id, customer_id, person_id, display_name, relationship, first_name, last_name, dob, is_active, created_at, updated_at"
        )
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false });

    if (customerId) {
        query = query.eq("customer_id", customerId);
    }

    const { data: rows, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const memberIds = (rows ?? []).map((r) => (r as { id: string }).id);
    const customerIds = [...new Set((rows ?? []).map((r) => (r as { customer_id: string }).customer_id).filter(Boolean))];

    const [customerRows, relationshipRows, linkCounts] = await Promise.all([
        customerIds.length
            ? supabase.from("customers").select("id, name").in("id", customerIds)
            : { data: [] as { id: string; name: string | null }[] },
        supabase.from("customer_member_relationship_types").select("key, label").eq("org_id", ctx.orgId).eq("is_active", true),
        memberIds.length
            ? supabase.from("customer_member_contacts").select("customer_member_id").eq("org_id", ctx.orgId).in("customer_member_id", memberIds)
            : { data: [] as { customer_member_id: string }[] },
    ]);

    const customerMap = new Map((customerRows.data ?? []).map((c) => [c.id, c.name ?? null]));
    const relationshipMap = new Map((relationshipRows.data ?? []).map((r: { key: string; label: string | null }) => [r.key, r.label ?? r.key]));
    const countByMember = new Map<string, number>();
    for (const link of linkCounts.data ?? []) {
        const mid = (link as { customer_member_id: string }).customer_member_id;
        countByMember.set(mid, (countByMember.get(mid) ?? 0) + 1);
    }

    function ageFromDob(dob: string | null): number | null {
        if (!dob || !dob.trim()) return null;
        const d = new Date(dob);
        if (Number.isNaN(d.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - d.getFullYear();
        if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
        return age >= 0 ? age : null;
    }

    const members = (rows ?? []).map((r) => {
        const id = (r as { id: string }).id;
        const relationshipKey = (r as { relationship: string | null }).relationship ?? null;
        const created_at = (r as { created_at: string }).created_at;
        const updated_at = (r as { updated_at?: string | null }).updated_at ?? null;
        return {
            id,
            customer_id: (r as { customer_id: string }).customer_id,
            person_id: (r as { person_id?: string | null }).person_id ?? null,
            display_name: (r as { display_name: string | null }).display_name ?? null,
            relationship: relationshipKey,
            first_name: (r as { first_name: string | null }).first_name ?? null,
            last_name: (r as { last_name: string | null }).last_name ?? null,
            dob: (r as { dob: string | null }).dob ?? null,
            is_active: (r as { is_active: boolean }).is_active ?? true,
            created_at,
            updated_at,
            _customer_name: customerMap.get((r as { customer_id: string }).customer_id) ?? null,
            _relationship_label: relationshipKey ? (relationshipMap.get(relationshipKey) ?? relationshipKey) : null,
            _age: ageFromDob((r as { dob: string | null }).dob),
            _linked_contacts_count: countByMember.get(id) ?? 0,
            _updated: updated_at || created_at,
        };
    });

    return NextResponse.json({ members });
}

/** POST: create customer_member. Admin + ops can create (matches OCM link path). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    let body: {
        customer_id?: string;
        display_name?: string;
        relationship?: string;
        first_name?: string;
        last_name?: string;
        dob?: string | null;
        is_active?: boolean;
        metadata?: Record<string, unknown>;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const customer_id = typeof body.customer_id === "string" ? body.customer_id.trim() : "";
    if (!customer_id) {
        return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    }

    const display_name = typeof body.display_name === "string" ? body.display_name.trim() : "";
    if (!display_name) {
        return NextResponse.json({ error: "display_name is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: customer, error: custErr } = await supabase
        .from("customers")
        .select("id")
        .eq("id", customer_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (custErr || !customer) {
        return NextResponse.json({ error: "Customer not found or not in your org" }, { status: 400 });
    }

    const relationship =
        typeof body.relationship === "string" ? body.relationship.trim().toLowerCase() || null : null;
    const first_name = typeof body.first_name === "string" ? body.first_name.trim() || null : null;
    const last_name = typeof body.last_name === "string" ? body.last_name.trim() || null : null;
    const dob = typeof body.dob === "string" && body.dob.trim() ? body.dob.trim().slice(0, 10) : null;

    let person_id: string | null = null;
    if (relationship === "child" && first_name && last_name) {
        const childPerson = await findOrCreateChildPersonInOrg(supabase, {
            orgId: ctx.orgId,
            customerId: customer_id,
            firstName: first_name,
            lastName: last_name,
            dob,
        });
        person_id = childPerson?.person_id ?? null;
        if (!person_id) {
            return NextResponse.json(
                { error: "Could not create or resolve child person identity." },
                { status: 500 },
            );
        }
    }

    const RESPONSE_COLUMNS =
        "id, customer_id, person_id, display_name, relationship, first_name, last_name, dob, is_active, created_at";
    const callerMetadata =
        body.metadata && typeof body.metadata === "object" ? { ...body.metadata } : {};
    const callerSource =
        typeof callerMetadata.source === "string" && callerMetadata.source.trim()
            ? callerMetadata.source.trim()
            : "customer_member_create";
    delete callerMetadata.source;

    let inserted: Record<string, unknown> | null = null;

    if (relationship === "child") {
        // ONE child-member write authority. This route is the drawer's Add Child /
        // Add Sibling path; it kept its own insert and its own answer to "is this
        // child already here", which is exactly the fragmentation the authority ends.
        // Identity is still resolved above — the authority never guesses one.
        try {
            const { member } = await createHouseholdChildMember(supabase, {
                orgId: ctx.orgId,
                customerId: customer_id,
                personId: person_id,
                displayName: display_name,
                firstName: first_name,
                lastName: last_name,
                dob,
                isActive: body.is_active !== false,
                source: callerSource,
                metadata: callerMetadata,
            });
            const { data: full } = await supabase
                .from("customer_members")
                .select(RESPONSE_COLUMNS)
                .eq("org_id", ctx.orgId)
                .eq("id", member.id)
                .maybeSingle();
            inserted = (full as Record<string, unknown> | null) ?? null;
        } catch (e) {
            return NextResponse.json(
                { error: e instanceof Error ? e.message : "Could not create child record" },
                { status: 500 },
            );
        }
    } else {
        const { data, error: insertErr } = await supabase
            .from("customer_members")
            .insert({
                org_id: ctx.orgId,
                customer_id,
                display_name,
                relationship,
                first_name,
                last_name,
                dob,
                person_id,
                is_active: body.is_active !== false,
                metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : null,
            })
            .select(RESPONSE_COLUMNS)
            .single();
        if (insertErr) {
            return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
        inserted = data as Record<string, unknown>;
    }

    if (!inserted) {
        return NextResponse.json({ error: "Could not create customer member" }, { status: 500 });
    }

    const ins = inserted as { id: string; customer_id: string; display_name?: string | null };
    try {
        await emitEvent({
            org_id: ctx.orgId,
            event_type: "customer_member_created",
            entity_type: "customer_members",
            entity_id: ins.id,
            payload: {
                customer_id: ins.customer_id,
                display_name: ins.display_name ?? null,
                actor_user_id: ctx.userId,
            },
        });
    } catch (e) {
        console.warn("[customer-members POST] emitEvent", e instanceof Error ? e.message : e);
    }

    return NextResponse.json(inserted);
}
