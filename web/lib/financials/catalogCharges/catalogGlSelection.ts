/**
 * A CATALOG ITEM'S GL CODE — chosen from the organization's own accounts, and chargeable once saved.
 *
 * ── THE DISCONNECT THIS CLOSES ───────────────────────────────────────────────────────────────
 *
 * A catalog item names its account as `revenue_category_id → mapped_gl_account_id → gl_accounts`.
 * A charge reaches its account through a POSTING MAPPING (`metadata.gl_mapping_key →
 * gl_account_mappings → gl_accounts`; see `catalogChargeOffer.ts`). The only operator flow that writes
 * mappings (`/api/admin/financials/gl-mappings`) points one of the ten code-owned charge-category keys
 * at an account, so an item whose account no category key happened to name was shown with its GL
 * account and still refused as `catalog_posting_mapping_missing` — with nothing the operator could do
 * about it from the item.
 *
 * ── THE MAPPING IS THE ACCOUNT'S OWN ─────────────────────────────────────────────────────────
 *
 * Saving an eligible selection references, or establishes, the posting mapping whose key is DERIVED
 * from the account itself: `catalog_gl_account:<gl_account_id>`. It is code-owned like the category
 * keys (no operator invents it), and it can only ever name its own account — so it is never repointed,
 * a charge recorded against it keeps naming the account it was booked to, and no category key's
 * meaning changes. Nothing here creates a GL account, moves a mapping another key owns, or touches a
 * charge: historical transactions keep exactly the keys they were written with.
 *
 * The item's link stays the existing `revenue_category_id`: the revenue category already mapped to the
 * account is referenced (the item's current one first), and one is created only when no active
 * category names the account — the same row the dropdown's old loader created for every revenue
 * account, now created only for the one chosen. A selection that cannot be honoured (another org's
 * account, inactive, not a revenue account, a label already taken) is refused with what is missing,
 * before the item is written.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitEvent } from "@/lib/emitEvent";
import {
    catalogGlAccountIneligibility,
    catalogGlAccountLabel,
    catalogGlMappingKey,
    type CatalogGlAccountCandidate,
} from "@/lib/financials/catalogCharges/catalogGlCodes";

export { catalogGlMappingKey } from "@/lib/financials/catalogCharges/catalogGlCodes";

export type CatalogGlSelectionResult =
    | {
          ok: true;
          revenueCategoryId: string;
          /** The revenue category row referenced or created, so a surface can show the saved GL Code at once. */
          revenueCategory: Record<string, unknown>;
          mappingKey: string;
          account: { id: string; code: string; name: string };
          /** What the save did to reach a chargeable item — nothing, when everything already existed. */
          established: { revenueCategory: boolean; mapping: "referenced" | "created" | "reactivated" };
      }
    | { ok: false; status: number; error: string };

type CategoryRow = { id: string; label: string; mapped_gl_account_id: string | null; is_active: boolean | null; sort_order: number | null } & Record<string, unknown>;
const CATEGORY_COLS = "id, org_id, label, gl_code, mapped_gl_account_id, sort_order, is_active, metadata, created_at, updated_at";

/**
 * Reference or establish what makes `glAccountId` a chargeable GL Code for a catalog item in `orgId`.
 * `currentRevenueCategoryId` is the item's existing link, preferred when it already names the account.
 */
export async function ensureCatalogGlSelection(
    supabase: SupabaseClient,
    args: { orgId: string; glAccountId: string; currentRevenueCategoryId?: string | null; actorUserId?: string | null },
): Promise<CatalogGlSelectionResult> {
    const { orgId, glAccountId } = args;

    const { data: accountRow, error: accountError } = await supabase
        .from("gl_accounts")
        .select("id, code, name, type, is_active")
        .eq("org_id", orgId)
        .eq("id", glAccountId)
        .maybeSingle();
    if (accountError) return { ok: false, status: 500, error: accountError.message };
    const account = accountRow as CatalogGlAccountCandidate | null;
    const ineligible = catalogGlAccountIneligibility(account);
    if (ineligible || !account) return { ok: false, status: 400, error: ineligible ?? "That GL account does not exist in this organization." };

    /* 1. The revenue category that names this account — referenced, or created once. */
    const { data: categoryRows, error: categoryError } = await supabase
        .from("commercial_revenue_categories")
        .select(CATEGORY_COLS)
        .eq("org_id", orgId);
    if (categoryError) return { ok: false, status: 500, error: categoryError.message };
    const categories = (categoryRows ?? []) as CategoryRow[];
    const naming = categories
        .filter((c) => c.is_active !== false && c.mapped_gl_account_id === account.id)
        .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.label.localeCompare(b.label));
    let category = naming.find((c) => c.id === args.currentRevenueCategoryId) ?? naming[0] ?? null;
    let createdCategory = false;
    if (!category) {
        const label = catalogGlAccountLabel(account);
        if (categories.some((c) => c.label === label)) {
            return {
                ok: false,
                status: 409,
                error: `A revenue category named “${label}” already exists but does not post to GL account ${label}. Map or rename it in Organization › Financials › Accounting, then choose this GL Code again.`,
            };
        }
        const { data: inserted, error: insertError } = await supabase
            .from("commercial_revenue_categories")
            .insert({ org_id: orgId, label, gl_code: account.code, mapped_gl_account_id: account.id, sort_order: 100, is_active: true, metadata: { source: "catalog_gl_selection" } })
            .select(CATEGORY_COLS)
            .single();
        if (insertError || !inserted) return { ok: false, status: 500, error: insertError?.message ?? "Could not record the GL Code's revenue category." };
        category = inserted as CategoryRow;
        createdCategory = true;
    }

    /* 2. The account's own posting mapping — referenced, reactivated or created; never repointed. */
    const mappingKey = catalogGlMappingKey(account.id);
    const readMapping = () =>
        supabase.from("gl_account_mappings").select("id, gl_account_id, is_active").eq("org_id", orgId).eq("key", mappingKey).maybeSingle();
    let { data: mappingRow, error: mappingError } = await readMapping();
    if (mappingError) return { ok: false, status: 500, error: mappingError.message };
    let mapping: "referenced" | "created" | "reactivated" = "referenced";
    if (!mappingRow) {
        const { error: insertError } = await supabase
            .from("gl_account_mappings")
            .insert({ org_id: orgId, key: mappingKey, gl_account_id: account.id, is_active: true, metadata: { source: "catalog_gl_selection" } });
        if (insertError && insertError.code !== "23505") return { ok: false, status: 500, error: insertError.message };
        if (insertError) {
            /* Another save established it first; judge the row that won. */
            ({ data: mappingRow, error: mappingError } = await readMapping());
            if (mappingError || !mappingRow) return { ok: false, status: 500, error: mappingError?.message ?? "Could not read the GL Code's posting mapping." };
        } else {
            mapping = "created";
        }
    }
    if (mappingRow) {
        const row = mappingRow as { id: string; gl_account_id: string; is_active: boolean | null };
        if (row.gl_account_id !== account.id) {
            return { ok: false, status: 409, error: `The posting mapping for GL account ${catalogGlAccountLabel(account)} names a different account. It was not changed; ask an administrator to review GL mappings.` };
        }
        if (row.is_active === false) {
            const { error: updateError } = await supabase.from("gl_account_mappings").update({ is_active: true }).eq("id", row.id);
            if (updateError) return { ok: false, status: 500, error: updateError.message };
            mapping = "reactivated";
        }
    }
    if (mapping !== "referenced") {
        await emitEvent({
            org_id: orgId,
            event_type: "financials.gl_mapping.set",
            entity_type: "gl_account_mapping",
            entity_id: mappingKey,
            payload: { mapping_key: mappingKey, gl_account_id: account.id, source: "catalog_gl_selection", actor_user_id: args.actorUserId ?? null },
        }).catch(() => {});
    }

    return {
        ok: true,
        revenueCategoryId: category.id,
        revenueCategory: category,
        mappingKey,
        account: { id: account.id, code: account.code, name: account.name },
        established: { revenueCategory: createdCategory, mapping },
    };
}
