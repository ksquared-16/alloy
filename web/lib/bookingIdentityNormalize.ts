/**
 * Single source of truth for book-v2 / booking resolver email + phone normalization.
 * Phone variants help match legacy rows stored as 10 digits, +1…, 1…, or raw input.
 */

/** Trim + lowercase (empty → ""). */
export function normalizeBookingEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * E.164-style: strip to digits, then + prefix.
 * US: 10 digits → +1…; 11 starting with 1 → +1….
 */
export function normalizeBookingPhone(phone: string): string {
  const trimmed = String(phone ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return trimmed;
  }

  if (trimmed.startsWith("+")) {
    return "+" + digits;
  }

  if (digits.length === 10) {
    return "+1" + digits;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return "+" + digits;
  }

  return "+" + digits;
}

/** Last 10 digits for logs (US-centric tail). */
export function phoneDigitsTailForLog(phoneOrDigits: string): string {
  const d = String(phoneOrDigits ?? "").replace(/\D/g, "");
  if (!d) return "(none)";
  const t = d.length >= 10 ? d.slice(-10) : d;
  return t.length >= 4 ? `…${t.slice(-4)}` : "(short)";
}

/**
 * Ordered unique strings to try for contacts.phone equality (legacy formats in DB).
 */
export function bookingPhoneLookupVariants(rawInput: string): string[] {
  const trimmed = String(rawInput ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");
  const canonical = normalizeBookingPhone(trimmed);
  const out: string[] = [];

  const add = (v: string | null | undefined) => {
    const s = v != null ? String(v).trim() : "";
    if (s && !out.includes(s)) out.push(s);
  };

  add(canonical);
  if (digits.length === 10) {
    add("+1" + digits);
    add("1" + digits);
    add(digits);
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    add("+" + digits);
    add(digits);
    add(digits.slice(1));
  }
  add(trimmed);

  return out;
}
