import type { SupabaseClient } from "@supabase/supabase-js";

type MinimalSupabase = Pick<SupabaseClient, "from">;

/** Canonical vendors row fragment: always keep these three aligned to `vendor_statuses`. */
export type VendorStatusAlignedFields = {
  vendor_status_id: string;
  status_key: string;
  status: string;
};

export async function resolveVendorStatusByKey(
  supabase: MinimalSupabase,
  key: string
): Promise<VendorStatusAlignedFields | null> {
  const k = String(key ?? "").trim();
  if (!k) return null;
  const { data, error } = await supabase.from("vendor_statuses").select("id, key").eq("key", k).maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; key: string };
  const canon = String(row.key).trim();
  return { vendor_status_id: row.id, status_key: canon, status: canon };
}

export async function resolveVendorStatusById(
  supabase: MinimalSupabase,
  id: string
): Promise<VendorStatusAlignedFields | null> {
  const vid = String(id ?? "").trim();
  if (!vid) return null;
  const { data, error } = await supabase.from("vendor_statuses").select("id, key").eq("id", vid).maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; key: string };
  const canon = String(row.key).trim();
  return { vendor_status_id: row.id, status_key: canon, status: canon };
}
