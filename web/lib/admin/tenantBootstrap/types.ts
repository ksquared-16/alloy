import type {
    VerticalBootstrapApplySummary,
    VerticalBootstrapPayloadV1,
    VerticalBootstrapPreviewResult,
} from "@/lib/admin/verticalBootstrap/types";

/**
 * Tenant bootstrap v1 — spin-up contract: org/industry intent + full structural config.
 * Apply path persists only `structural_config` (same as vertical-bootstrap); tenant fields
 * orchestrate preview and future org-creation services.
 */
export type TenantOrgProfileV1 = {
    industry_key: string;
    industry_label: string;
    /** Display name suggestion until org row is created or renamed */
    display_name_hint?: string;
};

export type TenantBootstrapStarterSeedV1 = {
    deferred: true;
    /** Reference to a seed shape (e.g. childcare_v1) — no rows written by bootstrap */
    reference: string;
};

export type TenantBootstrapPayloadV1 = {
    schema_version: 1;
    org_profile: TenantOrgProfileV1;
    /**
     * Department keys where Growth (CRM / opportunities / configured queues) is fully supported.
     * Must be a non-empty subset of structural_config.departments[].key
     */
    growth_department_keys: string[];
    /** Optional copy map at tenant level; often duplicated in structural_config.onboarding_context */
    terminology?: Record<string, string>;
    /** Status/lifecycle/dept/WU/queue rows applied to the org */
    structural_config: VerticalBootstrapPayloadV1;
    starter_seed?: TenantBootstrapStarterSeedV1;
};

export type TenantBootstrapPreviewExtras = {
    org_profile: TenantOrgProfileV1;
    growth_department_keys: string[];
    terminology?: Record<string, string>;
    starter_seed?: TenantBootstrapStarterSeedV1;
    /** Per department: product slice classification */
    department_slices: Array<{
        department_key: string;
        slice: "growth" | "scaffold";
    }>;
};

export type TenantBootstrapPreviewResult = {
    ok: boolean;
    errors: string[];
    tenant: TenantBootstrapPreviewExtras;
    /** Same shape as POST /api/admin/vertical-bootstrap preview */
    structural: VerticalBootstrapPreviewResult;
};

export type TenantBootstrapApplyResult =
    | {
          ok: true;
          summary: VerticalBootstrapApplySummary;
      }
    | { ok: false; error: string };
