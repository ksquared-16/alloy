"use client";

/**
 * Uses the same external discount validation as /book-v2 (NEXT_PUBLIC_API_BASE_URL).
 * The program code FIRSTFREE4X60 must be accepted by that API (or linked legacy code).
 */

export type ValidatedDiscountPrefill = {
  discount_code: string;
  discount_code_id: string;
  discount_amount: number;
  quote_total: number;
};

export async function validateDiscountCodeForBooking(params: {
  code: string;
  email?: string | null;
  phone?: string | null;
  quoteSubtotal: number;
  bookingAttemptId?: string;
}): Promise<{ ok: true; prefill: ValidatedDiscountPrefill } | { ok: false; message: string; status?: number }> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
  const attemptId =
    params.bookingAttemptId ||
    (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `campaign-${Date.now()}`);

  try {
    const response = await fetch(`${apiBaseUrl}/discounts/validate`, {
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
      discount_code_id?: string;
      discount_amount?: number;
      quote_total?: number;
      message?: string;
      reason?: string;
    };

    if (response.status === 409) {
      return {
        ok: false,
        message: data.message ?? "That promo code has already been used for this customer.",
        status: 409,
      };
    }

    if (data.valid === true && data.discount_code_id && typeof data.discount_amount === "number") {
      return {
        ok: true,
        prefill: {
          discount_code: params.code.trim().toUpperCase(),
          discount_code_id: data.discount_code_id,
          discount_amount: data.discount_amount,
          quote_total: typeof data.quote_total === "number" ? data.quote_total : params.quoteSubtotal - data.discount_amount,
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
