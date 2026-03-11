import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from "next/server";
import { evaluateDeletionEligibility } from "@/lib/admin/deletionEligibility";

/** DELETE: hard delete discount code (admin only). Enforces lifecycle eligibility. */
export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const eligibility = await evaluateDeletionEligibility("discounts", id, {});
    if (!eligibility.allowed) {
        return NextResponse.json(
            { error: eligibility.reason, recommended_action: eligibility.recommended_action },
            { status: 409 }
        );
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("discount_codes").delete().eq("id", id);
    if (error) {
        const msg = error.code === "23503" ? "Cannot delete: discount code is in use." : error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  try {
    const { id } = await context.params;
    const supabase = createAdminClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("discount_codes")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

