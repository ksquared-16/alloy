/**
 * Read-only row shapes for the General Ledger configuration surface (Operational
 * Configuration V1, Batch 0). These mirror the existing `gl_accounts` /
 * `gl_account_mappings` tables. No write model is exposed in Batch 0 — GL Codes
 * and GL Mappings are read-only configuration surfaces until posting is built.
 */

export const GL_ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type GlAccountType = (typeof GL_ACCOUNT_TYPES)[number];

export type GlAccountRow = {
    id: string;
    org_id: string;
    code: string;
    name: string;
    type: string;
    currency: string;
    is_active: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export type GlAccountMappingRow = {
    id: string;
    org_id: string;
    key: string;
    gl_account_id: string;
    is_active: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export type GlConfigBundle = {
    glAccounts: GlAccountRow[];
    glAccountMappings: GlAccountMappingRow[];
};
