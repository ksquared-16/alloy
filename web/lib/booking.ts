/**
 * Helper function to build booking URL with prefill parameters.
 * Ensures GHL can match existing contact instead of creating duplicates.
 * 
 * @param params - Contact information for booking prefill
 * @returns Booking URL with query parameters
 */

/**
 * Get the booking path from environment variable.
 * Safe for client-side usage.
 * Defaults to "/book" so production matches staging (GHL /book flow + campaign handoff).
 * Override with NEXT_PUBLIC_BOOKING_PATH only when intentionally routing elsewhere (e.g. /book-v2).
 */
export function getBookingPath(): string {
  // Safe for client: process.env.NEXT_PUBLIC_* vars are replaced at build time
  return process.env.NEXT_PUBLIC_BOOKING_PATH || "/book";
}

const BOOKING_ROUTE = getBookingPath();

export function buildBookingUrl(params: {
    phone: string;
    email: string;
    firstName: string;
    lastName: string;
    estimatedPrice?: number;
}): string {
    const { phone, email, firstName, lastName, estimatedPrice } = params;

    // Normalize phone to E.164 format (+1##########)
    let normalizedPhone = phone.trim();
    const digits = normalizedPhone.replace(/\D/g, "");
    if (digits.length === 10) {
        normalizedPhone = "+1" + digits;
    } else if (!normalizedPhone.startsWith("+")) {
        normalizedPhone = "+" + digits;
    }

    // Build query parameters
    const queryParams = new URLSearchParams({
        phone: normalizedPhone,
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
    });

    // Add estimated_price if provided
    if (estimatedPrice !== undefined && estimatedPrice > 0) {
        queryParams.append("estimated_price", estimatedPrice.toFixed(2));
    }

    // Build full URL
    const baseUrl = BOOKING_ROUTE;
    return `${baseUrl}?${queryParams.toString()}`;
}

