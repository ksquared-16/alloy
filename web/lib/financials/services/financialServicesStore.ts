/**
 * Financial Services catalog (Financial Configuration Convergence).
 *
 * Services represent what the organization actually sells (Full-Time Care,
 * Before Care, Transportation, Meals, Registration, …) — the foundational
 * financial object that rates, charge templates, and posting will attach to.
 *
 * Persisted as structured JSON under `org_settings.metadata.financials.services`
 * — a generic per-org store that already exists with org-scoped RLS, so this
 * adds a real, authorable catalog with NO new table/migration/backend
 * architecture. Read-modify-write of the `financials` subtree keeps unrelated
 * org settings intact.
 *
 * Doctrine note: a service catalog is a list, not effective-dated truth — rate
 * *amounts* remain the versioned, effective-dated objects (Rate Plans/Rules).
 * Wiring rates to attach to a service is a future backend pass (see docs).
 *
 * The list/validation helpers are pure (unit-tested); only load/save touch the DB.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError, trimOrNull } from "@/lib/childcareOperational/operationalEnrollmentErrors";

export const FINANCIAL_SERVICE_TYPES = ["recurring", "one_time", "usage", "attendance_derived"] as const;
export type FinancialServiceType = (typeof FINANCIAL_SERVICE_TYPES)[number];

export const FINANCIAL_SERVICE_TYPE_LABEL: Record<FinancialServiceType, string> = {
    recurring: "Recurring",
    one_time: "One-time",
    usage: "Per usage",
    attendance_derived: "Attendance-derived",
};

export type FinancialService = {
    id: string;
    key: string;
    label: string;
    serviceType: FinancialServiceType;
    /** Optional unit for usage/recurring services (e.g. "day", "week", "trip", "meal"). */
    unit: string | null;
    isActive: boolean;
    sortOrder: number;
};

const SERVICES_KEY = "services";

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

export type FinancialServiceInput = {
    id?: string | null;
    key?: string | null;
    label: string;
    serviceType: string;
    unit?: string | null;
    isActive?: boolean;
    sortOrder?: number | null;
};

/** Validate + normalize a service input into a stored service (pure). */
export function normalizeFinancialService(input: FinancialServiceInput, fallbackId: string): FinancialService {
    const label = trimOrNull(input.label);
    if (!label) fail("invalid_input", "Service label is required");
    if (!isServiceType(input.serviceType)) {
        fail("invalid_input", `serviceType must be one of ${FINANCIAL_SERVICE_TYPES.join(", ")}`);
    }
    const key = slugifyServiceKey(trimOrNull(input.key) ?? label);
    if (!key) fail("invalid_input", "Service key could not be derived from the label");
    return {
        id: trimOrNull(input.id) ?? fallbackId,
        key,
        label,
        serviceType: input.serviceType,
        unit: trimOrNull(input.unit),
        isActive: input.isActive ?? true,
        sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : 0,
    };
}

/** Parse a raw services array from org_settings metadata into typed services (pure). */
export function parseFinancialServices(raw: unknown): FinancialService[] {
    if (!Array.isArray(raw)) return [];
    const out: FinancialService[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        if (typeof o.id !== "string" || typeof o.label !== "string" || !isServiceType(o.serviceType)) continue;
        out.push({
            id: o.id,
            key: typeof o.key === "string" ? o.key : slugifyServiceKey(o.label),
            label: o.label,
            serviceType: o.serviceType,
            unit: typeof o.unit === "string" ? o.unit : null,
            isActive: o.isActive !== false,
            sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : 0,
        });
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/** Insert or replace a service by id (pure). Rejects a duplicate key on another service. */
export function upsertServiceInList(list: readonly FinancialService[], service: FinancialService): FinancialService[] {
    if (list.some((s) => s.id !== service.id && s.key === service.key)) {
        fail("conflict", `A service with key "${service.key}" already exists`);
    }
    const exists = list.some((s) => s.id === service.id);
    const next = exists ? list.map((s) => (s.id === service.id ? service : s)) : [...list, service];
    return next.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// DB access (org_settings.metadata.financials.services)
// ---------------------------------------------------------------------------

type FinancialsBlob = Record<string, unknown>;

async function loadOrgMetadata(supabase: SupabaseClient, orgId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (error) fail("db_error", error.message);
    return ((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
}

function readFinancialsBlob(metadata: Record<string, unknown>): FinancialsBlob {
    const fin = metadata.financials;
    return fin && typeof fin === "object" && !Array.isArray(fin) ? (fin as FinancialsBlob) : {};
}

export async function listFinancialServices(supabase: SupabaseClient, orgId: string): Promise<FinancialService[]> {
    const metadata = await loadOrgMetadata(supabase, orgId);
    return parseFinancialServices(readFinancialsBlob(metadata)[SERVICES_KEY]);
}

/** Read-modify-write the financials.services subtree, preserving all other settings. */
async function saveFinancialServices(
    supabase: SupabaseClient,
    orgId: string,
    services: FinancialService[],
): Promise<FinancialService[]> {
    const metadata = await loadOrgMetadata(supabase, orgId);
    const financials = readFinancialsBlob(metadata);
    const nextMetadata = { ...metadata, financials: { ...financials, [SERVICES_KEY]: services } };
    const { error } = await supabase
        .from("org_settings")
        .upsert({ org_id: orgId, metadata: nextMetadata }, { onConflict: "org_id" });
    if (error) fail("db_error", error.message);
    return services;
}

function newServiceId(): string {
    // Server-only id generation (route layer). Pure helpers never call this.
    return `svc_${globalThis.crypto.randomUUID()}`;
}

export async function createFinancialService(
    supabase: SupabaseClient,
    orgId: string,
    input: FinancialServiceInput,
): Promise<FinancialService> {
    const existing = await listFinancialServices(supabase, orgId);
    const service = normalizeFinancialService(
        { ...input, sortOrder: input.sortOrder ?? existing.length * 10 },
        newServiceId(),
    );
    const next = upsertServiceInList(existing, service);
    await saveFinancialServices(supabase, orgId, next);
    return service;
}

export async function updateFinancialService(
    supabase: SupabaseClient,
    orgId: string,
    input: FinancialServiceInput & { id: string },
): Promise<FinancialService> {
    const existing = await listFinancialServices(supabase, orgId);
    if (!existing.some((s) => s.id === input.id)) fail("not_found", "Service not found");
    const service = normalizeFinancialService(input, input.id);
    const next = upsertServiceInList(existing, service);
    await saveFinancialServices(supabase, orgId, next);
    return service;
}

export async function setFinancialServiceActive(
    supabase: SupabaseClient,
    orgId: string,
    id: string,
    isActive: boolean,
): Promise<FinancialService[]> {
    const existing = await listFinancialServices(supabase, orgId);
    if (!existing.some((s) => s.id === id)) fail("not_found", "Service not found");
    const next = existing.map((s) => (s.id === id ? { ...s, isActive } : s));
    return saveFinancialServices(supabase, orgId, next);
}
