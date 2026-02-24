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
 * Find or create a customer-owned address location. Deduplicates by customer_id + address1 + (postal_code if present, else city).
 * Returns location id or null if creation failed / address missing.
 */
export async function ensureCustomerAddressLocation(
  supabase: SupabaseClient,
  params: EnsureCustomerAddressLocationParams
): Promise<string | null> {
  const { org_id, customer_id, address_line1, city, state, postal_code } = params;
  const a1 = (address_line1 ?? "").trim();
  const pc = (postal_code ?? "").trim();
  const cityNorm = (city ?? "").trim();

  // If no address at all, we could still create a "Primary" placeholder; for minimal change we require at least address or postal_code to create.
  if (!a1 && !pc) {
    return null;
  }

  // Dedupe: by address1 + postal_code when postal_code present; else by address1 + city
  const { data: list } = await supabase
    .from("locations")
    .select("id, address1, postal_code, city")
    .eq("org_id", org_id)
    .eq("customer_id", customer_id)
    .eq("location_type", "address");

  const match = (list ?? []).find((row: { address1?: string | null; postal_code?: string | null; city?: string | null }) => {
    const rowA1 = (row.address1 ?? "").trim();
    const rowPc = (row.postal_code ?? "").trim();
    const rowCity = (row.city ?? "").trim();
    if (pc) {
      return rowA1 === a1 && rowPc === pc;
    }
    return rowA1 === a1 && rowCity === cityNorm;
  });
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

  const label = a1 ? a1 : "Primary address";

  const insert: Record<string, unknown> = {
    org_id: org_id ?? undefined,
    customer_id,
    vendor_id: null,
    location_type: "address",
    label,
    is_primary: isFirst,
    address1: a1 || null,
    address2: null,
    city: cityNorm || null,
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
