/**
 * Internal dev helpers — create org + assign admin in user_roles.
 * user_roles PK is user_id: one row per user; upsert replaces org for that admin (dev expectation).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

function slugify(name: string): string {
    const base = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
    return base || "org";
}

export type CreateOrgParams = {
    name: string;
    industry_key: string;
    admin_user_id: string;
};

export type CreateOrgResult =
    | { ok: true; org_id: string; slug: string; industry_id: string | null }
    | { ok: false; error: string };

export async function createOrgAndAssignAdmin(supabase: SupabaseClient, params: CreateOrgParams): Promise<CreateOrgResult> {
    const name = typeof params.name === "string" ? params.name.trim() : "";
    const industry_key = typeof params.industry_key === "string" ? params.industry_key.trim() : "";
    const admin_user_id = typeof params.admin_user_id === "string" ? params.admin_user_id.trim() : "";
    if (!name || !industry_key || !admin_user_id) {
        return { ok: false, error: "name, industry_key, and admin_user_id are required" };
    }

    const { data: industry, error: indErr } = await supabase
        .from("industries")
        .select("id")
        .eq("key", industry_key)
        .eq("is_active", true)
        .maybeSingle();

    if (indErr) {
        return { ok: false, error: `industries: ${indErr.message}` };
    }
    const industry_id = industry && typeof (industry as { id: string }).id === "string" ? (industry as { id: string }).id : null;
    if (!industry_id) {
        return { ok: false, error: `Unknown or inactive industry_key: ${industry_key}` };
    }

    const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`;

    const { data: orgRow, error: orgErr } = await supabase
        .from("orgs")
        .insert({
            name,
            slug,
            status: "active",
            industry_id,
        })
        .select("id")
        .single();

    if (orgErr || !orgRow) {
        return { ok: false, error: orgErr?.message ?? "Failed to insert org" };
    }

    const org_id = (orgRow as { id: string }).id;

    const { error: roleErr } = await supabase.from("user_roles").upsert(
        {
            user_id: admin_user_id,
            org_id,
            role: "admin",
        },
        { onConflict: "user_id" }
    );

    if (roleErr) {
        return { ok: false, error: `user_roles: ${roleErr.message}` };
    }

    return { ok: true, org_id, slug, industry_id };
}
