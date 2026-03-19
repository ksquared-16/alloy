import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { validateDiscountProgramForPublicBooking } from "@/lib/book-v2/validateDiscountProgram";

/**
 * POST /api/book-v2/validate-promo
 * Validates promo codes against discount_programs (view discount_programs_admin_v), not legacy discount_codes.
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            code?: string;
            email?: string | null;
            phone?: string | null;
            quote_subtotal?: number;
            vertical_key?: string;
            booking_attempt_id?: string | null;
        };

        const code = typeof body.code === "string" ? body.code : "";
        const quote_subtotal = Number(body.quote_subtotal);
        const vertical_key = typeof body.vertical_key === "string" && body.vertical_key.trim() ? body.vertical_key.trim() : "cleaning";

        if (!code.trim()) {
            return NextResponse.json({ valid: false, reason: "invalid", message: "Promo code is required." });
        }
        if (!Number.isFinite(quote_subtotal) || quote_subtotal <= 0) {
            return NextResponse.json({
                valid: false,
                reason: "invalid",
                message: "A valid quote total is required to apply this promo.",
            });
        }

        const supabase = createServiceRoleClient();
        const result = await validateDiscountProgramForPublicBooking(supabase, {
            code,
            quote_subtotal,
            vertical_key,
            email: body.email,
            phone: body.phone,
        });

        if (!result.valid) {
            if (result.reason === "discount_already_used") {
                return NextResponse.json(
                    {
                        valid: false,
                        reason: result.reason,
                        message: result.message,
                        booking_attempt_id: body.booking_attempt_id ?? undefined,
                    },
                    { status: 409 }
                );
            }
            if (result.reason === "service_error") {
                return NextResponse.json(
                    {
                        valid: false,
                        reason: result.reason,
                        message: result.message,
                        booking_attempt_id: body.booking_attempt_id ?? undefined,
                    },
                    { status: 503 }
                );
            }
            return NextResponse.json({
                valid: false,
                reason: result.reason,
                message: result.message,
                booking_attempt_id: body.booking_attempt_id ?? undefined,
            });
        }

        return NextResponse.json({
            valid: true,
            discount_program_id: result.discount_program_id,
            discount_program_code: result.discount_program_code,
            discount_program_name: result.discount_program_name,
            program_type: result.program_type,
            benefit_type: result.benefit_type,
            applies_to: result.applies_to,
            discount_amount: result.discount_amount,
            quote_total: result.quote_total,
            discount_code_id: result.discount_code_id,
            metadata: result.metadata,
        });
    } catch (e) {
        console.error("[VALIDATE_PROMO]", e);
        return NextResponse.json(
            { valid: false, reason: "service_error", message: e instanceof Error ? e.message : "Validation failed" },
            { status: 500 }
        );
    }
}
