import { NextRequest, NextResponse } from "next/server";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

/**
 * POST /api/book-v2/ensure-customer
 * Body: { person_id: string }
 * Returns: { ok: true, customer_id: string, person_id: string } — person-native; no contact required.
 */
export async function POST(request: NextRequest) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
        const body = await request.json().catch(() => ({}));
        const person_id = body.person_id;
        if (!person_id || typeof person_id !== "string" || !person_id.trim()) {
            console.log(
                `[BOOK_V2_PERF] ensure_customer total_ms=${Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0)} status=400 reason=missing_person_id`
            );
            return NextResponse.json({ ok: false, message: "person_id is required" }, { status: 400 });
        }
        const supabase = createServiceRoleClient();
        const vertical = await supabase.from("verticals").select("id").eq("slug", "cleaning").eq("is_active", true).limit(1).maybeSingle();
        const verticalId = vertical.data?.id ?? null;
        if (!verticalId) {
            console.log(
                `[BOOK_V2_PERF] ensure_customer total_ms=${Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0)} status=500 reason=no_vertical`
            );
            return NextResponse.json({ ok: false, message: "Vertical not found" }, { status: 500 });
        }
        const orgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        const { customer_id } = await ensureCustomerForPersonNative(supabase, person_id.trim(), {
            vertical_id: verticalId,
            org_id: orgId,
        });
        const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
        console.log(`[BOOK_V2_PERF] ensure_customer total_ms=${durationMs} person_id=${String(person_id).slice(0, 8)}…`);
        return NextResponse.json({
            ok: true,
            customer_id,
            person_id: person_id.trim(),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Ensure customer failed";
        console.error("[BOOK_V2_ENSURE_CUSTOMER]", msg, err);
        const codeMatch = msg.match(/\(code:\s*([^)]+)\)/);
        return NextResponse.json(
            {
                ok: false,
                message: msg,
                ...(codeMatch && { error_code: codeMatch[1] }),
            },
            { status: 500 }
        );
    }
}
