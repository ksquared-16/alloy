import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import {
    isInquiryChildEnrollmentFieldKey,
    validateFieldDefinitionOwnership,
} from "@/lib/fields/canonicalFieldOwnership";
import {
    CUSTOMER_MEMBER_ENTITY_TYPE,
    CUSTOMER_MEMBER_NATIVE_COLUMN_KEYS,
} from "@/lib/fields/customerMemberFieldRegistry";
import {
    CUSTOMER_MEMBER_NATIVE_PATCH_KEYS,
    findUnsupportedCustomerMemberPatchKeys,
    partitionCustomerMemberPatchBody,
} from "@/lib/fields/partitionCustomerMemberPatchBody";

export type CustomerMemberPatchValidation =
    | {
          ok: true;
          native: Record<string, unknown>;
          config: Record<string, unknown>;
      }
    | { ok: false; error: string };

/** Keys never persisted via field_values on customer_member PATCH. */
export const CUSTOMER_MEMBER_FIELD_VALUES_EXCLUDED_KEYS = [
    ...CUSTOMER_MEMBER_NATIVE_PATCH_KEYS,
    ...CUSTOMER_MEMBER_NATIVE_COLUMN_KEYS,
    "id",
    "org_id",
    "created_at",
    "updated_at",
] as const;

export function validateCustomerMemberPatchBody(body: Record<string, unknown>): CustomerMemberPatchValidation {
    const unsupported = findUnsupportedCustomerMemberPatchKeys(body);
    if (unsupported.length > 0) {
        const enrollment = unsupported.filter((k) => isInquiryChildEnrollmentFieldKey(k));
        if (enrollment.length > 0) {
            return {
                ok: false,
                error: `Enrollment fields belong on inquiry_child, not customer_member: ${enrollment.join(", ")}`,
            };
        }
        return { ok: false, error: `Unsupported fields: ${unsupported.join(", ")}` };
    }

    for (const key of Object.keys(body)) {
        if (key.startsWith("_") || body[key] === undefined) continue;
        const ownershipErr = validateFieldDefinitionOwnership(CUSTOMER_MEMBER_ENTITY_TYPE, key);
        if (ownershipErr) return { ok: false, error: ownershipErr };
    }

    const { native, config } = partitionCustomerMemberPatchBody(body);
    if (Object.keys(native).length === 0 && Object.keys(config).length === 0) {
        return { ok: false, error: "No allowed fields to update" };
    }

    return { ok: true, native, config };
}

export function buildNativeCustomerMemberUpdates(native: Record<string, unknown>): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    if (typeof native.display_name === "string") updates.display_name = native.display_name.trim();
    if (native.relationship !== undefined) {
        updates.relationship =
            typeof native.relationship === "string" ? native.relationship.trim() || null : null;
    }
    if (native.first_name !== undefined) {
        updates.first_name = typeof native.first_name === "string" ? native.first_name.trim() || null : null;
    }
    if (native.last_name !== undefined) {
        updates.last_name = typeof native.last_name === "string" ? native.last_name.trim() || null : null;
    }
    if (native.dob !== undefined) {
        updates.dob = typeof native.dob === "string" && native.dob.trim() ? native.dob.trim() : null;
    }
    if (typeof native.is_active === "boolean") updates.is_active = native.is_active;
    if (native.external_source !== undefined) {
        updates.external_source =
            typeof native.external_source === "string" ? native.external_source.trim() || null : null;
    }
    if (native.external_id !== undefined) {
        updates.external_id = typeof native.external_id === "string" ? native.external_id.trim() || null : null;
    }
    if (native.metadata !== undefined) {
        updates.metadata = native.metadata && typeof native.metadata === "object" ? native.metadata : null;
    }
    return updates;
}

/** Ensure config keys have active customer_member field_definitions before upsert. */
export async function assertCustomerMemberConfigFieldDefinitionsExist(
    supabase: SupabaseClient,
    orgId: string,
    config: Record<string, unknown>
): Promise<string | null> {
    const keys = Object.keys(config).filter((k) => config[k] !== undefined);
    if (keys.length === 0) return null;

    const { data: defRows, error } = await supabase
        .from("field_definitions")
        .select("field_key, entity_type")
        .eq("org_id", orgId)
        .eq("entity_type", CUSTOMER_MEMBER_ENTITY_TYPE)
        .eq("is_active", true)
        .in("field_key", keys);

    if (error) return error.message;

    const found = new Set((defRows ?? []).map((r) => (r as { field_key: string }).field_key));
    const missing = keys.filter((k) => !found.has(k));
    if (missing.length > 0) {
        return `Missing active field_definitions for customer_member: ${missing.join(", ")}`;
    }

    return null;
}

export async function upsertCustomerMemberConfigFieldValues(
    supabase: SupabaseClient,
    orgId: string,
    memberId: string,
    config: Record<string, unknown>
): Promise<void> {
    if (Object.keys(config).length === 0) return;
    await upsertFieldValuesFromBody(
        supabase,
        orgId,
        CUSTOMER_MEMBER_ENTITY_TYPE,
        memberId,
        config,
        CUSTOMER_MEMBER_FIELD_VALUES_EXCLUDED_KEYS
    );
}

export function buildCustomerMemberPatchBodyFromFieldKeys(
    entries: ReadonlyArray<{ field_key: string; value: unknown }>,
): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const entry of entries) {
        body[entry.field_key] = entry.value;
    }
    return body;
}

export function customerMemberNativeSnapshotSelectColumns(): string {
    return ["id", "org_id", "customer_id", ...CUSTOMER_MEMBER_NATIVE_PATCH_KEYS].join(", ");
}

export function nativeProfileValuesFromRecord(record: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of CUSTOMER_MEMBER_NATIVE_PATCH_KEYS) {
        if (key in record) out[key] = record[key];
    }
    return out;
}

/** Shared server mutation path for customer_member PATCH and Processing commit adapters. */
export async function applyCustomerMemberMutationPatch(args: {
    supabase: SupabaseClient;
    orgId: string;
    memberId: string;
    body: Record<string, unknown>;
}): Promise<
    { ok: true; spans?: Record<string, number> } | { ok: false; error: string; status?: number }
> {
    const validated = validateCustomerMemberPatchBody(args.body);
    if (!validated.ok) return { ok: false, error: validated.error, status: 400 };

    const nativeUpdates = buildNativeCustomerMemberUpdates(validated.native);
    const hasNative = Object.keys(nativeUpdates).length > 0;
    const hasConfig = Object.keys(validated.config).length > 0;
    if (!hasNative && !hasConfig) return { ok: false, error: "No allowed fields to update", status: 400 };

    /* Span-instrumented so the save tail can be attributed to a STEP, not to "the server". */
    const spans: Record<string, number> = {};

    /*
     * PRE-WRITE GUARDS, CONCURRENTLY.
     *
     * Both must pass before anything is written — the existence check produces the 404 and the
     * definition check produces the 400 — but they are independent of each other, and running them
     * in series made the operator wait for their SUM (~550 ms + ~345 ms measured). Neither is
     * weakened by overlapping them: both are still awaited, and both still gate the write below.
     */
    const t0 = Date.now();
    const [existsRes, defErr] = await Promise.all([
        args.supabase
            .from("customer_members")
            .select("id")
            .eq("id", args.memberId)
            .eq("org_id", args.orgId)
            .maybeSingle(),
        hasConfig
            ? assertCustomerMemberConfigFieldDefinitionsExist(args.supabase, args.orgId, validated.config)
            : Promise.resolve(null),
    ]);
    spans.guards_ms = Date.now() - t0;
    if (existsRes.error) return { ok: false, error: existsRes.error.message, status: 500 };
    if (!existsRes.data) return { ok: false, error: "Member not found", status: 404 };
    if (defErr) return { ok: false, error: defErr, status: 400 };

    if (hasConfig) {
        const t2 = Date.now();
        await upsertCustomerMemberConfigFieldValues(args.supabase, args.orgId, args.memberId, validated.config);
        spans.upsert_config_ms = Date.now() - t2;
    }

    if (hasNative) {
        const t3 = Date.now();
        const { error } = await args.supabase
            .from("customer_members")
            .update(nativeUpdates)
            .eq("id", args.memberId)
            .eq("org_id", args.orgId);
        spans.update_native_ms = Date.now() - t3;
        if (error) return { ok: false, error: error.message, status: 500 };
    }

    return { ok: true, spans };
}

