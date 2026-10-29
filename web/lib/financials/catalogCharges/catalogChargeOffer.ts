/**
 * MANUAL ADD CHARGE FROM THE COMMERCIAL CATALOG — what may be charged, and against which account.
 *
 * ── ONE CATALOG ──────────────────────────────────────────────────────────────────────────────
 *
 * Organization › Financials › Catalog is `commercial_products`. Add › Charge used to offer
 * `financial_charge_templates` instead — a second list the operator never configured there, which
 * is how "Enrollment fee (waived)" came to be offered beside a catalog that has no such item. The
 * picker, the preview and the server command now all read the catalog, through this module, so
 * they cannot disagree about which item it is, whether it applies here, today, or what it costs.
 *
 * ── WHAT THIS COMMAND MAY INCUR (operator policy, 2026-10-29) ────────────────────────────────
 *
 * ONE-TIME FEES. Everything else in the catalog stays VISIBLE and says where it is billed instead —
 * recurring and metered items by periodic billing / attendance, add-ons through the enrollment,
 * deposits as held money. This command does not invent incurrence semantics for any of them.
 *
 * ── THE ACCOUNT IS THE CATALOG'S, OR THERE IS NO CHARGE ──────────────────────────────────────
 *
 * A catalog item names its account as `revenue_category_id → mapped_gl_account_id → gl_accounts`.
 * A charge travels a different chain — `metadata.gl_mapping_key → gl_account_mappings → gl_accounts`
 * — and every reader of a charge's account (the card, charge detail, reductions) resolves that one.
 * Both end at `gl_accounts`, so the bridge is the posting mapping whose account IS the catalog
 * item's account, chosen through the canonical `resolveGlAccountForMappingKey`. When no such mapping
 * exists the item is BLOCKED: falling back to the charge category's default account would book the
 * fee somewhere nobody configured, on a ledger that cannot be edited afterwards.
 *
 * Pure apart from `readCatalogChargeConfig`. Commercial evaluation (`resolveProducts`,
 * `resolveAccounting`) treats an unmapped account as a warning; this command does not, by policy.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CommercialProductDef, RevenueCategoryDef } from "@/lib/commercial/execution/commercialExport";
import { isEffective } from "@/lib/commercial/execution/evaluate/evalUtils";
import { readProducts, readRevenueCategories } from "@/lib/commercial/execution/export/readCommercialConfig";
import { frequencyLabel } from "@/lib/commercial/commercialProducts";
import { resolveGlAccountForMappingKey, type ResolvedGlAccount } from "@/lib/financials/accounting/resolveGlMapping";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";
import { loadGlConfigBundle } from "@/lib/financials/gl/glConfigService";
import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";

/** The resolution-key namespace of a catalog charge: `tpl:catalog:<product id>:<date>:<scope>`. */
export const CATALOG_CHARGE_KEY_PREFIX = "catalog:";

/** The charge category a catalog one-time fee is recorded under. Its ACCOUNT never comes from it. */
export const CATALOG_FEE_CHARGE_CATEGORY = "fee" as const;

export type CatalogChargeConfig = {
    products: CommercialProductDef[];
    revenueCategories: RevenueCategoryDef[];
    mappings: Array<Pick<GlAccountMappingRow, "key" | "gl_account_id" | "is_active">>;
    accounts: Array<Pick<GlAccountRow, "id" | "code" | "name" | "type" | "currency" | "is_active">>;
};

export type CatalogChargeAccount = ResolvedGlAccount & { mappingKey: string; revenueCategoryId: string; revenueCategoryLabel: string };

export type CatalogChargeEvaluation =
    /** May be charged here, today, at its configured amount, to its configured account. */
    | { status: "offerable"; product: CommercialProductDef; account: CatalogChargeAccount }
    /** Shown, never chargeable here: billed by another flow (`reason` names it). */
    | { status: "unsupported"; product: CommercialProductDef; code: string; reason: string }
    /** Shown, never chargeable until its configuration is completed (`reason` says what is missing). */
    | { status: "blocked"; product: CommercialProductDef; code: string; reason: string }
    /** Not this account's, or not today's: not offered, and refused if asked for. */
    | { status: "out_of_scope"; product: CommercialProductDef; code: string; reason: string };

export type CatalogChargeContext = {
    /** The organisation's business date — the date effectiveness is judged on, everywhere. */
    asOf: string;
    /**
     * The sites the charge could be FOR. The server passes the one site its billable source attends
     * (`resolveFinancialPolicyScope` — null for a household source); the picker passes every site
     * the account's subjects attend, so it offers what the command would accept for at least one.
     */
    locationIds: ReadonlyArray<string | null>;
};

const RECURRING_CADENCES = new Set(["daily", "weekly", "biweekly", "monthly", "annual"]);

function money(cents: number): string {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** The posting mapping keys whose canonical resolution IS this account, deterministically ordered. */
function mappingKeysForAccount(accountId: string, config: CatalogChargeConfig): string[] {
    const keys = [...new Set(config.mappings.filter((m) => m.is_active !== false).map((m) => m.key))].sort();
    return keys.filter(
        (key) =>
            resolveGlAccountForMappingKey(key, config.mappings as GlAccountMappingRow[], config.accounts as GlAccountRow[])?.id
            === accountId,
    );
}

/** The account a catalog item posts to, or why it has none. Never a default. */
export function resolveCatalogChargeAccount(
    product: CommercialProductDef,
    config: CatalogChargeConfig,
): { ok: true; account: CatalogChargeAccount } | { ok: false; code: string; reason: string } {
    if (!product.revenueCategoryId) {
        return {
            ok: false,
            code: "catalog_revenue_category_missing",
            reason: "No revenue category is set on this catalog item, so it has no account to post to. Set one in Organization › Financials › Catalog.",
        };
    }
    const category = config.revenueCategories.find((rc) => rc.id === product.revenueCategoryId);
    if (!category || !category.isActive) {
        return {
            ok: false,
            code: "catalog_revenue_category_unavailable",
            reason: "This catalog item's revenue category is missing or inactive, so it has no account to post to.",
        };
    }
    const label = category.label || "this revenue category";
    if (!category.glAccountId) {
        return {
            ok: false,
            code: "catalog_gl_account_unmapped",
            reason: `Revenue category “${label}” is not mapped to a GL account. Map it in Organization › Financials › GL Codes.`,
        };
    }
    const account = config.accounts.find((a) => a.id === category.glAccountId);
    if (!account || account.is_active === false) {
        return {
            ok: false,
            code: "catalog_gl_account_inactive",
            reason: `The GL account mapped to “${label}” is missing or inactive, so this item cannot be charged.`,
        };
    }
    const [mappingKey] = mappingKeysForAccount(account.id, config);
    if (!mappingKey) {
        return {
            ok: false,
            code: "catalog_posting_mapping_missing",
            reason: `No posting mapping uses GL account ${account.code} · ${account.name}, so a charge cannot be recorded against it. Add one in Organization › Financials › GL Codes.`,
        };
    }
    return {
        ok: true,
        account: {
            id: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            currency: account.currency,
            mappingKey,
            revenueCategoryId: category.id,
            revenueCategoryLabel: category.label,
        },
    };
}

/** Why a catalog item is billed elsewhere, or null when it is a one-time fee. */
function unsupportedReason(product: CommercialProductDef): { code: string; reason: string } | null {
    const cadence = (product.cadenceKey ?? "").trim();
    if (product.commercialType === "deposit") {
        return {
            code: "catalog_deposit_not_manual",
            reason: "Deposit — held money, collected through enrollment rather than added as a charge.",
        };
    }
    if (product.commercialType === "addon") {
        return {
            code: "catalog_addon_not_manual",
            reason: product.behavior.package != null
                ? "Add-on package — sold and used through the child's enrollment, not added as a charge."
                : "Add-on — billed through the child's enrollment, not added as a charge.",
        };
    }
    if (cadence && RECURRING_CADENCES.has(cadence)) {
        return {
            code: "catalog_recurring_not_manual",
            reason: `${frequencyLabel(cadence)} — billed by periodic billing, not added as a one-time charge.`,
        };
    }
    if (cadence) {
        return {
            code: "catalog_metered_not_manual",
            reason: `${frequencyLabel(cadence)} — billed from attendance and usage, not added as a one-time charge.`,
        };
    }
    return null;
}

/**
 * THE ONE RULE for a catalog item in manual Add Charge. The picker and the server both call it, with
 * the same business date and the site(s) the charge is for, so an item the picker offers is the item
 * the command accepts at the price the preview shows.
 */
export function evaluateCatalogCharge(
    product: CommercialProductDef,
    config: CatalogChargeConfig,
    ctx: CatalogChargeContext,
): CatalogChargeEvaluation {
    if (!product.isActive) {
        return { status: "out_of_scope", product, code: "catalog_item_inactive", reason: "This catalog item is no longer offered." };
    }
    if (!isEffective(product.effective, ctx.asOf)) {
        return {
            status: "out_of_scope",
            product,
            code: "catalog_item_not_effective",
            reason: `This catalog item is not in effect on ${ctx.asOf}.`,
        };
    }
    const site = product.scope.locationId;
    if (site && !ctx.locationIds.includes(site)) {
        return {
            status: "out_of_scope",
            product,
            code: "catalog_item_other_location",
            reason: "This catalog item is offered at a different location from this charge's.",
        };
    }
    const unsupported = unsupportedReason(product);
    if (unsupported) return { status: "unsupported", product, ...unsupported };
    if (product.scope.programKey) {
        /* No canonical program on a manual charge's billable source to check the scope against. */
        return {
            status: "unsupported",
            product,
            code: "catalog_program_scoped",
            reason: "Offered for one program only — billed through that program's enrollment, not added as a charge.",
        };
    }
    if (!(product.amountCents > 0)) {
        return {
            status: "blocked",
            product,
            code: "catalog_amount_not_positive",
            reason: `This catalog item is priced at ${money(Math.max(0, product.amountCents))}, so there is nothing to charge.`,
        };
    }
    const account = resolveCatalogChargeAccount(product, config);
    if (!account.ok) return { status: "blocked", product, code: account.code, reason: account.reason };
    return { status: "offerable", product, account: account.account };
}

/**
 * THE CATALOG ITEM AS A CHARGE DEFINITION for the existing lifecycle resolver.
 *
 * Not a template and never persisted as one — `charges.charge_template_id` stays null for it. It
 * exists so a catalog fee is dated, reviewed, period-bound and de-duplicated by exactly the code a
 * template charge is: occurs on the service date, invoiced by the organisation's own invoice timing
 * (`billing_policy`), reviewed by its `posting_review` policy, at the configured amount, through the
 * posting mapping that resolves to the catalog item's own account.
 */
export function catalogChargeDefinition(args: {
    orgId: string;
    product: CommercialProductDef;
    account: CatalogChargeAccount | null;
    asOf: string;
}): ChargeTemplateRow {
    const { product } = args;
    return {
        id: product.id,
        org_id: args.orgId,
        service_id: null,
        template_key: `${CATALOG_CHARGE_KEY_PREFIX}${product.id}`,
        label: product.name,
        description: null,
        charge_category: CATALOG_FEE_CHARGE_CATEGORY,
        trigger_type: "manual",
        trigger_key: null,
        amount_strategy: "fixed",
        amount_cents: product.amountCents,
        currency_code: (args.account?.currency || "USD").trim() || "USD",
        occurs_on_strategy: "now",
        billable_on_strategy: "billing_policy",
        billable_offset_days: null,
        default_gl_mapping_key: args.account?.mappingKey ?? null,
        default_responsibility_key: null,
        review_required: false,
        is_active: product.isActive,
        /* The window `evaluateCatalogCharge` already judged; "from day one" is the business date. */
        effective_start: product.effective.start ?? args.asOf,
        effective_end: product.effective.end,
        source_key: "commercial_catalog",
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
    } as ChargeTemplateRow;
}

/** What a catalog charge records about its item, so its history never depends on today's catalog. */
export function catalogChargeSnapshot(product: CommercialProductDef, account: CatalogChargeAccount | null) {
    return {
        product_id: product.id,
        name: product.name,
        commercial_type: product.commercialType,
        amount_cents: product.amountCents,
        cadence_key: product.cadenceKey,
        location_id: product.scope.locationId,
        effective_start: product.effective.start,
        effective_end: product.effective.end,
        revenue_category_id: account?.revenueCategoryId ?? product.revenueCategoryId,
        gl_account_id: account?.id ?? null,
        gl_account_code: account?.code ?? null,
        gl_mapping_key: account?.mappingKey ?? null,
    };
}

/** The org's catalog and the accounting it needs, in one parallel read. */
export async function readCatalogChargeConfig(
    supabase: SupabaseClient,
    orgId: string,
    asOf: string,
): Promise<CatalogChargeConfig> {
    const ctx = { supabase, orgId, asOf };
    const [products, revenueCategories, gl] = await Promise.all([
        readProducts(ctx),
        readRevenueCategories(ctx),
        loadGlConfigBundle(supabase, orgId),
    ]);
    return { products, revenueCategories, mappings: gl.glAccountMappings, accounts: gl.glAccounts };
}
