/**
 * Booking flow: ensure a customer address location exists (create or reuse by address + postal_code).
 * Used when confirming a booking so job/schedule can link to location_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EnsureCustomerAddressLocationParams = {
  org_id: string | null;
  customer_id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

/**
 * Find or create a customer-owned address location. Deduplicates by customer_id + normalized address_line1 + postal_code.
 * Returns location id or null if creation failed / address missing.
 */
export async function ensureCustomerAddressLocation(
  supabase: SupabaseClient,
  params: EnsureCustomerAddressLocationParams
): Promise<string | null> {
  const { org_id, customer_id, address_line1, city, state, postal_code } = params;
  const a1 = (address_line1 ?? "").trim();
  const pc = (postal_code ?? "").trim();

  // If no address at all, we could still create a "Primary" placeholder; for minimal change we require at least address or postal_code to create.
  if (!a1 && !pc) {
    return null;
  }

  // Dedupe: find existing location for this customer with same address_line1 + postal_code (case/trim normalized)
  const { data: list } = await supabase
    .from("locations")
    .select("id, address_line1, postal_code")
    .eq("org_id", org_id)
    .eq("customer_id", customer_id)
    .eq("location_type", "address");

  const match = (list ?? []).find(
    (row: { address_line1?: string | null; postal_code?: string | null }) =>
      (row.address_line1 ?? "").trim() === a1 && (row.postal_code ?? "").trim() === pc
  );
  if (match) {
    return (match as { id: string }).id;
  }

  // Is this the first address location for this customer? (then is_primary = true)
  const { count: addrCount } = await supabase
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer_id)
    .eq("location_type", "address");
  const isFirst = (addrCount ?? 0) === 0;

  const label =
    (city && pc) ? `${city} ${pc}`.trim()
    : (city ?? pc) ? (city ?? pc).trim()
    : "Primary";

  const insert: Record<string, unknown> = {
    org_id: org_id ?? undefined,
    customer_id,
    vendor_id: null,
    location_type: "address",
    label,
    is_primary: isFirst,
    address_line1: a1 || null,
    city: (city ?? "").trim() || null,
    state: (state ?? "").trim() || null,
    postal_code: pc || null,
    metadata: {},
  };

  const { data: created, error } = await supabase
    .from("locations")
    .insert(insert)
    .select("id")
    .single();

  if (error) {
    console.error("[BOOKING_LOCATIONS] ensureCustomerAddressLocation insert failed", error);
    return null;
  }
  return (created as { id: string })?.id ?? null;
}
