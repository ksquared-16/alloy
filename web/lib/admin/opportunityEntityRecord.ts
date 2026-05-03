import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { attachDirectFkRelationshipDisplays } from "@/lib/admin/relationshipDisplayAttach";
import { attachFieldDefinitionsAndValues } from "@/lib/admin/entityFieldRegistryAttach";
import {
  buildOpportunityLifecycleFields,
  effectiveOpportunityQuoteDollars,
} from "@/lib/admin/opportunityLifecyclePresentation";
import {
  fetchEffectiveStatusDefinitionsTagged,
  displayLabelsFromDefinitions,
  resolveDisplayFromLabelMap,
} from "@/lib/admin/statusDefinitionsResolve";
import type { FieldRegistryAttachMeta } from "@/lib/admin/entityFieldRegistryAttach";
import { isUuidLike } from "@/lib/admin/overviewRelationshipLabels";
import { batchOptionItemLabelsForOrg, optionLabelFromBatchMap } from "@/lib/admin/optionItemLabelForOrg";
import { logDbTiming, withDbTiming } from "@/lib/admin/dbQueryTiming";

type AdminSupabase = ReturnType<typeof createAdminClient>;

/** Person row shape shared by primary shell fetch and member→person hydrate (DOB for inquiry_children). */
type WarmPersonRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
};

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function ageFromDobIso(
  dobIso: string | null | undefined,
): { years: number; months: number; label: string } | null {
  const raw = String(dobIso ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  const dayDelta = now.getDate() - d.getDate();
  if (dayDelta < 0) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;
  const label =
    years >= 2
      ? `${years}y`
      : years >= 1
        ? `${years}y ${months}m`
        : `${Math.max(0, years * 12 + months)}m`;
  return { years, months, label };
}

async function resolveCustomerPersonRole(
  supabase: AdminSupabase,
  params: { orgId: string; customerId: string; personId: string },
): Promise<{ role_key: string | null; role_label: string | null }> {
  const { data: cp } = await supabase
    .from("customer_persons")
    .select("role_type")
    .eq("org_id", params.orgId)
    .eq("customer_id", params.customerId)
    .eq("person_id", params.personId)
    .maybeSingle();
  const roleType = trimOrNull(
    (cp as { role_type?: string | null } | null)?.role_type,
  );
  if (!roleType) return { role_key: null, role_label: null };
  const { data: rt } = await supabase
    .from("customer_person_role_types")
    .select("label")
    .eq("org_id", params.orgId)
    .eq("key", roleType)
    .maybeSingle();
  const roleLabel = trimOrNull((rt as { label?: string | null } | null)?.label);
  return { role_key: roleType, role_label: roleLabel };
}

/**
 * Opportunity record resolution for `GET /api/admin/entity/opportunities/:id`.
 * Centralizes enrichment, surfaces, lifecycle + quote parity (drawer_visible vs full).
 *
 * Data split (drawer UX):
 * - **drawer_visible (fast shell):** native row + minimal FK labels (pipeline stage placeholder, household name,
 *   primary person/contact identity strings), lifecycle + quote shells, cached opportunity status defs, empty
 *   `_relationship_displays`, `_field_definitions`, `_opportunity_persons`, `_inquiry_children` — enough for header + hero.
 * - **surface=full (background hydrate):** field_definitions + sections + field_values merge, FK relationship stubs,
 *   inquiry_children (OCM + option labels), `_opportunity_persons`, richer `_identity` roles + child picker, pipelines
 *   / discount / vertical / location context.
 * Secondary UI (documents, workflows run lists, enrollment forms, Communications thread list beyond prefetch) pulls
 * from other routes or mounts lazily inside the drawer.
 */
export async function respondOpportunityEntityGet(
  supabase: AdminSupabase,
  orgId: string,
  id: string,
  request: NextRequest,
): Promise<NextResponse> {
  const opportunityRouteStartedAt = Date.now();
  const { data, error } = await withDbTiming(
    "opportunities.select_by_id",
    { orgId, id },
    async () =>
      supabase
        .from("opportunities")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .single(),
  );
  if (error || !data)
    return NextResponse.json(error?.message || "Not found", {
      status: error?.code === "PGRST116" ? 404 : 500,
    });
  const opp = data as Record<string, unknown> & {
    status_key?: string | null;
    status?: string | null;
    customer_id?: string | null;
    primary_contact_id?: string | null;
    primary_person_id?: string | null;
    location_id?: string | null;
    quote_total?: number | null;
    estimated_price_cents?: number | null;
    monetary_value_cents?: number | null;
  };
  const out: Record<string, unknown> = { ...data };
  const surfaceParamEarly = (request.nextUrl.searchParams.get("surface") ?? "")
    .trim()
    .toLowerCase();
  const wuidForDept = trimOrNull(
    (opp as { work_unit_id?: string | null }).work_unit_id,
  );
  const oppPipelineStageId =
    (opp as { pipeline_stage_id?: string | null }).pipeline_stage_id ?? null;
  const oppPipelineId =
    (opp as { pipeline_id?: string | null }).pipeline_id ?? null;
  const oppDprogId =
    (opp as { discount_program_id?: string | null }).discount_program_id ??
    null;
  const oppOrgIdForDefs = (opp as { org_id?: string }).org_id;
  const personDisplayName = (
    p: {
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    } | null,
  ) =>
    p
      ? (p.full_name && p.full_name.trim()) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        null
      : null;
  const primaryPersonContactP = (async (): Promise<{
    patch: Record<string, unknown>;
    /** Person rows loaded for drawer shell IDs — reused later to trim member→person lookups on full hydrate. */
    warmPersonRows: WarmPersonRow[];
  }> => {
    const patch: Record<string, unknown> = {};
    const warmPersonRows: WarmPersonRow[] = [];
    if (opp.primary_person_id) {
      const { data: person } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email, phone, date_of_birth")
        .eq("id", opp.primary_person_id)
        .eq("org_id", orgId)
        .maybeSingle();
      const p = person as WarmPersonRow | null;
      if (p?.id) warmPersonRows.push(p);
      patch._primary_person_id = p?.id ?? null;
      patch._primary_person_name = personDisplayName(p);
      patch._primary_person_email = trimOrNull(p?.email);
      patch._primary_person_phone = trimOrNull(p?.phone);
      patch._contact_name = patch._primary_person_name;
      patch._primary_contact_name = patch._primary_person_name;
    } else if (opp.primary_contact_id) {
      // LEGACY_COMPAT: fallback display/load via compatibility contact when primary_person_id is unset.
      const contact = await supabase
        .from("contacts")
        .select("first_name, last_name, person_id, email, phone")
        .eq("id", opp.primary_contact_id)
        .eq("org_id", orgId)
        .single();
      const c = contact.data;
      const name = c
        ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null
        : null;
      patch._contact_name = name;
      patch._primary_contact_name = name;
      patch._primary_contact_email = trimOrNull(
        (c as { email?: string | null } | null)?.email,
      );
      patch._primary_contact_phone = trimOrNull(
        (c as { phone?: string | null } | null)?.phone,
      );
      if (c && (c as { person_id?: string | null }).person_id) {
        const { data: person } = await supabase
          .from("persons")
          .select("id, first_name, last_name, full_name, email, phone, date_of_birth")
          .eq("id", (c as { person_id: string }).person_id)
          .eq("org_id", orgId)
          .maybeSingle();
        const p = person as WarmPersonRow | null;
        if (p?.id) warmPersonRows.push(p);
        patch._primary_person_id = p?.id ?? null;
        patch._primary_person_name = personDisplayName(p);
        if (!patch._primary_contact_email && p?.email)
          patch._primary_contact_email = trimOrNull(p.email);
        if (!patch._primary_contact_phone && p?.phone)
          patch._primary_contact_phone = trimOrNull(p.phone);
      } else {
        patch._primary_person_id = null;
        patch._primary_person_name = null;
      }
    } else {
      patch._contact_name = null;
      patch._primary_contact_name = null;
      patch._primary_person_id = null;
      patch._primary_person_name = null;
    }
    return { patch, warmPersonRows };
  })();

  if (surfaceParamEarly === "drawer_visible") {
    const enrichStartedAt = Date.now();
    const enrichPhaseMs: Record<string, number> = {};
    const markVisiblePhase = (key: string) => {
      enrichPhaseMs[key] = Date.now() - enrichStartedAt;
    };
    const tParVis0 = Date.now();
    const [
      wuDeptRowV,
      customerRowV,
      stRowV,
      primaryHydrV,
      opportunityDefsVisible,
    ] = await Promise.all([
      wuidForDept
        ? supabase
            .from("work_units")
            .select("department_id")
            .eq("id", wuidForDept)
            .eq("org_id", orgId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      opp.customer_id
        ? supabase
            .from("customers")
            .select("name")
            .eq("id", opp.customer_id)
            .eq("org_id", orgId)
            .single()
        : Promise.resolve({ data: null }),
      oppPipelineStageId
        ? supabase
            .from("pipeline_stages")
            .select("name")
            .eq("id", oppPipelineStageId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      primaryPersonContactP,
      oppOrgIdForDefs
        ? fetchEffectiveStatusDefinitionsTagged(supabase, oppOrgIdForDefs, "opportunities", {
            activeOnly: true,
          }).then((p) => p.rows)
        : Promise.resolve([]),
    ]);
    logDbTiming("opportunityEntity.drawer_visible_parallel", Date.now() - tParVis0, {
      orgId,
      id,
    });
    markVisiblePhase("visible_after_parallel");
    const vis: Record<string, unknown> = { ...data };
    vis._work_unit_department_id = wuidForDept
      ? trimOrNull(
          (wuDeptRowV.data as { department_id?: string | null } | null)
            ?.department_id ?? null,
        )
      : null;
    vis._customer_name =
      (customerRowV.data as { name?: string | null } | null)?.name ?? null;
    if (oppPipelineStageId) {
      const stName =
        (stRowV.data as { name?: string | null } | null)?.name ?? null;
      vis._pipeline_stage_name = stName;
      vis._stage_name = stName;
    } else {
      vis._pipeline_stage_name = null;
      vis._stage_name = null;
    }
    vis._pipeline_name = null;
    vis._discount_program_label = null;
    vis._vertical_name = null;
    if (opp.location_id) {
      vis._location_id = opp.location_id;
      vis._location_name = null;
      vis._location_label = null;
    } else {
      vis._location_id = null;
      vis._location_name = null;
      vis._location_label = null;
    }
    Object.assign(vis, primaryHydrV.patch);
    markVisiblePhase("visible_after_primary_person_contact");
    const oppLegacyStatusV = (opp as { status?: string | null }).status;
    const oppSkRawV =
      opp.status_key != null && String(opp.status_key).trim() !== ""
        ? String(opp.status_key).trim()
        : oppLegacyStatusV != null && String(oppLegacyStatusV).trim() !== ""
          ? String(oppLegacyStatusV).trim()
          : null;
    const stageLabelV =
      vis._pipeline_stage_name != null &&
      String(vis._pipeline_stage_name).trim() !== ""
        ? String(vis._pipeline_stage_name).trim()
        : null;
    let oppStatusDisplayV: string | null = null;
    if (
      oppPipelineStageId &&
      oppSkRawV &&
      String(oppSkRawV) === String(oppPipelineStageId) &&
      stageLabelV
    ) {
      oppStatusDisplayV = stageLabelV;
    } else if (oppSkRawV && !isUuidLike(oppSkRawV)) {
      oppStatusDisplayV = oppSkRawV;
    } else if (stageLabelV) {
      oppStatusDisplayV = stageLabelV;
    } else {
      oppStatusDisplayV = oppSkRawV;
    }
    vis._status_display = oppStatusDisplayV;
    const qtV = effectiveOpportunityQuoteDollars(opp);
    vis._quote_total_display = qtV;
    Object.assign(
      vis,
      buildOpportunityLifecycleFields({
        statusKey: oppSkRawV,
        quoteTotalDollars: qtV,
        defs: opportunityDefsVisible,
      }),
    );
    markVisiblePhase("visible_after_status_shell");
    vis._field_definitions = [];
    vis._record_surface = "drawer_visible";
    vis._inquiry_children = [];
    vis._opportunity_persons = [];
    vis._relationship_displays = {};
    const householdIdV =
      typeof opp.customer_id === "string" && opp.customer_id.trim()
        ? opp.customer_id.trim()
        : null;
    const householdLabelV = trimOrNull(vis._customer_name) ?? "—";
    const inquiryTitleEarlyV =
      trimOrNull(vis.name) ?? trimOrNull(vis.title) ?? "—";
    vis._identity = {
      household: householdIdV
        ? { id: householdIdV, label: householdLabelV }
        : null,
      primary_person: opp.primary_person_id
        ? {
            id: String(opp.primary_person_id),
            label: trimOrNull(vis._primary_person_name) ?? "—",
            email: trimOrNull(vis._primary_person_email),
            phone: trimOrNull(vis._primary_person_phone),
            role_key: null,
            role_label: null,
          }
        : null,
      primary_contact: opp.primary_contact_id
        ? {
            id: String(opp.primary_contact_id),
            label: trimOrNull(vis._primary_contact_name) ?? "—",
            email: trimOrNull(vis._primary_contact_email),
            phone: trimOrNull(vis._primary_contact_phone),
            role_key: null,
            role_label: null,
          }
        : null,
      primary_child: null,
      inquiry: { title: inquiryTitleEarlyV, lines: [], section_key: "quote" },
    };
    markVisiblePhase("visible_after_identity_block");
    const enrichTotalMsV = Date.now() - enrichStartedAt;
    const enrichHeaderV =
      JSON.stringify({ total_ms: enrichTotalMsV, phases_ms: enrichPhaseMs })
        .length < 3900
        ? JSON.stringify({ total_ms: enrichTotalMsV, phases_ms: enrichPhaseMs })
        : JSON.stringify({ total_ms: enrichTotalMsV, phases_ms: {} });
    const serverRouteMsV = Date.now() - opportunityRouteStartedAt;
    const visibleLogMs = enrichTotalMsV;
    if (process.env.NODE_ENV !== "production" || visibleLogMs > 200) {
      console.warn("[timing][opportunity-api-visible]", {
        opportunity_id: id,
        enrich_ms: enrichTotalMsV,
        enrich_phases_ms: enrichPhaseMs,
        server_route_ms: serverRouteMsV,
        surface: "drawer_visible",
      });
    }
    return NextResponse.json(vis, {
      headers: {
        "X-Alloy-Entity-Surface": "drawer_visible",
        "X-Alloy-Opp-Enrich": enrichHeaderV,
        "X-Alloy-Server-Duration": String(serverRouteMsV),
      },
    });
  }

  const enrichStartedAt = Date.now();
  const enrichPhaseMs: Record<string, number> = {};
  /** Delta timings (full hydrate); cumulative phases remain in enrichPhaseMs for response header. */
  const segments_ms: Record<string, number> = {};
  /** Fine-grained identity / inquiry graph timings (see `[perf.drawer.full_hydrate]`). */
  const hydrateGraphTimings: Record<string, number> = {};
  let segmentLapAt = Date.now();
  const lapSegment = (name: string) => {
    const now = Date.now();
    segments_ms[name] = now - segmentLapAt;
    segmentLapAt = now;
  };
  const markPhase = (key: string) => {
    enrichPhaseMs[key] = Date.now() - enrichStartedAt;
  };
  const opportunityDefsTaggedP = oppOrgIdForDefs
    ? fetchEffectiveStatusDefinitionsTagged(supabase, oppOrgIdForDefs, "opportunities", { activeOnly: true })
    : Promise.resolve(null);
  const tParFull0 = Date.now();
  const [
    wuDeptRow,
    customerRow,
    stRow,
    plRow,
    dprRow,
    vertRow,
    locRow,
    primaryHydrBundle,
    opportunityTaggedPack,
  ] = await Promise.all([
    wuidForDept
      ? supabase
          .from("work_units")
          .select("department_id")
          .eq("id", wuidForDept)
          .eq("org_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    opp.customer_id
      ? supabase
          .from("customers")
          .select("name")
          .eq("id", opp.customer_id)
          .eq("org_id", orgId)
          .single()
      : Promise.resolve({ data: null }),
    oppPipelineStageId
      ? supabase
          .from("pipeline_stages")
          .select("name")
          .eq("id", oppPipelineStageId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    oppPipelineId
      ? supabase
          .from("pipelines")
          .select("name")
          .eq("id", oppPipelineId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    oppDprogId
      ? supabase
          .from("discount_programs")
          .select("name")
          .eq("id", oppDprogId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    opp.vertical_id
      ? supabase
          .from("verticals")
          .select("name")
          .eq("id", opp.vertical_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    opp.location_id
      ? supabase
          .from("locations")
          .select("id, label, address1, city, state, postal_code")
          .eq("id", opp.location_id)
          .eq("org_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    primaryPersonContactP,
    opportunityDefsTaggedP,
  ]);
  logDbTiming("opportunityEntity.full_parallel_lookups", Date.now() - tParFull0, { orgId, id });
  markPhase("after_parallel_context_lookups");
  lapSegment("parallel_initial_lookups");
  const opportunityDefs = opportunityTaggedPack?.rows ?? [];
  const oppStatusDefsCacheHitFull = opportunityTaggedPack?.combinedCacheHit ?? false;
  const oppStatusDefsTelemetryFull = opportunityTaggedPack?.telemetry;
  out._work_unit_department_id = wuidForDept
    ? trimOrNull(
        (wuDeptRow.data as { department_id?: string | null } | null)
          ?.department_id ?? null,
      )
    : null;
  out._customer_name =
    (customerRow.data as { name?: string | null } | null)?.name ?? null;
  if (oppPipelineStageId) {
    const stName =
      (stRow.data as { name?: string | null } | null)?.name ?? null;
    out._pipeline_stage_name = stName;
    out._stage_name = stName;
  } else {
    out._pipeline_stage_name = null;
    out._stage_name = null;
  }
  out._pipeline_name =
    (plRow.data as { name?: string | null } | null)?.name ?? null;
  out._discount_program_label =
    (dprRow.data as { name?: string | null } | null)?.name ?? null;
  out._vertical_name =
    (vertRow.data as { name?: string | null } | null)?.name ?? null;
  if (opp.location_id) {
    const l = locRow.data as {
      label?: string | null;
      address1?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
    } | null;
    const locLabel = l
      ? l.label ||
        [l.address1, l.city, l.state, l.postal_code]
          .filter(Boolean)
          .join(", ") ||
        null
      : null;
    out._location_name = locLabel;
    out._location_label = locLabel;
    out._location_id = opp.location_id;
  } else {
    out._location_name = null;
    out._location_label = null;
    out._location_id = null;
  }
  Object.assign(out, primaryHydrBundle.patch);
  markPhase("after_primary_person_contact");
  const oppOrgId = oppOrgIdForDefs;
  const oppStatusLabelByKey = displayLabelsFromDefinitions(opportunityDefs);
  const oppLegacyStatus = (opp as { status?: string | null }).status;
  const oppSkRaw =
    opp.status_key != null && String(opp.status_key).trim() !== ""
      ? String(opp.status_key).trim()
      : oppLegacyStatus != null && String(oppLegacyStatus).trim() !== ""
        ? String(oppLegacyStatus).trim()
        : null;
  const stageLabel =
    out._pipeline_stage_name != null &&
    String(out._pipeline_stage_name).trim() !== ""
      ? String(out._pipeline_stage_name).trim()
      : null;
  let oppStatusDisplay: string | null = null;
  if (oppOrgId && oppSkRaw) {
    const ci = opportunityDefs.find(
      (d) => d.status_key.toLowerCase() === oppSkRaw.toLowerCase(),
    );
    if (ci?.status_label != null && String(ci.status_label).trim() !== "") {
      oppStatusDisplay = String(ci.status_label).trim();
    } else {
      oppStatusDisplay = resolveDisplayFromLabelMap(
        oppStatusLabelByKey,
        oppSkRaw,
        null,
      );
    }
  } else {
    oppStatusDisplay = oppSkRaw;
  }
  if (
    oppPipelineStageId &&
    oppSkRaw &&
    String(oppSkRaw) === String(oppPipelineStageId) &&
    stageLabel
  ) {
    oppStatusDisplay = stageLabel;
  } else if (oppStatusDisplay != null && isUuidLike(String(oppStatusDisplay))) {
    if (stageLabel) {
      oppStatusDisplay = stageLabel;
    } else if (isUuidLike(oppSkRaw)) {
      const { data: stRow } = await supabase
        .from("pipeline_stages")
        .select("name")
        .eq("id", oppSkRaw)
        .maybeSingle();
      const nm = (stRow as { name?: string | null } | null)?.name;
      if (nm != null && String(nm).trim() !== "")
        oppStatusDisplay = String(nm).trim();
    }
  }
  if (
    (oppStatusDisplay == null || String(oppStatusDisplay).trim() === "") &&
    stageLabel
  ) {
    oppStatusDisplay = stageLabel;
  }
  out._status_display = oppStatusDisplay;
  const qt = effectiveOpportunityQuoteDollars(opp);
  out._quote_total_display = qt;
  Object.assign(
    out,
    buildOpportunityLifecycleFields({
      statusKey: oppSkRaw,
      quoteTotalDollars: qt,
      defs: opportunityDefs,
    }),
  );
  markPhase("after_status_defs_and_financial");
  lapSegment("status_resolve_and_lifecycle_shell");
  const drawerInitial = surfaceParamEarly === "drawer_initial";
  const fieldRegistryMetaFull = await attachFieldDefinitionsAndValues(supabase, out, "opportunities", id, {
    mergeValues: !drawerInitial,
  });
  markPhase("after_field_definitions_values");
  lapSegment("field_definitions_and_values_attach");
  if (drawerInitial) {
    markPhase("drawer_initial_skip_rel_inquiry_persons");
    out._inquiry_children = [];
    out._opportunity_persons = [];
    out._record_surface = "drawer_initial";
    const inquiryTitleEarly =
      trimOrNull(out.name) ?? trimOrNull(out.title) ?? "—";
    out._identity = {
      household:
        typeof opp.customer_id === "string" && opp.customer_id.trim()
          ? {
              id: opp.customer_id.trim(),
              label: trimOrNull(out._customer_name) ?? "—",
            }
          : null,
      primary_person: opp.primary_person_id
        ? {
            id: String(opp.primary_person_id),
            label: trimOrNull(out._primary_person_name) ?? "—",
            email: trimOrNull(out._primary_person_email),
            phone: trimOrNull(out._primary_person_phone),
            role_key: null,
            role_label: null,
          }
        : null,
      primary_contact: opp.primary_contact_id
        ? {
            id: String(opp.primary_contact_id),
            label: trimOrNull(out._primary_contact_name) ?? "—",
            email: trimOrNull(out._primary_contact_email),
            phone: trimOrNull(out._primary_contact_phone),
            role_key: null,
            role_label: null,
          }
        : null,
      primary_child: null,
      inquiry: { title: inquiryTitleEarly, lines: [], section_key: "quote" },
    };
    markPhase("after_identity_block");
    const enrichTotalMsDi = Date.now() - enrichStartedAt;
    const enrichHeaderDi =
      JSON.stringify({ total_ms: enrichTotalMsDi, phases_ms: enrichPhaseMs })
        .length < 3900
        ? JSON.stringify({
            total_ms: enrichTotalMsDi,
            phases_ms: enrichPhaseMs,
          })
        : JSON.stringify({ total_ms: enrichTotalMsDi, phases_ms: {} });
    const serverRouteMsDi = Date.now() - opportunityRouteStartedAt;
    if (process.env.NODE_ENV !== "production") {
      console.info("[timing][opportunity-api]", {
        opportunity_id: id,
        enrich_ms: enrichTotalMsDi,
        enrich_phases_ms: enrichPhaseMs,
        surface: "drawer_initial",
      });
    }
    return NextResponse.json(out, {
      headers: {
        "X-Alloy-Entity-Surface": "drawer_initial",
        "X-Alloy-Opp-Enrich": enrichHeaderDi,
        "X-Alloy-Server-Duration": String(serverRouteMsDi),
      },
    });
  }

  const relationshipDisplaysMode = await attachDirectFkRelationshipDisplays(
    supabase,
    orgId,
    "opportunities",
    out,
  );
  markPhase("after_relationship_displays");
  lapSegment("relationship_displays_attach");

  const oppMeta = (opp.metadata ?? null) as Record<string, unknown> | null;
  const metaDesired =
    oppMeta && typeof oppMeta.desired_start_date === "string"
      ? oppMeta.desired_start_date.trim()
      : "";
  const metaTour =
    oppMeta && typeof oppMeta.tour_date === "string"
      ? oppMeta.tour_date.trim()
      : "";
  if (
    metaDesired &&
    (out.desired_start_date == null ||
      String(out.desired_start_date).trim() === "")
  ) {
    out.desired_start_date = metaDesired;
  }
  if (
    metaTour &&
    (out.tour_date == null || String(out.tour_date).trim() === "")
  ) {
    out.tour_date = metaTour;
  }

  // -----------------------------------------------------------------
  // Canonical identity block (relationship/FK-derived; avoids UI key-guessing)
  // -----------------------------------------------------------------
  const rel =
    (out._relationship_displays as
      | Record<
          string,
          { id: string; label: string; entity_type: string } | null
        >
      | undefined) ?? {};
  const householdLabel =
    trimOrNull(out._customer_name) ?? rel.customer_id?.label ?? null;
  const householdId =
    typeof opp.customer_id === "string" && opp.customer_id.trim()
      ? opp.customer_id.trim()
      : null;

  // Canonical identity + OCM join header (parallelized round-trips).
  const oppDefaultProgramType = trimOrNull(out.program_type);
  const oppDefaultScheduleType = trimOrNull(out.schedule_type);

  const ocmMemberDefsTaggedPackP = fetchEffectiveStatusDefinitionsTagged(
    supabase,
    orgId,
    "opportunity_customer_members",
    {
      activeOnly: true,
      processLruTtlMs: 600_000,
    },
  );

  const ocmJoinP = supabase
    .from("opportunity_customer_members")
    .select(
      "id, customer_member_id, desired_program_type, desired_schedule_type, outcome_status_key, fit_status, notes, metadata, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .eq("opportunity_id", id)
    .order("created_at", { ascending: true });

  const ocmJoinTimedP = (async () => {
    const t0 = Date.now();
    const r = await ocmJoinP;
    hydrateGraphTimings.ocm_join_ms = Date.now() - t0;
    return r;
  })();

  const primaryPersonRoleP =
    householdId &&
    typeof opp.primary_person_id === "string" &&
    opp.primary_person_id.trim()
      ? resolveCustomerPersonRole(supabase, {
          orgId,
          customerId: householdId,
          personId: opp.primary_person_id.trim(),
        })
      : Promise.resolve({
          role_key: null as string | null,
          role_label: null as string | null,
        });

  const contactRoleP = (async (): Promise<{
    contactRoleKey: string | null;
    contactRoleLabel: string | null;
  }> => {
    if (
      !householdId ||
      typeof opp.primary_contact_id !== "string" ||
      !opp.primary_contact_id.trim()
    ) {
      return { contactRoleKey: null, contactRoleLabel: null };
    }
    const { data: cRow } = await supabase
      .from("contacts")
      .select("person_id")
      .eq("id", opp.primary_contact_id.trim())
      .eq("org_id", orgId)
      .maybeSingle();
    const pid = trimOrNull(
      (cRow as { person_id?: string | null } | null)?.person_id,
    );
    if (!pid) return { contactRoleKey: null, contactRoleLabel: null };
    const rr = await resolveCustomerPersonRole(supabase, {
      orgId,
      customerId: householdId,
      personId: pid,
    });
    return { contactRoleKey: rr.role_key, contactRoleLabel: rr.role_label };
  })();

  type CmBootstrapRow = {
    id: string;
    display_name: string;
    relationship?: string | null;
    dob?: string | null;
    person_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    metadata?: Record<string, unknown> | null;
  };

  const customerMembersTimedP = householdId
    ? (async () => {
        const t0 = Date.now();
        const r = await supabase
          .from("customer_members")
          .select(
            "id, display_name, relationship, dob, person_id, first_name, last_name, metadata",
          )
          .eq("org_id", orgId)
          .eq("customer_id", householdId)
          .eq("is_active", true)
          .limit(25);
        hydrateGraphTimings.customer_members_bootstrap_ms = Date.now() - t0;
        return r;
      })()
    : Promise.resolve({
        data: [] as CmBootstrapRow[],
      });

  const [personRR, contactRR, cmsRes, joinRes] = await Promise.all([
    primaryPersonRoleP,
    contactRoleP,
    customerMembersTimedP,
    ocmJoinTimedP,
  ]);

  const personRoleKey = personRR.role_key;
  const personRoleLabel = personRR.role_label;
  const contactRoleKey = contactRR.contactRoleKey;
  const contactRoleLabel = contactRR.contactRoleLabel;

  let child: {
    id: string;
    display_name: string;
    relationship?: string | null;
    relationship_label?: string | null;
    dob?: string | null;
  } | null = null;
  if (householdId && cmsRes.data) {
    const rows = (cmsRes.data ?? []) as CmBootstrapRow[];
    const pick =
      rows.find((r) =>
        ["child", "dependent", "student"].includes(
          String(r.relationship ?? "")
            .trim()
            .toLowerCase(),
        ),
      ) ??
      rows[0] ??
      null;
    if (pick) {
      const relKey = trimOrNull(pick.relationship);
      let relLabel: string | null = null;
      if (relKey) {
        const { data: rt } = await supabase
          .from("customer_member_relationship_types")
          .select("label")
          .eq("org_id", orgId)
          .eq("key", relKey)
          .maybeSingle();
        relLabel = trimOrNull((rt as { label?: string | null } | null)?.label);
      }
      child = {
        id: pick.id,
        display_name: pick.display_name,
        relationship: relKey,
        relationship_label: relLabel,
        dob: pick.dob ? String(pick.dob) : null,
      };
    }
  }

  const joinRows = joinRes.data;
  markPhase("after_identity_parallel_fetch");
  lapSegment("identity_roles_and_ocm_join_parallel");
  const jrows = (joinRows ?? []) as {
    id: string;
    customer_member_id: string;
    desired_program_type?: string | null;
    desired_schedule_type?: string | null;
    outcome_status_key?: string | null;
    fit_status?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
  }[];
  const memberIds = [
    ...new Set(jrows.map((r) => r.customer_member_id).filter(Boolean)),
  ] as string[];
  const bootstrapList = ((cmsRes.data ?? []) ?? []) as CmBootstrapRow[];
  const bootstrapById = new Map(bootstrapList.map((r) => [r.id, r]));
  const needingMemberForOcm = memberIds.filter((mid) => !bootstrapById.has(mid));
  if (needingMemberForOcm.length > 0) {
    const tGap = Date.now();
    const { data: supplemental } = await supabase
      .from("customer_members")
      .select(
        "id, display_name, relationship, dob, person_id, first_name, last_name, metadata",
      )
      .eq("org_id", orgId)
      .in("id", needingMemberForOcm);
    hydrateGraphTimings.customer_members_ocm_gap_fetch_ms = Date.now() - tGap;
    for (const row of supplemental ?? []) {
      const m = row as CmBootstrapRow;
      bootstrapById.set(m.id, m);
    }
  }

  const memList: CmBootstrapRow[] = [];
  let unresolvedMemberJointCount = 0;
  for (const mid of memberIds) {
    const hit = bootstrapById.get(mid);
    if (hit) memList.push(hit);
    else unresolvedMemberJointCount += 1;
  }
  if (unresolvedMemberJointCount > 0) {
    hydrateGraphTimings.customer_member_ocm_resolve_incomplete_count = unresolvedMemberJointCount;
  }

  const memberMap = new Map(memList.map((m) => [m.id, m]));
  const personIds = [
    ...new Set(memList.map((m) => trimOrNull(m.person_id)).filter(Boolean)),
  ] as string[];
  const pmap = new Map<string, WarmPersonRow>();
  for (const w of primaryHydrBundle.warmPersonRows) {
    if (w.id) pmap.set(w.id, w);
  }
  const primaryPidForWarm = trimOrNull(opp.primary_person_id);
  const primary_person_row_warm_prefilled = !!(
    primaryPidForWarm &&
    primaryHydrBundle.warmPersonRows.some((w) => String(w.id) === primaryPidForWarm)
  );
  const primary_person_reused = !!(primaryPidForWarm && pmap.has(primaryPidForWarm));
  const personIdsNeedingFetch = personIds.filter((pid) => !pmap.has(pid));
  const person_lookup_reused_count = personIds.length - personIdsNeedingFetch.length;
  const linked_persons_missing_count = personIdsNeedingFetch.length;

  hydrateGraphTimings.customer_member_person_lookup_ms = 0;
  if (personIdsNeedingFetch.length > 0) {
    const tPl = Date.now();
    const { data: personRows } = await supabase
      .from("persons")
      .select("id, first_name, last_name, full_name, date_of_birth")
      .eq("org_id", orgId)
      .in("id", personIdsNeedingFetch);
    hydrateGraphTimings.customer_member_person_lookup_ms = Date.now() - tPl;
    for (const pr of (personRows ?? []) as WarmPersonRow[]) {
      if (pr.id) pmap.set(pr.id, pr);
    }
  }
  const person_lookup_missing_count = personIdsNeedingFetch.length;

  lapSegment("customer_member_linked_person_lookup");

  const oppPersonsRowsAwaitable = supabase
    .from("opportunity_persons")
    .select("id, person_id, role_type, created_at")
    .eq("org_id", orgId)
    .eq("opportunity_id", id)
    .order("created_at", { ascending: true });

  const tInquiry0 = Date.now();
  const optionPairs: { setKey: string; itemKey: string }[] = [];
  for (const r of jrows) {
    const desiredProgramType =
      trimOrNull(r.desired_program_type) ?? oppDefaultProgramType;
    const desiredScheduleType =
      trimOrNull(r.desired_schedule_type) ?? oppDefaultScheduleType;
    if (desiredProgramType)
      optionPairs.push({
        setKey: "childcare_program_type",
        itemKey: desiredProgramType,
      });
    if (desiredScheduleType)
      optionPairs.push({
        setKey: "childcare_schedule_type",
        itemKey: desiredScheduleType,
      });
  }
  const [ocmMemberDefsTaggedPack, optionLabelMap, oppPersonsListRes] = await Promise.all([
    ocmMemberDefsTaggedPackP,
    batchOptionItemLabelsForOrg(supabase, orgId, optionPairs),
    (async () => {
      const t0 = Date.now();
      const r = await oppPersonsRowsAwaitable;
      hydrateGraphTimings.opportunity_persons_rows_ms = Date.now() - t0;
      return r;
    })(),
  ]);
  const inquiryBatchMs = Date.now() - tInquiry0;
  lapSegment("inquiry_ocm_defs_options_opportunity_persons_rows");

  const ocmMemberStatusDefs = ocmMemberDefsTaggedPack.rows;
  const ocmOppStatusDefsCacheHit = ocmMemberDefsTaggedPack.combinedCacheHit;
  const ocmStatusTelemetry = ocmMemberDefsTaggedPack.telemetry;
  const ocmStatusLabelByKey = displayLabelsFromDefinitions(ocmMemberStatusDefs);

  const inquiryChildren = jrows.map((r) => {
    const m = memberMap.get(r.customer_member_id) ?? null;
    const pid = trimOrNull(m?.person_id);
    const p = pid ? (pmap.get(pid) ?? null) : null;
    const dob = p?.date_of_birth
      ? String(p.date_of_birth)
      : m?.dob
        ? String(m.dob)
        : null;
    const age = ageFromDobIso(dob);
    const desiredProgramType =
      trimOrNull(r.desired_program_type) ?? oppDefaultProgramType;
    const desiredScheduleType =
      trimOrNull(r.desired_schedule_type) ?? oppDefaultScheduleType;
    const memMeta = (m?.metadata ?? null) as Record<string, unknown> | null;
    const demoProgramLabel =
      memMeta && typeof memMeta.demo_program_label === "string"
        ? trimOrNull(memMeta.demo_program_label)
        : null;
    const outcomeStatusKey = trimOrNull(r.outcome_status_key);
    const rawProgLabel = optionLabelFromBatchMap(
      optionLabelMap,
      "childcare_program_type",
      desiredProgramType,
    );
    const desiredProgramLabel = rawProgLabel ?? demoProgramLabel;
    const desiredScheduleLabel = optionLabelFromBatchMap(
      optionLabelMap,
      "childcare_schedule_type",
      desiredScheduleType,
    );
    const outcomeStatusLabel = outcomeStatusKey
      ? resolveDisplayFromLabelMap(ocmStatusLabelByKey, outcomeStatusKey, null)
      : null;
    return {
      id: r.id,
      customer_member_id: r.customer_member_id,
      person_id: pid,
      display_name:
        m?.display_name ??
        (pid ? personDisplayName(p) : null) ??
        r.customer_member_id.slice(0, 8) + "…",
      dob,
      age: age ? age.label : null,
      desired_program_type: desiredProgramType,
      desired_program_label: desiredProgramLabel,
      desired_schedule_type: desiredScheduleType,
      desired_schedule_label: desiredScheduleLabel,
      outcome_status_key: outcomeStatusKey,
      outcome_status_label: outcomeStatusLabel,
      fit_status: trimOrNull(r.fit_status),
      notes: trimOrNull(r.notes),
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
    };
  });
  enrichPhaseMs.inquiry_children_batch_ms = inquiryBatchMs;
  let inquiryChildrenOut = inquiryChildren;
  if (
    !inquiryChildrenOut.length &&
    oppMeta &&
    Array.isArray(oppMeta.inquiry_children)
  ) {
    const mdKids = oppMeta.inquiry_children as unknown[];
    inquiryChildrenOut = mdKids
      .map((raw, i) => {
        if (!raw || typeof raw !== "object") return null;
        const row = raw as Record<string, unknown>;
        const displayName =
          typeof row.display_name === "string" && row.display_name.trim()
            ? row.display_name.trim()
            : typeof row.child_name === "string" && row.child_name.trim()
              ? row.child_name.trim()
              : null;
        if (!displayName) return null;
        const sid = `metadata_child:${id}:${i}`;
        return {
          id: sid,
          customer_member_id: sid,
          person_id: null,
          display_name: displayName,
          dob: typeof row.dob === "string" ? row.dob : null,
          age: typeof row.age === "string" ? row.age : null,
          desired_program_type:
            typeof row.program_type_key === "string"
              ? trimOrNull(row.program_type_key)
              : null,
          desired_program_label:
            typeof row.program_label === "string"
              ? trimOrNull(row.program_label)
              : typeof row.program_short === "string"
                ? trimOrNull(row.program_short)
                : null,
          desired_schedule_type: null,
          desired_schedule_label: null,
          outcome_status_key: null,
          outcome_status_label: null,
          fit_status: null,
          notes: typeof row.notes === "string" ? trimOrNull(row.notes) : null,
          metadata: (row.metadata as Record<string, unknown>) ?? {
            source: "opportunity_metadata",
          },
          created_at: null,
          updated_at: null,
        };
      })
      .filter(Boolean) as typeof inquiryChildren;
  }
  // Final fallback: demo/seed metadata uses simple child_name fields (queue shows these).
  if (!inquiryChildrenOut.length && oppMeta && typeof oppMeta === "object") {
    const md = oppMeta as Record<string, unknown>;
    const demoChild = (
      typeof md.demo_child_name === "string" && md.demo_child_name.trim()
        ? md.demo_child_name.trim()
        : typeof md.child_name === "string" && md.child_name.trim()
          ? md.child_name.trim()
          : null
    ) as string | null;
    if (demoChild) {
      const sid = `metadata_child:${id}:demo`;
      inquiryChildrenOut = [
        {
          id: sid,
          customer_member_id: sid,
          person_id: null,
          display_name: demoChild,
          dob: typeof md.child_dob === "string" ? md.child_dob : null,
          age: typeof md.child_age === "string" ? md.child_age : null,
          desired_program_type:
            typeof md.program_type_key === "string"
              ? trimOrNull(md.program_type_key)
              : null,
          desired_program_label:
            typeof md.program_label === "string"
              ? trimOrNull(md.program_label)
              : typeof md.demo_requested_program === "string"
                ? trimOrNull(md.demo_requested_program)
                : null,
          desired_schedule_type:
            typeof md.schedule_type_key === "string"
              ? trimOrNull(md.schedule_type_key)
              : null,
          desired_schedule_label:
            typeof md.schedule_label === "string"
              ? trimOrNull(md.schedule_label)
              : null,
          outcome_status_key: null,
          outcome_status_label: null,
          fit_status: null,
          notes: typeof md.notes === "string" ? trimOrNull(md.notes) : null,
          metadata: { source: "opportunity_metadata_demo_child_name" },
          created_at: null,
          updated_at: null,
        } as (typeof inquiryChildren)[number],
      ];
    }
  }
  out._inquiry_children = inquiryChildrenOut;
  markPhase("after_inquiry_children_resolved");
  lapSegment("inquiry_children_metadata_fallbacks");

  {
    const opRows = oppPersonsListRes.data;
    type OppPersonLite = {
      id: string;
      person_id: string;
      role_type?: string | null;
    };
    type PersonRowAgg = {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      full_name?: string | null;
      date_of_birth?: string | null;
      email?: string | null;
      phone?: string | null;
    };
    const personIdsForOpp = [
      ...new Set(
        ((opRows ?? []) as OppPersonLite[])
          .map((z) => z.person_id)
          .filter(Boolean),
      ),
    ] as string[];
    const missingOppPersonIds = personIdsForOpp.filter((pid) => !pmap.has(pid));
    hydrateGraphTimings.opportunity_persons_missing_persons_ms = 0;
    if (missingOppPersonIds.length > 0) {
      const tMiss = Date.now();
      const { data: extraPeople } = await supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, date_of_birth, email, phone")
        .eq("org_id", orgId)
        .in("id", missingOppPersonIds);
      hydrateGraphTimings.opportunity_persons_missing_persons_ms = Date.now() - tMiss;
      for (const row of (extraPeople ?? []) as PersonRowAgg[]) {
        pmap.set(row.id, row);
      }
    }

    lapSegment("opportunity_persons_person_merge_small_batch");

    out._opportunity_persons = ((opRows ?? []) as OppPersonLite[]).map((r) => {
      const p = (pmap.get(r.person_id) ?? null) as PersonRowAgg | null;
      return {
        id: r.id,
        person_id: r.person_id,
        role_type: trimOrNull(r.role_type) ?? "—",
        name: personDisplayName(p),
        phone: trimOrNull(p?.phone),
        email: trimOrNull(p?.email),
      };
    });
  }
  markPhase("after_opportunity_persons");
  lapSegment("opportunity_person_list_build");

  // Inquiry summary from configured field_definitions in the "quote" section when present.
  const defs =
    (out._field_definitions as
      | {
          field_key: string;
          label: string | null;
          section_key: string | null;
          is_visible_in_drawer?: boolean;
        }[]
      | undefined) ?? [];
  const quoteDefs = defs
    .filter((d) => d.is_visible_in_drawer !== false)
    .filter((d) => String(d.section_key ?? "").trim() === "quote");
  const inquiryLines: { key: string; label: string; value: string }[] = [];
  for (const d of quoteDefs) {
    const key = d.field_key;
    const v = out[key];
    const s = trimOrNull(v);
    if (!s) continue;
    inquiryLines.push({ key, label: trimOrNull(d.label) ?? key, value: s });
    if (inquiryLines.length >= 3) break;
  }
  const inquiryTitle =
    trimOrNull(out.name) ??
    trimOrNull(out.title) ??
    (inquiryLines.length
      ? inquiryLines.map((l) => l.value).join(" · ")
      : null) ??
    "—";

  out._identity = {
    household: householdId
      ? { id: householdId, label: householdLabel ?? "—" }
      : null,
    primary_person: opp.primary_person_id
      ? {
          id: String(opp.primary_person_id),
          label:
            trimOrNull(out._primary_person_name) ??
            rel.primary_person_id?.label ??
            "—",
          email: trimOrNull(out._primary_person_email),
          phone: trimOrNull(out._primary_person_phone),
          role_key: personRoleKey,
          role_label: personRoleLabel,
        }
      : null,
    primary_contact: opp.primary_contact_id
      ? {
          id: String(opp.primary_contact_id),
          label:
            trimOrNull(out._primary_contact_name) ??
            rel.primary_contact_id?.label ??
            "—",
          email: trimOrNull(out._primary_contact_email),
          phone: trimOrNull(out._primary_contact_phone),
          role_key: contactRoleKey,
          role_label: contactRoleLabel,
        }
      : null,
    primary_child: child,
    inquiry: {
      title: inquiryTitle,
      lines: inquiryLines,
      section_key: "quote",
    },
  };

  markPhase("after_identity_block");
  lapSegment("quote_section_identity_aggregate");
  const enrichTotalMs = Date.now() - enrichStartedAt;
  const timingPayload = {
    opportunity_id: id,
    enrich_ms: enrichTotalMs,
    enrich_phases_ms: enrichPhaseMs,
    inquiry_batch_ms: enrichPhaseMs.inquiry_children_batch_ms,
    surface: "full",
  };
  if (process.env.NODE_ENV !== "production" || enrichTotalMs > 250) {
    console.warn("[timing][opportunity-api]", timingPayload);
  }
  const enrichHeader =
    JSON.stringify({ total_ms: enrichTotalMs, phases_ms: enrichPhaseMs })
      .length < 3900
      ? JSON.stringify({ total_ms: enrichTotalMs, phases_ms: enrichPhaseMs })
      : JSON.stringify({ total_ms: enrichTotalMs, phases_ms: {} });

  const serverRouteMs = Date.now() - opportunityRouteStartedAt;
  out._record_surface = "full";

  const tSerialize0 = Date.now();
  const bodyJson = JSON.stringify(out);
  const serialization_ms = Date.now() - tSerialize0;
  const payload_kb = Buffer.byteLength(bodyJson, "utf8") / 1024;

  if (process.env.NODE_ENV !== "production" || enrichTotalMs > 250) {
    console.warn("[perf.drawer.full_hydrate]", {
      opportunity_id: id,
      org_id: orgId,
      total_route_ms: serverRouteMs,
      enrichment_total_ms: enrichTotalMs,
      segments_ms,
      hydrate_graph_timings_ms: hydrateGraphTimings,
      inquiry_option_batch_wall_ms: inquiryBatchMs,
      opportunity_status_defs: {
        combined_cache_hit: oppStatusDefsCacheHitFull,
        telemetry: oppStatusDefsTelemetryFull,
      },
      ocm_status_defs: {
        combined_cache_hit: ocmOppStatusDefsCacheHit,
        telemetry: ocmStatusTelemetry,
      },
      field_registry: fieldRegistryMetaFull,
      field_registry_defs_warm: fieldRegistryMetaFull.field_registry_defs_warm ?? null,
      field_registry_combined_cache_hit: fieldRegistryMetaFull.field_registry_combined_cache_hit ?? null,
      field_registry_defs_resolve_wall_ms:
        fieldRegistryMetaFull.field_registry_defs_resolve_wall_ms ?? null,
      field_registry_field_values_wall_ms:
        fieldRegistryMetaFull.field_registry_field_values_wall_ms ?? null,
      field_registry_uncached_ms: fieldRegistryMetaFull.field_registry_uncached_ms ?? null,
      relationship_displays_mode: relationshipDisplaysMode,
      primary_person_row_warm_prefilled,
      primary_person_reused,
      person_lookup_reused_count,
      person_lookup_missing_count,
      linked_persons_missing_count,
      ocm_defs_cache_hit: ocmOppStatusDefsCacheHit,
      serialization_ms,
      payload_kb: Math.round(payload_kb * 10) / 10,
    });
  }

  return new NextResponse(bodyJson, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "X-Alloy-Entity-Surface": "full",
      "X-Alloy-Opp-Enrich": enrichHeader,
      "X-Alloy-Server-Duration": String(serverRouteMs),
    },
  });
}
