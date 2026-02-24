import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list jobs for current org. Admin/ops. Exclude archived by default. */
export async function GET(request: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const includeArchived = searchParams.get("include_archived") === "true";
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 200);

  const supabase = createAdminClient();
  let q = supabase
    .from("jobs")
    .select(
      "id, created_at, title, description, job_status_id, is_recurring, customer_id, assigned_vendor_id, location_id, metadata, archived_at",
      { count: "exact" }
    )
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeArchived) {
    q = q.is("archived_at", null);
  }

  if (search) {
    const safe = search.replace(/,/g, " ").trim();
    const term = `%${safe}%`;
    q = q.or(`title.ilike.${term},job_number_for_customer.ilike.${term}`);
  }

  const { data: rows, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = rows ?? [];
  const customerIds = [...new Set(jobs.map((j) => (j as { customer_id?: string }).customer_id).filter(Boolean))] as string[];
  const vendorIds = [...new Set(jobs.map((j) => (j as { assigned_vendor_id?: string }).assigned_vendor_id).filter(Boolean))] as string[];
  const locationIds = [...new Set(jobs.map((j) => (j as { location_id?: string }).location_id).filter(Boolean))] as string[];
  const { data: custRows } = customerIds.length
    ? await supabase.from("customers").select("id, name").in("id", customerIds)
    : { data: [] };
  const { data: vendorRows } = vendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", vendorIds)
    : { data: [] };
  const { data: locationRows } = locationIds.length
    ? await supabase.from("locations").select("id, label, address1, city, postal_code").in("id", locationIds)
    : { data: [] };
  const customerMap = new Map((custRows ?? []).map((c) => [(c as { id: string }).id, (c as { name: string | null }).name ?? null]));
  const vendorMap = new Map((vendorRows ?? []).map((v) => [(v as { id: string }).id, (v as { name: string | null }).name ?? null]));
  const locationMap = new Map((locationRows ?? []).map((loc) => {
    const l = loc as { id: string; label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null };
    const summary = l.label ?? [l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null;
    return [l.id, summary];
  }));

  const result = jobs.map((j) => ({
    ...j,
    _customer_name: (j as { customer_id?: string }).customer_id ? customerMap.get((j as { customer_id: string }).customer_id) ?? null : null,
    _assigned_vendor_name: (j as { assigned_vendor_id?: string }).assigned_vendor_id ? vendorMap.get((j as { assigned_vendor_id: string }).assigned_vendor_id) ?? null : null,
    _location_label: (j as { location_id?: string }).location_id ? locationMap.get((j as { location_id: string }).location_id) ?? null : null,
  }));

  return NextResponse.json({ jobs: result, total: count ?? result.length });
}

/** POST: create job. Admin only. customer_id, job_status_id, is_recurring required. org_id from context. */
export async function POST(request: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }
  const customer_id = typeof body.customer_id === "string" ? body.customer_id.trim() : null;
  const job_status_id = typeof body.job_status_id === "string" ? body.job_status_id.trim() : null;
  const is_recurring = body.is_recurring;

  if (!customer_id) {
    return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  }
  if (!job_status_id) {
    return NextResponse.json({ error: "job_status_id is required" }, { status: 400 });
  }
  if (typeof is_recurring !== "boolean") {
    return NextResponse.json({ error: "is_recurring is required (boolean)" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, org_id")
    .eq("id", customer_id)
    .maybeSingle();
  if (!customer || (customer as { org_id?: string }).org_id !== ctx.orgId) {
    return NextResponse.json({ error: "Customer not found or does not belong to your org" }, { status: 400 });
  }

  let location_id: string | null = typeof body.location_id === "string" && body.location_id.trim() ? body.location_id.trim() : null;
  if (location_id) {
    const { data: loc } = await supabase.from("locations").select("id, org_id").eq("id", location_id).maybeSingle();
    if (!loc || (loc as { org_id?: string }).org_id !== ctx.orgId) {
      return NextResponse.json({ error: "Location not found or does not belong to your org" }, { status: 400 });
    }
  } else {
    const { data: primaryLoc } = await supabase
      .from("locations")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("customer_id", customer_id)
      .eq("location_type", "address")
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle();
    if (primaryLoc?.id) location_id = (primaryLoc as { id: string }).id;
  }

  const row: Record<string, unknown> = {
    org_id: ctx.orgId,
    customer_id,
    job_status_id,
    is_recurring,
    title: typeof body.title === "string" ? body.title.trim() || null : null,
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    assigned_vendor_id: typeof body.assigned_vendor_id === "string" && body.assigned_vendor_id.trim() ? body.assigned_vendor_id.trim() : null,
    location_id: location_id ?? undefined,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  const { data, error } = await supabase.from("jobs").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
