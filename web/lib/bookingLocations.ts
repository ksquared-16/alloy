/**
 * Booking flow: ensure a customer address location exists (create or reuse by address + postal_code).
 * Used when confirming a booking so job/schedule can link to location_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";

export type EnsureCustomerAddressLocationParams = {
  org_id: string | null;
  customer_id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  /** Stable key; matches option_set access_method */
  access_method_key?: string | null;
  /** @deprecated Prefer access_method_key */
  access_method_id?: string | null;
  access_code?: string | null;
  has_pets?: boolean | null;
  access_notes?: string | null;
};

/**
 * Find or create a customer-owned address location. Deduplicates by customer_id + address1 + (postal_code if present, else city).
 * Returns location id or null if creation failed / address missing.
 */
export async function ensureCustomerAddressLocation(
  supabase: SupabaseClient,
  params: EnsureCustomerAddressLocationParams
): Promise<string | null> {
  const {
    org_id,
    customer_id,
    address_line1,
    city,
    state,
    postal_code,
    access_method_key,
    access_method_id,
    access_code,
    has_pets,
    access_notes,
  } = params;
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

  const addressMatches = (row: { address1?: string | null; postal_code?: string | null; city?: string | null }) => {
    const rowA1 = (row.address1 ?? "").trim();
    const rowPc = (row.postal_code ?? "").trim();
    const rowCity = (row.city ?? "").trim();
    if (pc) {
      return rowA1 === a1 && rowPc === pc;
    }
    return rowA1 === a1 && rowCity === cityNorm;
  };

  const match = (list ?? []).find(addressMatches);
  if (match) {
    const existingId = (match as { id: string }).id;
    const patch: Record<string, unknown> = {};
    if (access_method_key !== undefined) {
      patch.access_method_key = access_method_key;
      patch.access_method_id = null;
    } else if (access_method_id !== undefined) {
      patch.access_method_id = access_method_id;
    }
    if (access_code !== undefined) {
      patch.access_code = access_code != null && String(access_code).trim() !== "" ? String(access_code).trim() : null;
    }
    if (has_pets === true || has_pets === false) patch.has_pets = has_pets;
    if (access_notes !== undefined) {
      patch.access_notes = access_notes != null && String(access_notes).trim() !== "" ? String(access_notes).trim() : null;
    }
    if (Object.keys(patch).length > 0) {
      const { error: patchErr } = await supabase.from("locations").update(patch).eq("id", existingId);
      if (patchErr) {
        console.error("[BOOKING_LOCATIONS] ensureCustomerAddressLocation dedupe patch failed", patchErr);
      }
    }
    return existingId;
  }

  // Quote-stage rows often have customer_id null; without claiming them, confirm would insert a new
  // location and leave field_values on the abandoned quote row.
  const { data: unassigned } = await supabase
    .from("locations")
    .select("id, address1, postal_code, city")
    .eq("org_id", org_id)
    .eq("location_type", "address")
    .is("customer_id", null);

  const orphanMatch = (unassigned ?? []).find(addressMatches);
  if (orphanMatch) {
    const claimId = (orphanMatch as { id: string }).id;
    const claimPatch: Record<string, unknown> = {
      customer_id,
      address1: a1 || null,
      city: cityNorm || null,
      state: (state ?? "").trim() || null,
      postal_code: pc || null,
    };
    if (a1) claimPatch.label = a1;
    if (access_method_key !== undefined) {
      claimPatch.access_method_key = access_method_key;
      claimPatch.access_method_id = null;
    } else if (access_method_id !== undefined) {
      claimPatch.access_method_id = access_method_id;
    }
    if (access_code !== undefined) {
      claimPatch.access_code = access_code != null && String(access_code).trim() !== "" ? String(access_code).trim() : null;
    }
    if (has_pets === true || has_pets === false) claimPatch.has_pets = has_pets;
    if (access_notes !== undefined) {
      claimPatch.access_notes = access_notes != null && String(access_notes).trim() !== "" ? String(access_notes).trim() : null;
    }
    const { error: claimErr } = await supabase.from("locations").update(claimPatch).eq("id", claimId);
    if (!claimErr) return claimId;
    console.error("[BOOKING_LOCATIONS] ensureCustomerAddressLocation claim orphan failed", claimErr);
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
  if (access_method_key != null) {
    insert.access_method_key = access_method_key;
    insert.access_method_id = null;
  } else if (access_method_id != null) {
    insert.access_method_id = access_method_id;
  }
  if (access_code != null && String(access_code).trim() !== "") insert.access_code = String(access_code).trim();
  if (has_pets === true || has_pets === false) insert.has_pets = has_pets;
  if (access_notes != null && String(access_notes).trim() !== "") insert.access_notes = String(access_notes).trim();

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

export type EnsureCanonicalBookingLocationParams = EnsureCustomerAddressLocationParams & {
  opportunity_id: string;
  /** When set (including null), skips an extra opportunities select — pass from a combined read for perf */
  existing_location_id?: string | null;
};

/**
 * Prefer the opportunity's quote-stage location: attach customer and refresh address fields.
 * If the opportunity has no location, reuse ensureCustomerAddressLocation and link opportunity.location_id.
 */
export async function ensureCanonicalBookingLocation(
  supabase: SupabaseClient,
  params: EnsureCanonicalBookingLocationParams
): Promise<string | null> {
  const { opportunity_id, existing_location_id: preloadedLocId, ...locParams } = params;

  let existingId: string | null = null;
  if (preloadedLocId !== undefined) {
    existingId = preloadedLocId;
  } else {
    const { data: opp } = await supabase
      .from("opportunities")
      .select("location_id")
      .eq("id", opportunity_id)
      .maybeSingle();
    existingId = (opp as { location_id?: string | null } | null)?.location_id ?? null;
  }
  const {
    address_line1,
    city,
    state,
    postal_code,
    customer_id,
    access_method_key,
    access_method_id,
    access_code,
    has_pets,
    access_notes,
  } = locParams;
  const a1 = (address_line1 ?? "").trim();
  const pc = (postal_code ?? "").trim();
  const cityNorm = (city ?? "").trim();

  if (existingId) {
    const patch: Record<string, unknown> = {
      customer_id,
      address1: a1 || null,
      city: cityNorm || null,
      state: (state ?? "").trim() || null,
      postal_code: pc || null,
    };
    if (a1) patch.label = a1;
    if (access_method_key !== undefined) {
      patch.access_method_key = access_method_key;
      patch.access_method_id = null;
    } else if (access_method_id !== undefined) {
      patch.access_method_id = access_method_id;
    }
    if (access_code !== undefined) patch.access_code = access_code != null && String(access_code).trim() !== "" ? String(access_code).trim() : null;
    if (has_pets === true || has_pets === false) patch.has_pets = has_pets;
    if (access_notes !== undefined) patch.access_notes = access_notes != null && String(access_notes).trim() !== "" ? String(access_notes).trim() : null;
    const { error } = await supabase.from("locations").update(patch).eq("id", existingId);
    if (!error) return existingId;
    console.error("[BOOKING_LOCATIONS] ensureCanonicalBookingLocation update failed, falling back", error);
  }

  const createdOrFound = await ensureCustomerAddressLocation(supabase, locParams);
  if (createdOrFound) {
    const oppLocPatch: Record<string, unknown> = { location_id: createdOrFound };
    await normalizeOpportunityWritePayload(supabase, oppLocPatch, "bookingLocations:link-location-to-opp");
    const { error: linkErr } = await supabase.from("opportunities").update(oppLocPatch).eq("id", opportunity_id);
    if (linkErr) {
      console.warn("[BOOKING_LOCATIONS] failed to set opportunity.location_id", linkErr);
    }
  }
  return createdOrFound;
}
