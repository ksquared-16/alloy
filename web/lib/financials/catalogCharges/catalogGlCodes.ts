/**
 * A CATALOG ITEM'S GL CODE — the pure half: the derived posting-mapping key, which accounts are
 * eligible, and how a GL Code is shown. Shared by the Catalog editor, Add Charge and the server
 * (`catalogGlSelection.ts` writes; this module never does).
 */

/** The derived posting-mapping namespace: one key per GL account, naming only that account. */
export const CATALOG_GL_MAPPING_KEY_PREFIX = "catalog_gl_account:";

export function catalogGlMappingKey(glAccountId: string): string {
    return `${CATALOG_GL_MAPPING_KEY_PREFIX}${glAccountId}`;
}

export function isCatalogGlMappingKey(key: string): boolean {
    return key.startsWith(CATALOG_GL_MAPPING_KEY_PREFIX);
}

export type CatalogGlAccountCandidate = {
    id: string;
    code: string;
    name: string;
    type?: string | null;
    is_active?: boolean | null;
};

/** Why an account cannot be a catalog item's GL Code, or null when it can. */
export function catalogGlAccountIneligibility(account: CatalogGlAccountCandidate | null | undefined): string | null {
    if (!account) return "That GL account does not exist in this organization.";
    if (account.is_active === false) return `GL account ${account.code} · ${account.name} is inactive. Reactivate it in Organization › Financials › Accounting, or choose another.`;
    if (account.type !== "revenue") return `GL account ${account.code} · ${account.name} is not a revenue account, so a catalog charge cannot post to it.`;
    return null;
}

/** `code · name`, the one way a GL Code is shown on a catalog item and in Add Charge. */
export function catalogGlAccountLabel(account: Pick<CatalogGlAccountCandidate, "code" | "name">): string {
    return `${account.code} · ${account.name}`;
}

/**
 * THE DROPDOWN: the organization's existing eligible GL codes (active revenue accounts), by code. The
 * current selection is kept — flagged — when it is no longer eligible, so opening an item never
 * silently shows another account.
 */
export function catalogGlAccountOptions(
    accounts: readonly CatalogGlAccountCandidate[],
    currentId: string | null = null,
): Array<{ id: string; label: string; eligible: boolean; ineligibleReason: string | null }> {
    return accounts
        .filter((a) => catalogGlAccountIneligibility(a) === null || a.id === currentId)
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.name.localeCompare(b.name))
        .map((a) => {
            const reason = catalogGlAccountIneligibility(a);
            return { id: a.id, label: catalogGlAccountLabel(a), eligible: reason === null, ineligibleReason: reason };
        });
}
