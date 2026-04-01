import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { parseJobDiscountSelectionInput, resolveJobDiscountSelection } from "@/lib/admin/jobDiscountSelection";
import { initializeJobPricing } from "@/lib/pricing/initializeJobPricing";
import { computeJobDisplayTotalCents } from "@/lib/admin/jobDisplayPrice";
import { buildVendorIdToLabelMap, type VendorRowForLabel } from "@/lib/admin/vendorOptionLabel";
import { assertAllowedStatusKey, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { fetchJobStatusKeyByFk, effectiveJobStatusKey } from "@/lib/admin/jobEffectiveStatusKey";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { computeJobBalanceSnapshot } from "@/lib/admin/jobPaymentBalances";

/** GET: list jobs for current org. Admin/ops. Exclude archived by default. */
export async function GET(request: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const includeArchived = searchParams.get("include_archived") === "true";
  const statusKey = (searchParams.get("status_key") ?? "").trim();
  const assignedVendorId = (searchParams.get("assigned_vendor_id") ?? "").trim();
  const workUnitIdParam = (searchParams.get("work_unit_id") ?? "").trim();
  const departmentIdParam = (searchParams.get("department_id") ?? "").trim();
  const unassignedWorkUnit = searchParams.get("unassigned_work_unit") === "true";
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 200);

  const supabase = createAdminClient();

  /** When set, restrict jobs to these work_unit ids (department filter). */
  let departmentWorkUnitIds: string[] | null = null;

  if (unassignedWorkUnit) {
    // mutually exclusive with work_unit_id / department_id (enforced on client)
  } else if (workUnitIdParam) {
    const wuOk = await assertRowOrg(supabase, "work_units", workUnitIdParam, ctx.orgId);
    if (!wuOk.ok) {
      return NextResponse.json({ error: "Work unit not found" }, { status: 404 });
    }
  } else if (departmentIdParam) {
    const depOk = await assertRowOrg(supabase, "departments", departmentIdParam, ctx.orgId);
    if (!depOk.ok) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }
    const { data: wuInDept, error: wuInDeptErr } = await supabase
      .from("work_units")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("department_id", departmentIdParam);
    if (wuInDeptErr) {
      if ((wuInDeptErr as { code?: string }).code === "42P01") {
        return NextResponse.json({ jobs: [], total: 0 });
      }
      return NextResponse.json({ error: wuInDeptErr.message }, { status: 500 });
    }
    const deptWuIds = (wuInDept ?? []).map((r) => (r as { id: string }).id);
    if (deptWuIds.length === 0) {
      return NextResponse.json({ jobs: [], total: 0 });
    }
    departmentWorkUnitIds = deptWuIds;
  }

  let q = supabase
    .from("jobs")
    .select(
      "id, created_at, updated_at, title, description, job_status_id, status_key, service_key, job_number_for_customer, is_recurring, customer_id, assigned_vendor_id, location_id, work_unit_id, metadata, archived_at, gross_price_cents, estimated_total_cents, discount_amount, discounted",
      { count: "exact" }
    )
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeArchived) {
    q = q.is("archived_at", null);
  }
  if (statusKey) {
    q = q.eq("status_key", statusKey);
  }
  if (assignedVendorId) {
    q = q.eq("assigned_vendor_id", assignedVendorId);
  }
  if (unassignedWorkUnit) {
    q = q.is("work_unit_id", null);
  } else if (workUnitIdParam) {
    q = q.eq("work_unit_id", workUnitIdParam);
  } else if (departmentWorkUnitIds) {
    q = q.in("work_unit_id", departmentWorkUnitIds);
  }

  if (search) {
    const safe = search.replace(/,/g, " ").trim();
    const term = `%${safe}%`;
    q = q.or(`title.ilike.${term},job_number_for_customer.ilike.${term}`);
  }

  const { data: rows, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobs = rows ?? [];
  const jobIds = jobs.map((j) => (j as { id: string }).id);
  const customerIds = [...new Set(jobs.map((j) => (j as { customer_id?: string }).customer_id).filter(Boolean))] as string[];
  const vendorIds = [...new Set(jobs.map((j) => (j as { assigned_vendor_id?: string }).assigned_vendor_id).filter(Boolean))] as string[];
  const locationIds = [...new Set(jobs.map((j) => (j as { location_id?: string }).location_id).filter(Boolean))] as string[];
  const workUnitIds = [
    ...new Set(jobs.map((j) => (j as { work_unit_id?: string | null }).work_unit_id).filter(Boolean)),
  ] as string[];
  let jobStatusLabelByKey = new Map<string, string>();
  try {
    const defs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "jobs", { activeOnly: true });
    jobStatusLabelByKey = new Map(defs.map((d) => [d.status_key, (d.status_label && d.status_label.trim()) || d.status_key]));
  } catch {
    jobStatusLabelByKey = new Map();
  }

  const jobStatusFkIds = jobs.map((j) => (j as { job_status_id?: string | null }).job_status_id);
  const jobKeyByFk = await fetchJobStatusKeyByFk(supabase, jobStatusFkIds);

  const [custRes, vendorRes, locationRes, nextSchedulesRes] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : { data: [] },
    vendorIds.length
      ? supabase.from("vendors").select("id, name, company_name, email, phone, primary_person_id").in("id", vendorIds)
      : { data: [] },
    locationIds.length ? supabase.from("locations").select("id, label, address1, city, postal_code").in("id", locationIds) : { data: [] },
    jobIds.length
      ? supabase
          .from("schedules")
          .select("job_id, start_at")
          .in("job_id", jobIds)
          .is("canceled_at", null)
          .gte("start_at", new Date().toISOString())
          .order("start_at", { ascending: true })
      : { data: [] },
  ]);

  const customerMap = new Map((custRes.data ?? []).map((c) => [(c as { id: string }).id, (c as { name: string | null }).name ?? null]));
  const vendorRows = (vendorRes.data ?? []) as VendorRowForLabel[];
  const vendorPersonIds = [...new Set(vendorRows.map((v) => v.primary_person_id).filter(Boolean))] as string[];
  const { data: vendorPersons } =
    vendorPersonIds.length > 0
      ? await supabase.from("persons").select("id, first_name, last_name").in("id", vendorPersonIds)
      : { data: [] as { id: string; first_name?: string | null; last_name?: string | null }[] };
  const vendorLabelById = buildVendorIdToLabelMap(vendorRows, vendorPersons ?? []);
  const locationMap = new Map((locationRes.data ?? []).map((loc) => {
    const l = loc as { id: string; label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null };
    const summary = l.label ?? ([l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null);
    return [l.id, summary];
  }));
  const nextScheduleByJobId = new Map<string, string>();
  for (const s of nextSchedulesRes.data ?? []) {
    const row = s as { job_id: string; start_at: string };
    if (!nextScheduleByJobId.has(row.job_id)) nextScheduleByJobId.set(row.job_id, row.start_at);
  }

  type WuRow = { id: string; name: string | null; department_id: string };
  let workUnitById = new Map<string, WuRow>();
  let deptNameById = new Map<string, string | null>();
  if (workUnitIds.length > 0) {
    const { data: wuData, error: wuErr } = await supabase
      .from("work_units")
      .select("id, name, department_id")
      .in("id", workUnitIds)
      .eq("org_id", ctx.orgId);
    if (!wuErr && wuData) {
      const wuRows = wuData as WuRow[];
      workUnitById = new Map(wuRows.map((w) => [w.id, w]));
      const deptIds = [...new Set(wuRows.map((w) => w.department_id))];
      if (deptIds.length > 0) {
        const { data: depData } = await supabase
          .from("departments")
          .select("id, name")
          .in("id", deptIds)
          .eq("org_id", ctx.orgId);
        deptNameById = new Map(
          (depData ?? []).map((d) => [(d as { id: string }).id, (d as { name: string | null }).name ?? null])
        );
      }
    }
  }

  const result = jobs.map((j) => {
    const jr = j as {
      id: string;
      title?: string | null;
      service_key?: string | null;
      job_number_for_customer?: string | null;
      status_key?: string | null;
      job_status_id?: string | null;
      updated_at?: string | null;
      created_at?: string;
      gross_price_cents?: number | null;
      estimated_total_cents?: number | null;
      discount_amount?: number | null;
      discounted?: boolean | null;
      customer_id?: string | null;
      assigned_vendor_id?: string | null;
      location_id?: string | null;
      work_unit_id?: string | null;
    };
    const wuid = jr.work_unit_id ?? null;
    let _work_unit_label: string | null = null;
    if (wuid) {
      const wu = workUnitById.get(wuid);
      if (wu) {
        const dname = deptNameById.get(wu.department_id) ?? null;
        const uname = wu.name ?? null;
        _work_unit_label =
          dname && uname ? `${dname} · ${uname}` : (uname ?? dname ?? null);
      }
    }
    const _job_label =
      (jr.title && String(jr.title).trim()) ||
      (jr.service_key && String(jr.service_key).trim()) ||
      (jr.job_number_for_customer && String(jr.job_number_for_customer).trim()) ||
      (jr.id ? jr.id.slice(-6) : "—");
    const effectiveSk = effectiveJobStatusKey(
      { status_key: jr.status_key, job_status_id: jr.job_status_id },
      jobKeyByFk
    );
    const _status_display = effectiveSk ? (jobStatusLabelByKey.get(effectiveSk) ?? effectiveSk) : null;
    const _next_schedule = nextScheduleByJobId.get(jr.id) ?? null;
    const _vendor_name = jr.assigned_vendor_id ? vendorLabelById.get(jr.assigned_vendor_id) ?? null : null;
    const display_total_cents = computeJobDisplayTotalCents(jr);
    const _price_display = display_total_cents != null ? display_total_cents / 100 : null;
    const _updated = jr.updated_at ?? jr.created_at ?? null;
    return {
      ...j,
      status_key: effectiveSk,
      _customer_name: jr.customer_id ? customerMap.get(jr.customer_id) ?? null : null,
      _assigned_vendor_name: _vendor_name,
      _vendor_name,
      _location_label: jr.location_id ? locationMap.get(jr.location_id) ?? null : null,
      _work_unit_label,
      _job_label,
      _status_display,
      _next_schedule,
      display_total_cents,
      _price_display,
      _updated,
    };
  });

  const balanceSnaps =
    result.length > 0
      ? await Promise.all(
          result.map((row) => computeJobBalanceSnapshot(supabase, ctx.orgId, (row as { id: string }).id))
        )
      : [];
  const withReceivables = result.map((row, i) => {
    const snap = balanceSnaps[i];
    return {
      ...row,
      receivable_paid_cents: snap?.paid_amount_cents ?? 0,
      receivable_outstanding_cents: snap?.outstanding_balance_cents ?? null,
    };
  });

  return NextResponse.json({ jobs: withReceivables, total: count ?? withReceivables.length });
}

/** POST: create job. Admin only. customer_id and status_key (must exist in status_definitions for jobs) required. */
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
  const body_status_key = typeof body.status_key === "string" ? body.status_key.trim() : null;
  const is_recurring = body.is_recurring === true;
  const service_frequency_key = typeof body.service_frequency_key === "string" ? body.service_frequency_key.trim() || null : null;
  const gross_price_cents = typeof body.gross_price_cents === "number" && Number.isFinite(body.gross_price_cents) ? Math.round(body.gross_price_cents) : null;
  const primary_contact_id = typeof body.primary_contact_id === "string" && body.primary_contact_id.trim() ? body.primary_contact_id.trim() : null;
  const discount_selection_raw =
    typeof body.discount_code_id === "string" && body.discount_code_id.trim() ? body.discount_code_id.trim() : null;

  if (!customer_id) {
    return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const status_key = body_status_key;
  if (!status_key) {
    return NextResponse.json({ error: "status_key is required" }, { status: 400 });
  }
  const statusCheck = await assertAllowedStatusKey(supabase, ctx.orgId, "jobs", status_key);
  if (!statusCheck.ok) {
    return NextResponse.json({ error: statusCheck.message }, { status: 400 });
  }
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

  if (primary_contact_id) {
    const { data: contact } = await supabase.from("contacts").select("id, customer_id, org_id").eq("id", primary_contact_id).maybeSingle();
    if (!contact || (contact as { org_id?: string }).org_id !== ctx.orgId || (contact as { customer_id?: string }).customer_id !== customer_id) {
      return NextResponse.json({ error: "Primary contact not found or does not belong to this customer" }, { status: 400 });
    }
  }

  let job_vertical_slug: string | null = null;
  const body_vertical_id = typeof body.vertical_id === "string" && body.vertical_id.trim() ? body.vertical_id.trim() : null;
  if (body_vertical_id) {
    const { data: vert } = await supabase.from("verticals").select("slug").eq("id", body_vertical_id).maybeSingle();
    job_vertical_slug = (vert as { slug?: string | null } | null)?.slug ?? null;
  }

  let discount_code: string | null = null;
  let discount_amount: number = 0;
  let discounted = false;
  let discount_code_id: string | null = null;
  let discount_program_id: string | null = null;
  const parsedDiscount = discount_selection_raw ? parseJobDiscountSelectionInput(discount_selection_raw) : null;
  if (parsedDiscount) {
    const resolved = await resolveJobDiscountSelection(supabase, parsedDiscount, gross_price_cents ?? 0, job_vertical_slug, ctx.orgId);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    discount_code_id = resolved.value.discount_code_id;
    discount_program_id = resolved.value.discount_program_id;
    discount_code = resolved.value.discount_code;
    discount_amount = resolved.value.discount_amount;
    discounted = resolved.value.discounted;
  }

  const row: Record<string, unknown> = {
    org_id: ctx.orgId,
    customer_id,
    status_key,
    is_recurring,
    service_frequency_key: service_frequency_key ?? null,
    gross_price_cents: gross_price_cents ?? null,
    primary_contact_id: primary_contact_id ?? null,
    title: typeof body.title === "string" ? body.title.trim() || null : null,
    description: typeof body.description === "string" ? body.description.trim() || null : null,
    assigned_vendor_id: typeof body.assigned_vendor_id === "string" && body.assigned_vendor_id.trim() ? body.assigned_vendor_id.trim() : null,
    location_id: location_id ?? undefined,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    discount_code_id: discount_code_id ?? null,
    discount_program_id: discount_program_id ?? null,
    discount_code,
    discount_amount,
    discounted,
  };

  const { data, error } = await supabase.from("jobs").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Insert failed" }, { status: 400 });

  const jobId = (data as { id: string }).id;
  const grossCents = gross_price_cents;
  const discCents = discounted ? Math.round(Number(discount_amount)) : 0;
  const pricingInit = await initializeJobPricing({
    supabase,
    orgId: ctx.orgId,
    jobId,
    quoteData: {
      grossFirstVisitCents: grossCents,
      netFirstVisitCents: null,
      recurringCents: null,
      quoteOutput: null,
      frequencyLabel: null,
    },
    addons: [],
    discount: {
      enabled: discounted && discCents > 0,
      amount_cents: discCents > 0 ? discCents : null,
      discount_code,
      discount_code_id,
      discount_program_id,
    },
    source: "admin",
    skipIfActiveLines: false,
    actorUserId: ctx.userId,
  });

  if (!pricingInit.ok) {
    return NextResponse.json({ error: pricingInit.error, job: data }, { status: 500 });
  }

  return NextResponse.json(data);
}
