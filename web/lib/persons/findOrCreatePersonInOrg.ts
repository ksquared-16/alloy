import type { SupabaseClient } from "@supabase/supabase-js";

type MinimalSupabase = Pick<SupabaseClient, "from">;

export type FindOrCreatePersonInOrgResult = { id: string; created: boolean };

/**
 * Find or create a person scoped by org. Match email (ilike) first, then phone.
 * Mirrors quote-start behavior for consistent public flows.
 * `created` is true only when this call inserted the row (for transactional rollback).
 */
export async function findOrCreatePersonInOrgWithMeta(
  supabase: MinimalSupabase,
  params: {
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    org_id: string | null;
  }
): Promise<FindOrCreatePersonInOrgResult | null> {
  const { email, phone, first_name, last_name, org_id } = params;
  const emailNorm = email?.trim() ? email.trim().toLowerCase() : null;
  const phoneNorm = phone?.trim() || null;

  if (!emailNorm && !phoneNorm) return null;

  if (emailNorm) {
    let q = supabase.from("persons").select("id").ilike("email", emailNorm).limit(1);
    if (org_id) q = q.eq("org_id", org_id);
    const { data: byEmail } = await q.maybeSingle();
    if (byEmail && typeof (byEmail as { id?: string }).id === "string") {
      return { id: (byEmail as { id: string }).id, created: false };
    }
  }
  if (phoneNorm) {
    let q = supabase.from("persons").select("id").eq("phone", phoneNorm).limit(1);
    if (org_id) q = q.eq("org_id", org_id);
    const { data: byPhone } = await q.maybeSingle();
    if (byPhone && typeof (byPhone as { id?: string }).id === "string") {
      return { id: (byPhone as { id: string }).id, created: false };
    }
  }

  if (!org_id) return null;

  const { data: created, error } = await supabase
    .from("persons")
    .insert({
      org_id,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      email: emailNorm ?? null,
      phone: phoneNorm ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      if (emailNorm) {
        const { data: again } = await supabase
          .from("persons")
          .select("id")
          .eq("org_id", org_id)
          .ilike("email", emailNorm)
          .limit(1)
          .maybeSingle();
        if (again && typeof (again as { id?: string }).id === "string") {
          return { id: (again as { id: string }).id, created: false };
        }
      }
      if (phoneNorm) {
        const { data: again } = await supabase.from("persons").select("id").eq("org_id", org_id).eq("phone", phoneNorm).limit(1).maybeSingle();
        if (again && typeof (again as { id?: string }).id === "string") {
          return { id: (again as { id: string }).id, created: false };
        }
      }
    }
    console.warn("[findOrCreatePersonInOrg] failed", error?.message);
    return null;
  }
  return { id: (created as { id: string }).id, created: true };
}

/**
 * Find or create a person scoped by org. Match email (ilike) first, then phone.
 * Mirrors quote-start behavior for consistent public flows.
 */
export async function findOrCreatePersonInOrg(
  supabase: MinimalSupabase,
  params: {
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    org_id: string | null;
  }
): Promise<string | null> {
  const r = await findOrCreatePersonInOrgWithMeta(supabase, params);
  return r?.id ?? null;
}
