/**
 * Shared GL Code option resolver for Tuition + Catalog.
 *
 * Operator chooses a GL Code. Persistence remains revenue_category_id
 * (commercial_revenue_categories → mapped_gl_account_id → gl_accounts).
 */

export type GlAccountLite = {
    id: string;
    code: string;
    name: string;
    type: string;
    is_active: boolean;
};

export type RevenueCategoryLite = {
    id: string;
    label: string;
    mapped_gl_account_id: string | null;
    is_active?: boolean;
};

export type GlCodeOption = {
    /** revenue_category_id — what Tuition/Catalog persist */
    revenueCategoryId: string;
    glAccountId: string;
    code: string;
    name: string;
    type: string;
    label: string;
    isActive: boolean;
};

export function formatGlCodeOptionLabel(code: string, name: string): string {
    return `${code} — ${name}`;
}

/**
 * Build selectable GL options from GL accounts + revenue category mappings.
 * Prefer categories mapped to GL accounts. Unmapped revenue categories are omitted
 * from the primary list (operators assign via Accounting).
 */
export function buildGlCodeOptions(input: {
    accounts: GlAccountLite[];
    revenueCategories: RevenueCategoryLite[];
    /** Include inactive mapped options so existing selections remain readable. */
    includeInactive?: boolean;
}): GlCodeOption[] {
    const accountById = new Map(input.accounts.map((row) => [row.id, row]));
    const options: GlCodeOption[] = [];

    for (const category of input.revenueCategories) {
        if (!category.mapped_gl_account_id) continue;
        const account = accountById.get(category.mapped_gl_account_id);
        if (!account) continue;
        const isActive = category.is_active !== false && account.is_active !== false;
        if (!isActive && !input.includeInactive) continue;
        options.push({
            revenueCategoryId: category.id,
            glAccountId: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            label: formatGlCodeOptionLabel(account.code, account.name),
            isActive,
        });
    }

    options.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
    return options;
}

/** Options available for new assignment (active only). */
export function activeGlCodeOptions(options: GlCodeOption[]): GlCodeOption[] {
    return options.filter((row) => row.isActive);
}

/**
 * Ensure a revenue category exists for a GL account (1:1 label from GL name).
 * Returns the revenue category id.
 */
export async function ensureRevenueCategoryForGlAccount(input: {
    account: GlAccountLite;
    revenueCategories: RevenueCategoryLite[];
    fetchImpl?: typeof fetch;
}): Promise<{ revenueCategoryId: string; created: boolean; revenueCategories: RevenueCategoryLite[] }> {
    const fetchFn = input.fetchImpl ?? fetch;
    const existing = input.revenueCategories.find(
        (row) => row.mapped_gl_account_id === input.account.id && row.is_active !== false,
    );
    if (existing) {
        return {
            revenueCategoryId: existing.id,
            created: false,
            revenueCategories: input.revenueCategories,
        };
    }

    const label = input.account.name.trim() || input.account.code;
    const res = await fetchFn("/api/admin/commercial/revenue-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            label,
            mapped_gl_account_id: input.account.id,
        }),
    });
    const json = (await res.json()) as {
        revenue_category?: RevenueCategoryLite;
        error?: string;
    };
    if (!res.ok || !json.revenue_category) {
        throw new Error(json.error || "Could not map GL Code to revenue category.");
    }
    return {
        revenueCategoryId: json.revenue_category.id,
        created: true,
        revenueCategories: [...input.revenueCategories, json.revenue_category],
    };
}

/**
 * Ensure active revenue GL accounts have a mapped revenue category so Tuition/Catalog
 * selectors can list them. Creates missing mappings; does not invent GL accounts.
 */
export async function ensureRevenueCategoriesForActiveRevenueAccounts(input: {
    accounts: GlAccountLite[];
    revenueCategories: RevenueCategoryLite[];
    fetchImpl?: typeof fetch;
}): Promise<{
    revenueCategories: RevenueCategoryLite[];
    createdCount: number;
}> {
    let categories = [...input.revenueCategories];
    let createdCount = 0;
    const revenueAccounts = input.accounts.filter(
        (row) => row.is_active !== false && String(row.type ?? "").toLowerCase() === "revenue",
    );
    for (const account of revenueAccounts) {
        const alreadyMapped = categories.some(
            (row) => row.mapped_gl_account_id === account.id && row.is_active !== false,
        );
        if (alreadyMapped) continue;
        const ensured = await ensureRevenueCategoryForGlAccount({
            account,
            revenueCategories: categories,
            fetchImpl: input.fetchImpl,
        });
        categories = ensured.revenueCategories;
        if (ensured.created) createdCount += 1;
    }
    return { revenueCategories: categories, createdCount };
}

export async function fetchGlCodeOptionSources(fetchImpl: typeof fetch = fetch): Promise<{
    accounts: GlAccountLite[];
    revenueCategories: RevenueCategoryLite[];
}> {
    const [glRes, rcRes] = await Promise.all([
        fetchImpl("/api/admin/financials/accounts", { credentials: "include" }),
        fetchImpl("/api/admin/commercial/revenue-categories?include_inactive=true", {
            credentials: "include",
        }),
    ]);
    const glJson = (await glRes.json()) as { data?: GlAccountLite[]; error?: string };
    const rcJson = (await rcRes.json()) as { revenue_categories?: RevenueCategoryLite[]; error?: string };
    if (!glRes.ok) throw new Error(glJson.error || "Could not load GL Codes.");
    if (!rcRes.ok) throw new Error(rcJson.error || "Could not load revenue mappings.");
    const accounts = glJson.data ?? [];
    const ensured = await ensureRevenueCategoriesForActiveRevenueAccounts({
        accounts,
        revenueCategories: rcJson.revenue_categories ?? [],
        fetchImpl,
    });
    return {
        accounts,
        revenueCategories: ensured.revenueCategories,
    };
}
