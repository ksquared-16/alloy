import { createAdminClient } from "@/lib/supabaseAdmin";
import { vendorRowToDisplayStub, type VendorRowForLabel } from "@/lib/admin/vendorOptionLabel";

type AdminClient = ReturnType<typeof createAdminClient>;

export type RelationshipEntityKind =
    | "customer"
    | "job"
    | "location"
    | "person"
    | "vendor"
    | "opportunity"
    | "schedule"
    | "contact";

/** Compact FK target for drawer/detail APIs (not a field_values field). */
export type RelationshipDisplayStub = {
    id: string;
    entity_type: RelationshipEntityKind;
    label: string;
    record_number?: number | null;
};

function numOrNull(v: unknown): number | null {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function contactLabel(c: { first_name?: string | null; last_name?: string | null; email?: string | null }): string {
    const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    if (n) return n;
    return (c.email && String(c.email).trim()) || "—";
}

type FkSpec = { column: string; kind: RelationshipEntityKind };

const DRAWER_FK_SPECS: Record<string, FkSpec[]> = {
    jobs: [
        { column: "customer_id", kind: "customer" },
        { column: "location_id", kind: "location" },
        { column: "opportunity_id", kind: "opportunity" },
        { column: "assigned_vendor_id", kind: "vendor" },
        { column: "primary_person_id", kind: "person" },
        { column: "primary_contact_id", kind: "contact" },
    ],
    customers: [{ column: "primary_contact_id", kind: "contact" }],
    opportunities: [
        { column: "customer_id", kind: "customer" },
        { column: "location_id", kind: "location" },
        { column: "primary_person_id", kind: "person" },
        { column: "primary_contact_id", kind: "contact" },
    ],
    locations: [
        { column: "customer_id", kind: "customer" },
        { column: "vendor_id", kind: "vendor" },
    ],
    schedules: [
        { column: "job_id", kind: "job" },
        { column: "location_id", kind: "location" },
        { column: "assigned_vendor_id", kind: "vendor" },
    ],
    vendors: [{ column: "primary_person_id", kind: "person" }],
};

const STUB_KEY = (kind: RelationshipEntityKind, id: string) => `${kind}:${id}`;

/**
 * Sets `out._relationship_displays` keyed by FK column name (e.g. customer_id → stub).
 * Direct FK fields only; collections stay separate.
 */
export async function attachDirectFkRelationshipDisplays(
    supabase: AdminClient,
    orgId: string,
    drawerType: string,
    out: Record<string, unknown>
): Promise<void> {
    const specs = DRAWER_FK_SPECS[drawerType];
    if (!specs?.length) {
        out._relationship_displays = {};
        return;
    }

    const byKind = new Map<RelationshipEntityKind, Set<string>>();
    for (const { column, kind } of specs) {
        const raw = out[column];
        if (typeof raw === "string" && raw.trim()) {
            const id = raw.trim();
            if (!byKind.has(kind)) byKind.set(kind, new Set());
            byKind.get(kind)!.add(id);
        }
    }

    const stubByKey = new Map<string, RelationshipDisplayStub>();

    const customerIds = byKind.get("customer");
    if (customerIds?.size) {
        const { data: rows } = await supabase
            .from("customers")
            .select("id, name, customer_number")
            .eq("org_id", orgId)
            .in("id", [...customerIds]);
        for (const r of rows ?? []) {
            const row = r as { id: string; name?: string | null; customer_number?: unknown };
            stubByKey.set(STUB_KEY("customer", row.id), {
                id: row.id,
                entity_type: "customer",
                label: (row.name && String(row.name).trim()) || "—",
                record_number: numOrNull(row.customer_number),
            });
        }
    }

    const jobIds = byKind.get("job");
    if (jobIds?.size) {
        const { data: rows } = await supabase
            .from("jobs")
            .select("id, title, service_key, job_number, job_number_for_customer")
            .eq("org_id", orgId)
            .in("id", [...jobIds]);
        for (const r of rows ?? []) {
            const row = r as {
                id: string;
                title?: string | null;
                service_key?: string | null;
                job_number?: unknown;
                job_number_for_customer?: number | null;
            };
            const jn = numOrNull(row.job_number);
            const label =
                (row.title && String(row.title).trim()) ||
                (row.service_key && String(row.service_key).trim()) ||
                (jn != null ? `Job #${jn}` : row.job_number_for_customer != null ? `Job #${row.job_number_for_customer}` : row.id.slice(0, 8));
            stubByKey.set(STUB_KEY("job", row.id), {
                id: row.id,
                entity_type: "job",
                label,
                record_number: jn,
            });
        }
    }

    const locationIds = byKind.get("location");
    if (locationIds?.size) {
        const { data: rows } = await supabase
            .from("locations")
            .select("id, label, address1, city, postal_code, location_number")
            .eq("org_id", orgId)
            .in("id", [...locationIds]);
        for (const r of rows ?? []) {
            const row = r as {
                id: string;
                label?: string | null;
                address1?: string | null;
                city?: string | null;
                postal_code?: string | null;
                location_number?: unknown;
            };
            const lbl =
                (row.label && String(row.label).trim()) ||
                [row.address1, row.city, row.postal_code].filter(Boolean).join(", ") ||
                "—";
            stubByKey.set(STUB_KEY("location", row.id), {
                id: row.id,
                entity_type: "location",
                label: lbl,
                record_number: numOrNull(row.location_number),
            });
        }
    }

    const personIds = byKind.get("person");
    if (personIds?.size) {
        const { data: rows } = await supabase
            .from("persons")
            .select("id, first_name, last_name, full_name, email, person_number")
            .eq("org_id", orgId)
            .in("id", [...personIds]);
        for (const r of rows ?? []) {
            const row = r as {
                id: string;
                first_name?: string | null;
                last_name?: string | null;
                full_name?: string | null;
                email?: string | null;
                person_number?: unknown;
            };
            const nm =
                (row.full_name && String(row.full_name).trim()) ||
                [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
                (row.email && String(row.email).trim()) ||
                "—";
            stubByKey.set(STUB_KEY("person", row.id), {
                id: row.id,
                entity_type: "person",
                label: nm,
                record_number: numOrNull(row.person_number),
            });
        }
    }

    const vendorIds = byKind.get("vendor");
    if (vendorIds?.size) {
        const { data: rows } = await supabase
            .from("vendors")
            .select("id, name, company_name, email, phone, primary_person_id, vendor_number")
            .eq("org_id", orgId)
            .in("id", [...vendorIds]);
        const vRows = (rows ?? []) as (VendorRowForLabel & { vendor_number?: unknown })[];
        const ppIds = [...new Set(vRows.map((v) => v.primary_person_id).filter(Boolean))] as string[];
        const { data: persons } =
            ppIds.length > 0
                ? await supabase.from("persons").select("id, first_name, last_name").eq("org_id", orgId).in("id", ppIds)
                : { data: [] as { id: string; first_name?: string | null; last_name?: string | null }[] };
        const personById = new Map((persons ?? []).map((p) => [p.id, p]));
        for (const row of vRows) {
            const person = row.primary_person_id ? personById.get(row.primary_person_id) ?? null : null;
            const stub = vendorRowToDisplayStub(row, person);
            stubByKey.set(STUB_KEY("vendor", row.id), {
                id: row.id,
                entity_type: "vendor",
                label: stub.name,
                record_number: numOrNull(row.vendor_number),
            });
        }
    }

    const opportunityIds = byKind.get("opportunity");
    if (opportunityIds?.size) {
        const { data: rows } = await supabase
            .from("opportunities")
            .select("id, name, title, opportunity_number")
            .eq("org_id", orgId)
            .in("id", [...opportunityIds]);
        for (const r of rows ?? []) {
            const row = r as { id: string; name?: string | null; title?: string | null; opportunity_number?: unknown };
            const lbl = (row.name && String(row.name).trim()) || (row.title && String(row.title).trim()) || "—";
            stubByKey.set(STUB_KEY("opportunity", row.id), {
                id: row.id,
                entity_type: "opportunity",
                label: lbl,
                record_number: numOrNull(row.opportunity_number),
            });
        }
    }

    const contactIds = byKind.get("contact");
    if (contactIds?.size) {
        const { data: rows } = await supabase
            .from("contacts")
            .select("id, first_name, last_name, email")
            .eq("org_id", orgId)
            .in("id", [...contactIds]);
        for (const r of rows ?? []) {
            const row = r as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
            stubByKey.set(STUB_KEY("contact", row.id), {
                id: row.id,
                entity_type: "contact",
                label: contactLabel(row),
            });
        }
    }

    const displays: Record<string, RelationshipDisplayStub | null> = {};
    for (const { column, kind } of specs) {
        const raw = out[column];
        if (typeof raw !== "string" || !raw.trim()) {
            displays[column] = null;
            continue;
        }
        displays[column] = stubByKey.get(STUB_KEY(kind, raw.trim())) ?? null;
    }
    out._relationship_displays = displays;
}
