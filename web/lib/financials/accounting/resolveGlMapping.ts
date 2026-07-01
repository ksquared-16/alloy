/**
 * Pure resolver for the accounting chain: Charge Category → GL Mapping → GL
 * Account (Financial Configuration Convergence). Read-only; computes nothing
 * billable and posts nothing. It makes the GL configuration legible: for each
 * charge category, which mapping key it posts through, and which GL account
 * that mapping resolves to (or that it is unmapped).
 */

import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";
import { listChargeCategories } from "@/lib/financials/chargeCategories";

export type ResolvedGlAccount = {
    id: string;
    code: string;
    name: string;
    type: string;
    currency: string;
};

export type ResolvedChargeCategoryGl = {
    categoryKey: string;
    categoryLabel: string;
    mappingKey: string;
    /** True when a GL mapping exists for the category's mapping key. */
    mapped: boolean;
    account: ResolvedGlAccount | null;
};

function indexAccountsById(accounts: readonly GlAccountRow[]): Map<string, GlAccountRow> {
    const m = new Map<string, GlAccountRow>();
    for (const a of accounts) m.set(a.id, a);
    return m;
}

function indexActiveMappingsByKey(mappings: readonly GlAccountMappingRow[]): Map<string, GlAccountMappingRow> {
    const m = new Map<string, GlAccountMappingRow>();
    for (const mapping of mappings) {
        if (mapping.is_active === false) continue;
        // Last active mapping for a key wins; deterministic for stable input order.
        m.set(mapping.key, mapping);
    }
    return m;
}

/** Resolve one mapping key to its GL account (or null when unmapped/missing). */
export function resolveGlAccountForMappingKey(
    mappingKey: string,
    mappings: readonly GlAccountMappingRow[],
    accounts: readonly GlAccountRow[],
): ResolvedGlAccount | null {
    const mapping = indexActiveMappingsByKey(mappings).get(mappingKey);
    if (!mapping) return null;
    const account = indexAccountsById(accounts).get(mapping.gl_account_id);
    if (!account) return null;
    return { id: account.id, code: account.code, name: account.name, type: account.type, currency: account.currency };
}

/** Resolve the full Charge Category → GL Mapping → GL Account chain for display. */
export function resolveChargeCategoryGlChain(
    mappings: readonly GlAccountMappingRow[],
    accounts: readonly GlAccountRow[],
): ResolvedChargeCategoryGl[] {
    const mappingByKey = indexActiveMappingsByKey(mappings);
    const accountsById = indexAccountsById(accounts);
    return listChargeCategories().map((cat) => {
        const mapping = mappingByKey.get(cat.mappingKey);
        const account = mapping ? accountsById.get(mapping.gl_account_id) ?? null : null;
        return {
            categoryKey: cat.key,
            categoryLabel: cat.label,
            mappingKey: cat.mappingKey,
            mapped: !!mapping && !!account,
            account: account
                ? { id: account.id, code: account.code, name: account.name, type: account.type, currency: account.currency }
                : null,
        };
    });
}
