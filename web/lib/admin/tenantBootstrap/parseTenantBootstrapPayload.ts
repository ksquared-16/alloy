import { parseVerticalBootstrapPayload } from "@/lib/admin/verticalBootstrap/parseVerticalBootstrapPayload";
import type { TenantBootstrapPayloadV1 } from "@/lib/admin/tenantBootstrap/types";

export type ParseTenantBootstrapResult =
    | { ok: true; payload: TenantBootstrapPayloadV1 }
    | { ok: false; errors: string[] };

const TENANT_SLICE_KEYS = new Set(["growth", "scaffold"]);

function readTenantSlice(meta: Record<string, unknown> | undefined): string | undefined {
    if (!meta || typeof meta !== "object") return undefined;
    const v = meta.tenant_slice;
    return typeof v === "string" ? v.trim() : undefined;
}

/**
 * Validates tenant wrapper + nested vertical bootstrap. Does not hit the database.
 */
export function parseTenantBootstrapPayload(raw: unknown): ParseTenantBootstrapResult {
    const errors: string[] = [];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, errors: ["payload must be a JSON object"] };
    }
    const root = raw as Record<string, unknown>;
    if (root.schema_version !== 1) {
        errors.push("schema_version must be 1");
    }

    const org = root.org_profile;
    if (org == null || typeof org !== "object" || Array.isArray(org)) {
        errors.push("org_profile must be an object");
    } else {
        const o = org as Record<string, unknown>;
        const ik = typeof o.industry_key === "string" ? o.industry_key.trim() : "";
        const il = typeof o.industry_label === "string" ? o.industry_label.trim() : "";
        if (!ik) errors.push("org_profile.industry_key is required");
        if (!il) errors.push("org_profile.industry_label is required");
    }

    if (!Array.isArray(root.growth_department_keys)) {
        errors.push("growth_department_keys must be an array");
    } else if ((root.growth_department_keys as unknown[]).length === 0) {
        errors.push("growth_department_keys must name at least one department");
    }

    if (root.structural_config === undefined) {
        errors.push("structural_config is required");
    }

    if (errors.length) {
        return { ok: false, errors };
    }

    const structuralParsed = parseVerticalBootstrapPayload(root.structural_config);
    if (!structuralParsed.ok) {
        return { ok: false, errors: structuralParsed.errors.map((e) => `structural_config: ${e}`) };
    }

    const structural = structuralParsed.payload;
    const deptKeys = new Set(structural.departments.map((d) => d.key));

    const rawGrowth = root.growth_department_keys as unknown[];
    const growthKeySet = new Set<string>();
    for (let i = 0; i < rawGrowth.length; i++) {
        const item = rawGrowth[i];
        const k = typeof item === "string" ? item.trim() : "";
        if (!k || !deptKeys.has(k)) {
            errors.push(`growth_department_keys[${i}]: unknown or empty department key "${String(item)}"`);
        } else {
            growthKeySet.add(k);
        }
    }

    for (const d of structural.departments) {
        const ts = readTenantSlice(d.metadata);
        if (ts !== undefined && !TENANT_SLICE_KEYS.has(ts)) {
            errors.push(`departments[${d.key}].metadata.tenant_slice must be "growth" or "scaffold"`);
        }
    }
    if (errors.length) {
        return { ok: false, errors };
    }

    for (const gk of growthKeySet) {
        const dept = structural.departments.find((d) => d.key === gk);
        const ts = readTenantSlice(dept?.metadata);
        if (ts !== undefined && ts !== "growth") {
            errors.push(
                `growth_department_keys includes "${gk}" but department metadata.tenant_slice is "${ts}" (expected "growth" or omit)`
            );
        }
    }

    for (const d of structural.departments) {
        if (readTenantSlice(d.metadata) === "scaffold" && growthKeySet.has(d.key)) {
            errors.push(`department "${d.key}" cannot be both scaffold and listed in growth_department_keys`);
        }
    }

    if (errors.length) {
        return { ok: false, errors };
    }

    const terminology =
        root.terminology !== undefined && root.terminology !== null && typeof root.terminology === "object" && !Array.isArray(root.terminology)
            ? Object.fromEntries(
                  Object.entries(root.terminology as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][]
              )
            : undefined;

    let starter_seed: TenantBootstrapPayloadV1["starter_seed"];
    if (root.starter_seed !== undefined) {
        if (root.starter_seed === null || typeof root.starter_seed !== "object" || Array.isArray(root.starter_seed)) {
            errors.push("starter_seed must be an object when present");
        } else {
            const s = root.starter_seed as Record<string, unknown>;
            if (s.deferred !== true) {
                errors.push("starter_seed.deferred must be true in v1");
            }
            const ref = typeof s.reference === "string" ? s.reference.trim() : "";
            if (!ref) {
                errors.push("starter_seed.reference is required when starter_seed is set");
            }
            if (errors.length === 0) {
                starter_seed = { deferred: true, reference: ref };
            }
        }
    }

    if (errors.length) {
        return { ok: false, errors };
    }

    const orgProfile = org as Record<string, unknown>;
    const payload: TenantBootstrapPayloadV1 = {
        schema_version: 1,
        org_profile: {
            industry_key: String(orgProfile.industry_key).trim(),
            industry_label: String(orgProfile.industry_label).trim(),
            display_name_hint:
                typeof orgProfile.display_name_hint === "string" && orgProfile.display_name_hint.trim() !== ""
                    ? orgProfile.display_name_hint.trim()
                    : undefined,
        },
        growth_department_keys: [...growthKeySet],
        terminology,
        structural_config: structural,
        starter_seed,
    };

    return { ok: true, payload };
}
