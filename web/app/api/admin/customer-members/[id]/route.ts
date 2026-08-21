import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { applyCustomerMemberMutationPatch } from "@/lib/admin/customerMemberPatch";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";

const CUSTOMER_MEMBER_SELECT =
    "id, org_id, customer_id, person_id, display_name, relationship, first_name, last_name, dob, is_active, metadata, created_at, updated_at";

/** GET: single customer_member by id with merged native + config profile fields. Admin + ops can read. */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("customer_members")
        .select(CUSTOMER_MEMBER_SELECT)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const profileByMember = await loadCustomerMemberProfileFieldsByMemberId(supabase, ctx.orgId, [id]);
    const profile = profileByMember.get(id) ?? {};

    const out: Record<string, unknown> = {
        ...(row as Record<string, unknown>),
        preferred_name: profile.preferred_name ?? null,
        gender: profile.gender ?? null,
        allergies: profile.allergies ?? null,
        medical_notes: profile.medical_notes ?? null,
        special_instructions: profile.special_instructions ?? null,
    };

    const customerId = (row as { customer_id: string | null }).customer_id;
    if (customerId) {
        const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
        out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
    } else {
        out._customer_name = null;
    }
    return NextResponse.json(out);
}

/** PATCH: update customer_member native columns + customer_member config field_values. Admin only. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const tRequest = Date.now();
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

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();

    /*
     * SAVE TAIL SPANS. The operator's edit acknowledges locally in ~90 ms, but the authoritative
     * response took ~3.2 s, and "the server is slow" is not an answer a fix can be built on. These
     * spans separate AUTHORITATIVE PERSISTENCE from the post-write work that only shapes the
     * response body, and are surfaced on `x-alloy-patch-spans` so the browser harness can read them
     * without a server log. Diagnostic only — they change no behaviour.
     */
    const tStart = Date.now();
    const spans: Record<string, number> = { auth_to_write: tStart - tRequest };

    const tWrite = Date.now();
    const applied = await applyCustomerMemberMutationPatch({
        supabase,
        orgId: ctx.orgId,
        memberId: id,
        body,
    });
    spans.write_ms = Date.now() - tWrite;
    if (applied.ok && applied.spans) Object.assign(spans, applied.spans);
    if (!applied.ok) {
        return NextResponse.json({ error: applied.error }, { status: applied.status ?? 500 });
    }

    /*
     * POST-WRITE READBACKS.
     *
     * Measured: authoritative persistence completed at ~1.9 s, and a further ~1.44 s (43% of the
     * response) went on re-reading the row to shape the response BODY. Neither read carries an
     * invariant, an audit guarantee, or transaction work — the write is already durable when they
     * begin. Every caller of this endpoint in the codebase discards the body (it is parsed only to
     * surface `error` on failure), so the operator was waiting on a projection nobody reads.
     *
     * `Prefer: return=minimal` is the standard HTTP way to say so. The default response is
     * UNCHANGED, so any consumer that does want the row still gets it; only callers that opt in skip
     * the readback. And when the readback does run, its two independent queries now run
     * concurrently instead of serially — the operator was paying their SUM.
     */
    const preferMinimal = /return=minimal/i.test(request.headers.get("prefer") ?? "");
    if (preferMinimal) {
        spans.readback_ms = 0;
        spans.total_ms = Date.now() - tRequest;
        return NextResponse.json({ id }, { headers: { "x-alloy-patch-spans": JSON.stringify(spans) } });
    }

    const tRead = Date.now();
    const [profileByMember, rowRes] = await Promise.all([
        loadCustomerMemberProfileFieldsByMemberId(supabase, ctx.orgId, [id]),
        supabase
            .from("customer_members")
            .select(CUSTOMER_MEMBER_SELECT)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .single(),
    ]);
    spans.readback_ms = Date.now() - tRead;
    const profile = profileByMember.get(id) ?? {};
    const row = rowRes.data;

    spans.total_ms = Date.now() - tRequest;
    return NextResponse.json(
        {
            ...(row ?? { id }),
            preferred_name: profile.preferred_name ?? null,
            gender: profile.gender ?? null,
            allergies: profile.allergies ?? null,
            medical_notes: profile.medical_notes ?? null,
            special_instructions: profile.special_instructions ?? null,
        },
        { headers: { "x-alloy-patch-spans": JSON.stringify(spans) } }
    );
}

/** DELETE: hard delete customer_member. Admin only. */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
        .from("customer_members")
        .delete()
        .eq("id", id)
        .eq("org_id", ctx.orgId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
