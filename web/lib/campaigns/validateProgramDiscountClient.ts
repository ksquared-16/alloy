"use client";

/**
 * Validates promos via Next `/api/book-v2/validate-promo` (discount_programs), not legacy Python /discounts/validate.
 */

export type ValidatedDiscountPrefill = {
    discount_program_id: string;
    discount_program_code: string;
    discount_program_name: string | null;
    program_type: string | null;
    benefit_type: string | null;
    applies_to: string | null;
    discount_amount: number;
    quote_total: number;
    /** Legacy link only — null for program-only promos */
    discount_code_id: string | null;
    /** Same as public code (program code) for UI + storage */
    discount_code: string;
    metadata?: {
        primary_benefit_type: string | null;
        commitment_rule_id: string | null;
        enrollment_mode: string | null;
        required_service_count: number | null;
        timeframe_days: number | null;
    };
};

export async function validateDiscountCodeForBooking(params: {
    code: string;
    email?: string | null;
    phone?: string | null;
    quoteSubtotal: number;
    bookingAttemptId?: string;
}): Promise<{ ok: true; prefill: ValidatedDiscountPrefill } | { ok: false; message: string; status?: number }> {
    const attemptId =
        params.bookingAttemptId ||
        (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `campaign-${Date.now()}`);

    try {
        const response = await fetch("/api/book-v2/validate-promo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: params.code.trim(),
                email: params.email?.trim() || undefined,
                phone: params.phone?.trim() || undefined,
                quote_subtotal: params.quoteSubtotal,
                vertical_key: "cleaning",
                booking_attempt_id: attemptId,
            }),
        });

        const data = (await response.json()) as {
            valid?: boolean;
            discount_program_id?: string;
            discount_program_code?: string;
            discount_program_name?: string | null;
            program_type?: string | null;
            benefit_type?: string | null;
            applies_to?: string | null;
            discount_code_id?: string | null;
            discount_amount?: number;
            quote_total?: number;
            message?: string;
            reason?: string;
            metadata?: ValidatedDiscountPrefill["metadata"];
        };

        if (response.status === 409) {
            return {
                ok: false,
                message: data.message ?? "That promo code has already been used for this customer.",
                status: 409,
            };
        }

        if (data.valid === true && data.discount_program_id && typeof data.discount_amount === "number") {
            const programCode = (data.discount_program_code || params.code).trim().toUpperCase();
            return {
                ok: true,
                prefill: {
                    discount_program_id: data.discount_program_id,
                    discount_program_code: programCode,
                    discount_program_name: data.discount_program_name ?? null,
                    program_type: data.program_type ?? null,
                    benefit_type: data.benefit_type ?? null,
                    applies_to: data.applies_to ?? null,
                    discount_amount: data.discount_amount,
                    quote_total: typeof data.quote_total === "number" ? data.quote_total : params.quoteSubtotal - data.discount_amount,
                    discount_code_id: data.discount_code_id ?? null,
                    discount_code: programCode,
                    metadata: data.metadata,
                },
            };
        }

        return {
            ok: false,
            message:
                data.message ??
                (data.reason === "discount_already_used"
                    ? "That promo code has already been used for this customer."
                    : "Invalid or unavailable promo code."),
            status: response.status,
        };
    } catch (e) {
        return {
            ok: false,
            message: e instanceof Error ? e.message : "Could not validate promo code. Check your connection and try again.",
        };
    }
}
