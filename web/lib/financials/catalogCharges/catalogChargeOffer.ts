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
 * ONE-TIME FEES. Everything else in the catalog stays VISIBLE and says what it is and why it is not
 * charged here. The reasons state only what is true: measured 2026-10-30, NO flow charges a
 * recurring, usage-priced, add-on, package or deposit catalog item — periodic billing values tuition
 * only (`commercialValuation`), and enrollment fees reference charge templates. So no reason names a
 * flow that would bill the item; this command does not invent incurrence semantics for any of them.
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
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";
import { loadGlConfigBundle } from "@/lib/financials/gl/glConfigService";
import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
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

/** Why a catalog item is not chargeable by manual Add Charge, or null when it is a one-time fee. */
function unsupportedReason(product: CommercialProductDef): { code: string; reason: string } | null {
    const cadence = (product.cadenceKey ?? "").trim();
    if (product.commercialType === "deposit") {
        return {
            code: "catalog_deposit_not_manual",
            reason: "Deposit — held money, not a charge. Add charge adds one-time fees only, and deposits are not collected from the Catalog yet.",
        };
    }
    if (product.commercialType === "addon") {
        return {
            code: "catalog_addon_not_manual",
            reason: product.behavior.package != null
                ? "Add-on package — Add charge adds one-time fees only, and packages are not sold from the Catalog yet."
                : "Add-on — Add charge adds one-time fees only, and add-ons are not charged from the Catalog yet.",
        };
    }
    if (cadence && RECURRING_CADENCES.has(cadence)) {
        return {
            code: "catalog_recurring_not_manual",
            reason: `${frequencyLabel(cadence)} — a recurring Catalog item. Add charge adds one-time fees only, and recurring Catalog items are not billed by any flow yet. To charge it here, set its frequency to One-time.`,
        };
    }
    if (cadence) {
        return {
            code: "catalog_metered_not_manual",
            reason: `${frequencyLabel(cadence)} — a usage-priced Catalog item. Add charge adds one-time fees only, and usage-priced Catalog items are not billed by any flow yet.`,
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
            reason: "Offered for one program only — a manual charge carries no program to check that against, so it cannot be added here.",
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
 * ONE CATALOG OPTION as every Add Charge surface lists it — the card's command and Bulk charge alike.
 *
 * `id` is the catalog item's id, sent as `catalog_product_id`. `availability` is the rule's verdict:
 * only `offerable` can be chosen; `unsupported` and `blocked` are listed with `unavailableReason`
 * so the operator sees the whole catalog and why an item is not chargeable here.
 */
export type CatalogChargeOption = {
    id: string;
    label: string;
    categoryKey: string;
    categoryLabel: string;
    amountStrategy: string;
    amountCents: number | null;
    currencyCode: string;
    reviewRequired: boolean;
    occursOnStrategy: string;
    billableOnStrategy: string;
    source: "catalog";
    availability: "offerable" | "unsupported" | "blocked";
    unavailableReason: string | null;
    /** The account the charge will post to, as `code · name` — the catalog item's own, never a default. */
    accountLabel: string | null;
};

/**
 * THE OPTIONS A SURFACE OFFERS, judged by `evaluateCatalogCharge` on the business date against the
 * sites its charges can be for. Out-of-scope items are not listed; chargeable items come first so a
 * surface never opens on one the command would refuse. `reviewRequired` is the org's `posting_review`
 * answer for a catalog fee (no service), resolved by the caller from the policies it already holds.
 */
export function catalogChargeOptions(
    config: CatalogChargeConfig,
    ctx: CatalogChargeContext,
    reviewRequired: boolean,
): CatalogChargeOption[] {
    const rank = { offerable: 0, blocked: 1, unsupported: 2 } as const;
    return config.products
        .map((product) => evaluateCatalogCharge(product, config, ctx))
        .filter((e): e is Exclude<CatalogChargeEvaluation, { status: "out_of_scope" }> => e.status !== "out_of_scope")
        .sort((a, b) => rank[a.status] - rank[b.status] || a.product.name.localeCompare(b.product.name))
        .map((e) => ({
            id: e.product.id,
            // The name the organisation gave the item in its Catalog.
            label: e.product.name,
            categoryKey: CATALOG_FEE_CHARGE_CATEGORY,
            categoryLabel: chargeCategoryLabel(CATALOG_FEE_CHARGE_CATEGORY),
            amountStrategy: "fixed",
            amountCents: e.product.amountCents,
            currencyCode: (e.status === "offerable" ? e.account.currency : "") || "USD",
            occursOnStrategy: "now",
            billableOnStrategy: "billing_policy",
            reviewRequired,
            source: "catalog" as const,
            availability: e.status,
            unavailableReason: e.status === "offerable" ? null : e.reason,
            accountLabel: e.status === "offerable" ? `${e.account.code} · ${e.account.name}` : null,
        }));
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

/**
 * THE OPTIONS FOR A SURFACE THAT HOLDS NOTHING YET (Bulk charge) — the catalog, its accounting and
 * the org's `posting_review` answer, read here and judged by `catalogChargeOptions`. The card's read
 * model already holds the policies and calls `catalogChargeOptions` directly; both reach one rule.
 */
export async function loadCatalogChargeOptions(
    supabase: SupabaseClient,
    orgId: string,
    ctx: CatalogChargeContext,
): Promise<CatalogChargeOption[]> {
    const [config, policies] = await Promise.all([
        readCatalogChargeConfig(supabase, orgId, ctx.asOf),
        listFinancialPolicies(supabase, orgId),
    ]);
    const review = resolveFinancialPolicy(policies, "posting_review", {}, ctx.asOf);
    return catalogChargeOptions(config, ctx, review.resolved ? review.policy.value.required === true : false);
}
