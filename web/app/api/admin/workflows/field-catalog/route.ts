import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";

export type FieldCatalogEntry = {
    key: string;
    label: string;
    data_type: string;
    operators: string[];
    source: string;
};

const ENTITY_TABLE: Record<string, string> = {
    vendor: "vendors",
    vendors: "vendors",
    job: "jobs",
    jobs: "jobs",
    contact: "contacts",
    contacts: "contacts",
    customer: "customers",
    customers: "customers",
    opportunity: "opportunities",
    opportunities: "opportunities",
    schedule: "schedules",
    schedules: "schedules",
    location: "locations",
    locations: "locations",
};

/** Map PG data_type to condition operators for the UI. */
function operatorsForDataType(dataType: string): string[] {
    const t = (dataType ?? "").toLowerCase();
    if (["text", "character varying", "varchar", "uuid"].some((x) => t.includes(x)) || t === "uuid")
        return ["eq", "neq", "in", "not_in", "contains", "exists", "is_null", "not_null"];
    if (["integer", "bigint", "smallint", "numeric", "decimal", "real", "double precision"].some((x) => t.includes(x)))
        return ["eq", "neq", "gt", "gte", "lt", "lte", "exists", "is_null", "not_null"];
    if (t === "boolean") return ["eq", "exists", "is_null", "not_null"];
    if (["timestamp with time zone", "timestamp without time zone", "date", "timestamptz", "timestamp"].some((x) => t.includes(x)))
        return ["eq", "gt", "gte", "lt", "lte", "exists", "is_null", "not_null"];
    if (t === "array" || t.includes("[]")) return ["contains", "overlaps", "exists", "is_null", "not_null"];
    return ["eq", "neq", "exists", "is_null", "not_null"];
}

/** When RPC returns nothing, expose normalized service-location columns for conditions. */
const LOCATION_FIELD_CATALOG_FALLBACK: FieldCatalogEntry[] = [
    { key: "id", label: "id", data_type: "uuid", operators: operatorsForDataType("uuid"), source: "table" },
    { key: "postal_code", label: "postal_code", data_type: "text", operators: operatorsForDataType("text"), source: "table" },
    { key: "beds", label: "beds", data_type: "numeric", operators: operatorsForDataType("numeric"), source: "table" },
    { key: "baths", label: "baths", data_type: "numeric", operators: operatorsForDataType("numeric"), source: "table" },
    { key: "home_type_key", label: "home_type_key", data_type: "text", operators: operatorsForDataType("text"), source: "table" },
    { key: "access_method_key", label: "access_method_key", data_type: "text", operators: operatorsForDataType("text"), source: "table" },
    { key: "square_footage_tier_key", label: "square_footage_tier_key", data_type: "text", operators: operatorsForDataType("text"), source: "table" },
    { key: "city", label: "city", data_type: "text", operators: operatorsForDataType("text"), source: "table" },
    { key: "state", label: "state", data_type: "text", operators: operatorsForDataType("text"), source: "table" },
    { key: "address1", label: "address1", data_type: "text", operators: operatorsForDataType("text"), source: "table" },
];

/** Relationship registry: derived/join fields for workflow conditions. vendor_statuses: id, key, label (no name); verticals: slug, name. */
const VENDOR_RELATIONSHIP_FIELDS: FieldCatalogEntry[] = [
    { key: "vendor_status.key", label: "vendor_status.key", data_type: "text", operators: ["eq", "neq", "in", "not_in", "exists", "is_null", "not_null"], source: "relationship" },
    { key: "vendor_status.label", label: "vendor_status.label", data_type: "text", operators: ["eq", "neq", "in", "not_in", "contains", "exists", "is_null", "not_null"], source: "relationship" },
    { key: "vendor_status.id", label: "vendor_status.id", data_type: "uuid", operators: ["eq", "neq", "in", "not_in", "exists", "is_null", "not_null"], source: "relationship" },
    { key: "vendor_vertical_ids", label: "vendor_vertical_ids", data_type: "uuid[]", operators: ["contains", "overlaps", "exists", "is_null", "not_null"], source: "relationship" },
    { key: "vendor_vertical_keys", label: "vendor_vertical_keys", data_type: "text[]", operators: ["contains", "overlaps", "exists", "is_null", "not_null"], source: "relationship" },
    { key: "vendor_vertical_names", label: "vendor_vertical_names", data_type: "text[]", operators: ["contains", "overlaps", "exists", "is_null", "not_null"], source: "relationship" },
];

/**
 * GET /api/admin/workflows/field-catalog?entity_type=vendor
 * Returns { fields: FieldCatalogEntry[] } for the given entity_type.
 * Base columns from information_schema (via RPC); vendor gets relationship fields appended.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const entityType = (searchParams.get("entity_type") ?? "").trim().toLowerCase();
    const tableName = entityType ? ENTITY_TABLE[entityType] : null;

    if (!tableName) {
        return NextResponse.json(
            { error: "Missing or invalid entity_type. Use one of: vendor, job, contact, customer, opportunity, schedule, location" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();

    const { data: rows, error } = await supabase.rpc("get_workflow_entity_columns", {
        p_table_schema: "public",
        p_table_name: tableName,
    });

    if (error) {
        console.warn("[FIELD_CATALOG] RPC error (table may not exist):", error.message);
        // Return empty base fields so UI still works; relationship fields for vendor still appended below
    }

    const baseRows = (rows ?? []) as { key: string; label: string; data_type: string; source: string }[];
    const fields: FieldCatalogEntry[] = baseRows.map((r) => ({
        key: r.key,
        label: r.label,
        data_type: r.data_type ?? "text",
        operators: operatorsForDataType(r.data_type ?? "text"),
        source: r.source ?? "table",
    }));

    // Append relationship/join fields for vendor
    if (entityType === "vendor" || entityType === "vendors") {
        fields.push(...VENDOR_RELATIONSHIP_FIELDS);
    }

    if (entityType === "location" || entityType === "locations") {
        const byKey = new Set(fields.map((f) => f.key));
        for (const f of LOCATION_FIELD_CATALOG_FALLBACK) {
            if (!byKey.has(f.key)) {
                fields.push(f);
                byKey.add(f.key);
            }
        }
    }

    return NextResponse.json({ fields });
}
