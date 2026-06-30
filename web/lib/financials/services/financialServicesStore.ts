/**
 * Financial Services catalog (Commercial Model) — first-class entity.
 *
 * Service is what the organization sells (Full-Time Care, Before Care,
 * Transportation, Meals, Registration, …). Promoted from the interim
 * org_settings.metadata.financials.services blob to the first-class
 * `financial_services` table (migration 20260702120000) per the frozen domain
 * doctrine (docs/platform/modules/financial-platform-domain.md, determination #1).
 *
 * A Service catalog is a list, not effective-dated truth — rate AMOUNTS remain
 * the versioned objects (Rate Plans/Rules). Services carry is_active + audit.
 *
 * The exported API stays camelCase so existing route/panel/hook/seed callers are
 * unchanged; only the persistence moved from JSON to a table. Pure validation
 * helpers are unit-tested; only the DB functions touch the table. Server-only,
 * role-gated at the route layer. No posting/charges/GL writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError, trimOrNull } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    normalizeCapabilities,
    SERVICE_CAPABILITIES,
    type ServiceCapabilityMap,
} from "@/lib/financials/services/serviceCapabilities";

const TABLE = "financial_services";

export const FINANCIAL_SERVICE_TYPES = ["recurring", "one_time", "usage", "attendance_derived"] as const;
export type FinancialServiceType = (typeof FINANCIAL_SERVICE_TYPES)[number];

export const FINANCIAL_SERVICE_TYPE_LABEL: Record<FinancialServiceType, string> = {
    recurring: "Recurring",
    one_time: "One-time",
    usage: "Per usage",
    attendance_derived: "Attendance-derived",
};

/** camelCase API shape (decoupled from the snake_case table columns). */
export type FinancialService = {
    id: string;
    key: string;
    label: string;
    serviceType: FinancialServiceType;
    unit: string | null;
    description: string | null;
    isActive: boolean;
    sortOrder: number;
    /** Switchboard — what this offering switches on (from metadata; defaults by type). */
    capabilities: ServiceCapabilityMap;
    /** Default revenue category key (Accounting read-through); null = unmapped. */
    defaultChargeCategory: string | null;
    /** Associated program labels (relationship; stored in metadata until a program catalog link exists). */
    programs: string[];
    createdAt?: string | null;
    updatedAt?: string | null;
};

export type FinancialServiceInput = {
    id?: string | null;
    key?: string | null;
    label: string;
    serviceType: string;
    unit?: string | null;
    description?: string | null;
    sortOrder?: number | null;
    /** Partial capability overrides; merged onto the type defaults. */
    capabilities?: Partial<ServiceCapabilityMap> | null;
    defaultChargeCategory?: string | null;
    programs?: string[] | null;
};

function fail(code: OperationalEnrollmentServiceError["code"], message: string): never {
    throw new OperationalEnrollmentServiceError(code, message);
}

export function slugifyServiceKey(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function isServiceType(value: unknown): value is FinancialServiceType {
    return typeof value === "string" && (FINANCIAL_SERVICE_TYPES as readonly string[]).includes(value);
}

export type ValidatedServiceFields = {
    service_key: string;
    label: string;
    service_type: FinancialServiceType;
    unit: string | null;
    description: string | null;
};

/** Validate + normalize an input into the columns to persist (pure). */
export function validateServiceFields(input: FinancialServiceInput): ValidatedServiceFields {
    const label = trimOrNull(input.label);
    if (!label) fail("invalid_input", "Service label is required");
    if (!isServiceType(input.serviceType)) {
        fail("invalid_input", `serviceType must be one of ${FINANCIAL_SERVICE_TYPES.join(", ")}`);
    }
    const service_key = slugifyServiceKey(trimOrNull(input.key) ?? label);
    if (!service_key) fail("invalid_input", "Service key could not be derived from the label");
    return { service_key, label, service_type: input.serviceType, unit: trimOrNull(input.unit), description: trimOrNull(input.description) };
}

type ServiceRow = {
    id: string;
    service_key: string;
    label: string;
    service_type: FinancialServiceType;
    unit: string | null;
    description: string | null;
    is_active: boolean;
    sort_order: number;
    metadata: Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
};

function readPrograms(meta: Record<string, unknown> | null): string[] {
    const raw = meta?.programs;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

function rowToService(row: ServiceRow): FinancialService {
    const meta = row.metadata ?? {};
    const cat = meta.default_charge_category;
    return {
        id: row.id,
        key: row.service_key,
        label: row.label,
        serviceType: row.service_type,
        unit: row.unit ?? null,
        description: row.description ?? null,
        isActive: row.is_active !== false,
        sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
        capabilities: normalizeCapabilities(meta.capabilities, row.service_type),
        defaultChargeCategory: typeof cat === "string" && cat.length > 0 ? cat : null,
        programs: readPrograms(meta),
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
    };
}

/** Build the metadata jsonb to persist, merging capability overrides onto type defaults. */
function buildMetadata(input: FinancialServiceInput, serviceType: FinancialServiceType, prior?: Record<string, unknown> | null): Record<string, unknown> {
    const caps = normalizeCapabilities({ ...(prior?.capabilities as object | undefined), ...(input.capabilities ?? {}) }, serviceType);
    const capObj: Record<string, boolean> = {};
    for (const c of SERVICE_CAPABILITIES) capObj[c] = caps[c];
    const meta: Record<string, unknown> = { ...(prior ?? {}), capabilities: capObj };
    if (input.defaultChargeCategory !== undefined) {
        meta.default_charge_category = trimOrNull(input.defaultChargeCategory);
    }
    if (input.programs !== undefined) {
        meta.programs = (input.programs ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
    }
    return meta;
}

// ---------------------------------------------------------------------------
// DB access (financial_services table)
// ---------------------------------------------------------------------------

export async function listFinancialServices(supabase: SupabaseClient, orgId: string): Promise<FinancialService[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true });
    if (error) fail("db_error", error.message);
    return ((data ?? []) as ServiceRow[]).map(rowToService);
}

async function findByKey(supabase: SupabaseClient, orgId: string, key: string): Promise<ServiceRow | null> {
    const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("org_id", orgId)
        .eq("service_key", key)
        .maybeSingle();
    if (error) fail("db_error", error.message);
    return (data ?? null) as ServiceRow | null;
}

export async function createFinancialService(
    supabase: SupabaseClient,
    orgId: string,
    input: FinancialServiceInput,
    actorUserId?: string | null,
): Promise<FinancialService> {
    const fields = validateServiceFields(input);
    const existing = await findByKey(supabase, orgId, fields.service_key);
    if (existing) fail("conflict", `A service with key "${fields.service_key}" already exists`);
    const actor = trimOrNull(actorUserId);
    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: orgId,
            ...fields,
            is_active: true,
            sort_order: typeof input.sortOrder === "number" ? input.sortOrder : 100,
            source_key: "config",
            metadata: buildMetadata(input, fields.service_type),
            created_by: actor,
            updated_by: actor,
        })
        .select("*")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "service insert failed");
    return rowToService(data as ServiceRow);
}

export async function updateFinancialService(
    supabase: SupabaseClient,
    orgId: string,
    input: FinancialServiceInput & { id: string },
    actorUserId?: string | null,
): Promise<FinancialService> {
    const fields = validateServiceFields(input);
    const dup = await findByKey(supabase, orgId, fields.service_key);
    if (dup && dup.id !== input.id) fail("conflict", `A service with key "${fields.service_key}" already exists`);
    // Load prior metadata so a partial edit (one capability, the category) merges, never clobbers.
    const { data: priorRow } = await supabase.from(TABLE).select("metadata").eq("org_id", orgId).eq("id", input.id).maybeSingle();
    const prior = (priorRow?.metadata ?? null) as Record<string, unknown> | null;
    const update: Record<string, unknown> = {
        ...fields,
        metadata: buildMetadata(input, fields.service_type, prior),
        updated_by: trimOrNull(actorUserId),
    };
    if (typeof input.sortOrder === "number") update.sort_order = input.sortOrder;
    const { data, error } = await supabase
        .from(TABLE)
        .update(update)
        .eq("org_id", orgId)
        .eq("id", input.id)
        .select("*")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "service not found");
    return rowToService(data as ServiceRow);
}

export async function setFinancialServiceActive(
    supabase: SupabaseClient,
    orgId: string,
    id: string,
    isActive: boolean,
    actorUserId?: string | null,
): Promise<FinancialService> {
    const { data, error } = await supabase
        .from(TABLE)
        .update({ is_active: isActive, updated_by: trimOrNull(actorUserId) })
        .eq("org_id", orgId)
        .eq("id", id)
        .select("*")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "service not found");
    return rowToService(data as ServiceRow);
}
