import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import { emitEvent } from "@/lib/emitEvent";

type DiscountBody = {
  opportunity_id: string;
  /** When true, clear discount fields and reset quote_total to quote_subtotal (or inferred subtotal). */
  clear?: boolean;
  quote_subtotal?: number;
  quote_total?: number;
  discount_amount?: number;
  discount_code_id?: string | null;
  /** Discount program (new model); optional when legacy code-only validation. */
  discount_program_id?: string | null;
  discount_code?: string | null;
};

function inferredSubtotalFromRow(row: {
  quote_subtotal?: number | null;
  estimated_price_cents?: number | null;
  metadata?: Record<string, unknown> | null;
}): number | null {
  if (row.quote_subtotal != null && !Number.isNaN(Number(row.quote_subtotal))) {
    return Number(row.quote_subtotal);
  }
  if (row.estimated_price_cents != null) {
    return Math.round(Number(row.estimated_price_cents)) / 100;
  }
  const qo = row.metadata?.quote_output as { estimated_price?: number } | undefined;
  if (qo?.estimated_price != null && !Number.isNaN(Number(qo.estimated_price))) {
    return Number(qo.estimated_price);
  }
  return null;
}

/**
 * POST /api/book-v2/opportunity-discount
 * Persists validated discount to the opportunity before payment (parallel to external /discounts/validate).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DiscountBody;
    const opportunityId = body.opportunity_id?.trim();
    if (!opportunityId) {
      return NextResponse.json({ ok: false, message: "opportunity_id is required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("opportunities")
      .select("id, org_id, quote_subtotal, estimated_price_cents, metadata")
      .eq("id", opportunityId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ ok: false, message: "Opportunity not found" }, { status: 404 });
    }

    const row = existing as {
      org_id?: string | null;
      quote_subtotal?: number | null;
      estimated_price_cents?: number | null;
      metadata?: Record<string, unknown> | null;
    };
    const orgId = row.org_id != null && String(row.org_id).trim() ? String(row.org_id).trim() : null;

    if (body.clear === true) {
      const sub = inferredSubtotalFromRow(row);
      const update: Record<string, unknown> = {
        discount_amount: null,
        discount_code_id: null,
        discount_program_id: null,
        discount_code: null,
        updated_at: new Date().toISOString(),
      };
      if (sub != null) {
        update.quote_total = sub;
        const cents = Math.round(sub * 100);
        update.estimated_price_cents = cents;
        update.monetary_value_cents = cents;
      }
      await normalizeOpportunityWritePayload(supabase, update, "book-v2/opportunity-discount:clear");
      const { error } = await supabase.from("opportunities").update(update).eq("id", opportunityId);
      if (error) {
        console.error("[BOOK_V2_OPP_DISCOUNT] clear failed", error.message);
        return NextResponse.json({ ok: false, message: "Failed to clear discount" }, { status: 500 });
      }
      if (orgId) {
        try {
          await emitEvent({
            org_id: orgId,
            event_type: "opportunity_discount_cleared",
            entity_type: "opportunities",
            entity_id: opportunityId,
            payload: { source: "book-v2/opportunity-discount", quote_total_after: update.quote_total ?? null },
          });
        } catch (e) {
          console.warn("[BOOK_V2_OPP_DISCOUNT] emit clear", e instanceof Error ? e.message : e);
        }
      }
      return NextResponse.json({ ok: true, cleared: true });
    }

    const quote_subtotal = Number(body.quote_subtotal);
    const quote_total = Number(body.quote_total);
    const discount_amount = Number(body.discount_amount);
    if (!Number.isFinite(quote_subtotal) || quote_subtotal <= 0) {
      return NextResponse.json({ ok: false, message: "quote_subtotal is required" }, { status: 400 });
    }
    if (!Number.isFinite(quote_total) || quote_total < 0) {
      return NextResponse.json({ ok: false, message: "quote_total is required" }, { status: 400 });
    }
    if (!Number.isFinite(discount_amount) || discount_amount < 0) {
      return NextResponse.json({ ok: false, message: "discount_amount is required" }, { status: 400 });
    }

    const hasDiscount = discount_amount > 0 || quote_total < quote_subtotal;
    const discount_code_id = body.discount_code_id?.trim() || null;
    const discount_program_id = body.discount_program_id?.trim() || null;
    if (hasDiscount && !discount_code_id && !discount_program_id) {
      return NextResponse.json(
        { ok: false, message: "discount_program_id or discount_code_id required when discount is applied" },
        { status: 400 }
      );
    }
    const totalCents = Math.round(quote_total * 100);

    const update: Record<string, unknown> = {
      quote_subtotal,
      quote_total,
      discount_amount: discount_amount > 0 ? discount_amount : null,
      discount_code: body.discount_code?.trim() || null,
      discount_code_id: discount_code_id,
      discount_program_id: discount_program_id,
      estimated_price_cents: totalCents,
      monetary_value_cents: totalCents,
      updated_at: new Date().toISOString(),
    };

    await normalizeOpportunityWritePayload(supabase, update, "book-v2/opportunity-discount:apply");
    const { error } = await supabase.from("opportunities").update(update).eq("id", opportunityId);
    if (error) {
      console.error("[BOOK_V2_OPP_DISCOUNT] update failed", error.message);
      return NextResponse.json({ ok: false, message: "Failed to save discount" }, { status: 500 });
    }

    if (orgId) {
      try {
        await emitEvent({
          org_id: orgId,
          event_type: "opportunity_discount_applied",
          entity_type: "opportunities",
          entity_id: opportunityId,
          payload: {
            source: "book-v2/opportunity-discount",
            quote_subtotal,
            quote_total,
            discount_amount: discount_amount > 0 ? discount_amount : null,
            discount_code_id,
            discount_program_id,
          },
        });
      } catch (e) {
        console.warn("[BOOK_V2_OPP_DISCOUNT] emit apply", e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[BOOK_V2_OPP_DISCOUNT]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "opportunity-discount failed" },
      { status: 500 }
    );
  }
}
