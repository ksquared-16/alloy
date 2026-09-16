import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { emitEvent } from "@/lib/emitEvent";
import {
    assertFinancialsReadAllowed,
    assertFinancialsWriteAllowed,
} from "@/lib/financials/financialsPermissions";
import { CHARGE_CATEGORY_GL_MAPPING_KEY, chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * WHERE A CHARGE CATEGORY MEETS A GL ACCOUNT.
 *
 * ── WHY THIS ROUTE EXISTS ──────────────────────────────────────────────────────────────────────
 *
 * Every charge in the certification tenant rendered `— unmapped` in the ledger's GL column, and the
 * census found why: `gl_accounts` holds ten configured, active accounts, and `gl_account_mappings`
 * holds ZERO rows. The projection was correct and was reporting the truth. What did not exist was
 * any way for an operator to create the missing half: GL Codes are authored by
 * `GlCodesConfigurationPage` through `/api/admin/financials/accounts`, and the category → account
 * mapping had no operator surface at all, in any workspace.
 *
 * ── THE KEYS ARE CODE-OWNED, SO THIS IS A CHOOSER AND NOT A TABLE EDITOR ───────────────────────
 *
 * `CHARGE_CATEGORY_GL_MAPPING_KEY` is a closed map from the ten canonical charge categories to ten
 * mapping keys, and the categories themselves are a database CHECK constraint. An operator does not
 * invent a mapping key and must not be asked to: the only decision that belongs to them is WHICH GL
 * ACCOUNT each category posts to. So the surface enumerates the canonical keys and accepts one
 * account per key, and a key outside that set is refused rather than created.
 *
 * ── AND IT WRITES CONFIGURATION, NEVER MONEY ───────────────────────────────────────────────────
 *
 * This route touches `gl_account_mappings` only. It posts nothing, journals nothing, and changes no
 * amount on any charge: a mapping decides which account future posting NAMES, which is exactly the
 * authority `gl_account_mappings` already had before anything could reach it.
 *
 * Read is `fin.read`; write is `fin.write` — the same gates the GL accounts route keeps, rather
 * than the admin/ops role check that leaves the read-only `gl-config` route unreachable for an
 * operator who holds financial permissions but not an admin role.
 */

type MappingRow = { key: string; gl_account_id: string | null; is_active: boolean };

/** The canonical mapping keys, in the order an operator reads their categories. */
function canonicalKeys(): Array<{ categoryKey: string; categoryLabel: string; mappingKey: string }> {
    return Object.entries(CHARGE_CATEGORY_GL_MAPPING_KEY).map(([categoryKey, mappingKey]) => ({
        categoryKey,
        categoryLabel: chargeCategoryLabel(categoryKey),
        mappingKey,
    }));
}

const MAPPING_KEYS = new Set(Object.values(CHARGE_CATEGORY_GL_MAPPING_KEY));

export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const [{ data: mappingData, error: mappingError }, { data: accountData, error: accountError }] =
        await Promise.all([
            supabase
                .from("gl_account_mappings")
                .select("key, gl_account_id, is_active")
                .eq("org_id", ctx.orgId),
            supabase
                .from("gl_accounts")
                .select("id, code, name, type, is_active")
                .eq("org_id", ctx.orgId)
                .order("code", { ascending: true }),
        ]);
    if (mappingError) return NextResponse.json({ error: mappingError.message }, { status: 500 });
    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });

    const byKey = new Map(
        ((mappingData ?? []) as MappingRow[]).filter((m) => m.is_active !== false).map((m) => [m.key, m.gl_account_id]),
    );

    /*
     * Every canonical key is returned, mapped or not. A category with no account is the state an
     * operator has to see and act on; returning only the configured ones would hide exactly the
     * rows that need attention.
     */
    return NextResponse.json({
        ok: true,
        accounts: accountData ?? [],
        mappings: canonicalKeys().map((entry) => ({
            ...entry,
            glAccountId: byKey.get(entry.mappingKey) ?? null,
        })),
    });
}

export async function PUT(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsWriteAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const body = (await request.json().catch(() => ({}))) as { mappingKey?: unknown; glAccountId?: unknown };
    const mappingKey = typeof body.mappingKey === "string" ? body.mappingKey.trim() : "";
    const glAccountId = typeof body.glAccountId === "string" ? body.glAccountId.trim() : "";

    /* A key this platform does not own is refused, not created. */
    if (!MAPPING_KEYS.has(mappingKey)) {
        return NextResponse.json({ error: "Unknown mapping key." }, { status: 400 });
    }

    /* Clearing a mapping deactivates it; the row's history is not rewritten. */
    if (!glAccountId) {
        const { error } = await supabase
            .from("gl_account_mappings")
            .update({ is_active: false })
            .eq("org_id", ctx.orgId)
            .eq("key", mappingKey);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await emitEvent({
            org_id: ctx.orgId,
            event_type: "financials.gl_mapping.cleared",
            entity_type: "gl_account_mapping",
            entity_id: mappingKey,
            payload: { mapping_key: mappingKey },
        }).catch(() => {});
        return NextResponse.json({ ok: true, mappingKey, glAccountId: null });
    }

    /* The account must be this org's and must be active — a mapping onto a retired account is a
       mapping that will render as a dead name in the ledger. */
    const { data: account, error: accountError } = await supabase
        .from("gl_accounts")
        .select("id, is_active")
        .eq("org_id", ctx.orgId)
        .eq("id", glAccountId)
        .maybeSingle();
    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
    if (!account) return NextResponse.json({ error: "That GL account does not exist." }, { status: 400 });
    if ((account as { is_active?: boolean }).is_active === false) {
        return NextResponse.json({ error: "That GL account is inactive." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
        .from("gl_account_mappings")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("key", mappingKey)
        .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const { error } = existing
        ? await supabase
              .from("gl_account_mappings")
              .update({ gl_account_id: glAccountId, is_active: true })
              .eq("id", (existing as { id: string }).id)
        : await supabase
              .from("gl_account_mappings")
              .insert({ org_id: ctx.orgId, key: mappingKey, gl_account_id: glAccountId, is_active: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await emitEvent({
        org_id: ctx.orgId,
        event_type: "financials.gl_mapping.set",
        entity_type: "gl_account_mapping",
        entity_id: mappingKey,
        payload: { mapping_key: mappingKey, gl_account_id: glAccountId },
    }).catch(() => {});
    return NextResponse.json({ ok: true, mappingKey, glAccountId });
}
