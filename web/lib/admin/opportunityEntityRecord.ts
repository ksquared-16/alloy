import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { apiOk, apiError } from "@/lib/api/apiResponse";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@/lib/api/correlationId";
import { attachDirectFkRelationshipDisplays } from "@/lib/admin/relationshipDisplayAttach";
import { attachFieldDefinitionsAndValues } from "@/lib/admin/entityFieldRegistryAttach";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import {
  buildOpportunityLifecycleFields,
  effectiveOpportunityQuoteDollars,
} from "@/lib/admin/opportunityLifecyclePresentation";
import {
  fetchEffectiveStatusDefinitionsTagged,
  displayLabelsFromDefinitions,
} from "@/lib/admin/statusDefinitionsResolve";
import { humanizeStatusKey } from "@/lib/admin/status/humanizeStatusKey";
import { canonicalNewLeadStatusLabel } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";
import type { FieldRegistryAttachMeta } from "@/lib/admin/entityFieldRegistryAttach";
import { isUuidLike } from "@/lib/admin/overviewRelationshipLabels";
import { resolveOpportunityStatusDisplay } from "@/lib/admin/drawer/opportunityStatusDisplayResolve";
import { OPPORTUNITY_CANONICAL_ADMIN_SELECT } from "@/lib/fields/canonicalEntitySelectColumns";
import { batchOptionItemLabelsForOrg, EMPTY_OPTION_LABEL_MAP, optionLabelFromBatchMap } from "@/lib/admin/optionItemLabelForOrg";
import {
  isActiveChildCustomerMemberForInquiry,
  mergeHouseholdActiveChildrenIntoInquiryChildren,
  resolveInquiryChildIdentityFields,
  type InquiryChildHydrateRow,
} from "@/lib/admin/drawer/inquiryChildrenHydration";
import { attachOpportunityChildLifecycleSummary } from "@/lib/opportunities/buildOpportunityChildLifecycleSummary";
import { attachPersonChildRelationshipsToEntityRecord } from "@/lib/fields/personChildRelationship/attachPersonChildRelationshipsToEntityRecord";
import { listEnrollmentInstancesForLead, buildEnrollmentParticipationByMemberMap } from "@/lib/process/processInstances";
import { resolveDurableFactsForChildren } from "@/lib/childcareOperational/inquiryChildrenDurableFactsOverlay";
import { resolveProcessDraftFactsForChildren } from "@/lib/childcareOperational/inquiryChildrenProcessDraftFactsOverlay";
import {
  attachChildScopedContactLinksToRecord,
  memberRowsFromInquiryChildren,
} from "@/lib/admin/person/fetchChildScopedContactLinks";
import { resolveCustomerHouseholdPrimaryContactPersonId } from "@/lib/admin/person/householdPrimaryContact";
import { logDbTiming, withDbTiming } from "@/lib/admin/dbQueryTiming";
import {
  perfDrawerFullHydrate,
  timingOpportunityApiVisible,
  timingOpportunityDrawerPrimary,
} from "@/lib/perf/adminV2PerfLog";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { assertOpportunityInAccessScope } from "@/lib/admin/accessScope";
import {
  fetchDepartmentMetadataForActivity,
  loadOpportunityActivitySignal,
} from "@/lib/admin/loadOpportunityActivitySignal";
import { attachOpportunityInquirySummaryTaskPreview } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { attachOpportunityAttentionSuggestionBundle } from "@/lib/admin/opportunityAttentionSuggestionAttachment";
import { readOpportunityDrawerOpenerHints } from "@/lib/admin/opportunityDrawerOpenerHints";
import { applyPrimaryPersonMirrorValuesToHostRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { loadInquiryChildCustomFieldValuesByOcmId } from "@/lib/admin/drawer/inquiryChildCustomFieldValues";
import { normalizeIsoDateOnly } from "@/lib/fields/inquiryChildFieldRegistry";
import { resolveInquiryChildProgramCategoryLabel } from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
import { enrichInquiryChildrenWithPlacementOptionLabels } from "@/lib/admin/drawer/enrichInquiryChildrenPlacementLabels";
import { attachCustomerMemberProfileToInquiryChildren } from "@/lib/admin/drawer/attachCustomerMemberProfileToInquiryChildren";

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
  metadata?: Record<string, unknown> | null;
};

function warmPersonPhotoUrl(person: WarmPersonRow | null | undefined): string | null {
  if (!person) return null;
  const meta = person.metadata;
  if (!meta || typeof meta !== "object") return null;
  for (const key of ["photo_url", "avatar_url", "profile_photo_url", "profile_image_url", "image_url"]) {
    const value = meta[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Overview-first inquiry lines without OCM / member graph (native columns + quote defs on host row). */
function buildOpportunityInquiryLinesLite(
  out: Record<string, unknown>,
): { key: string; label: string; value: string }[] {
  const lines: { key: string; label: string; value: string }[] = [];
  const push = (key: string, label: string, raw: unknown) => {
    const s = trimOrNull(raw);
    if (s) lines.push({ key, label, value: s });
  };
  push("program_type", "Program", out.program_type);
  push("schedule_type", "Schedule", out.schedule_type);
  // Opportunity-level legacy field key — not the OCM column (S2 renamed OCM only).
  push("desired_start_date", "Desired start", out.desired_start_date);
  const defs =
    (out._field_definitions as
      | {
          field_key: string;
          label: string | null;
          section_key: string | null;
          is_visible_in_drawer?: boolean;
        }[]
      | undefined) ?? [];
  for (const d of defs) {
    if (d.is_visible_in_drawer === false) continue;
    if (String(d.section_key ?? "").trim() !== "quote") continue;
    const key = d.field_key;
    const s = trimOrNull(out[key]);
    if (!s) continue;
    lines.push({ key, label: trimOrNull(d.label) ?? key, value: s });
    if (lines.length >= 3) break;
  }
  return lines.slice(0, 3);
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

function warmPersonDisplayName(
  p: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null,
): string | null {
  return p
    ? (p.full_name && p.full_name.trim()) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        null
    : null;
}

/** Primary/contact shell labels + warm person rows for reuse on member graph overlay. */
async function fetchPrimaryPersonContactHydrate(
  supabase: AdminSupabase,
  orgId: string,
  opp: Record<string, unknown> & {
    customer_id?: string | null;
    primary_contact_id?: string | null;
    primary_person_id?: string | null;
  },
): Promise<{
  patch: Record<string, unknown>;
  warmPersonRows: WarmPersonRow[];
}> {
  const patch: Record<string, unknown> = {};
  const warmPersonRows: WarmPersonRow[] = [];
  let primaryPersonId = trimOrNull(opp.primary_person_id);
  if (!primaryPersonId && opp.customer_id) {
    primaryPersonId = await resolveCustomerHouseholdPrimaryContactPersonId(
      supabase,
      orgId,
      opp.customer_id
    );
  }
  if (primaryPersonId) {
    const { data: person } = await supabase
      .from("persons")
      .select("id, first_name, last_name, full_name, email, phone, date_of_birth, metadata")
      .eq("id", primaryPersonId)
      .eq("org_id", orgId)
      .maybeSingle();
    const p = person as WarmPersonRow | null;
    if (p?.id) warmPersonRows.push(p);
    patch._primary_person_id = p?.id ?? null;
    patch._primary_person_name = warmPersonDisplayName(p);
    patch._primary_person_email = trimOrNull(p?.email);
    patch._primary_person_phone = trimOrNull(p?.phone);
    patch._contact_name = patch._primary_person_name;
    patch._primary_contact_name = patch._primary_person_name;
    applyPrimaryPersonMirrorValuesToHostRecord(patch, p);
  } else if (opp.primary_contact_id) {
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
        .select("id, first_name, last_name, full_name, email, phone, date_of_birth, metadata")
        .eq("id", (c as { person_id: string }).person_id)
        .eq("org_id", orgId)
        .maybeSingle();
      const p = person as WarmPersonRow | null;
      if (p?.id) warmPersonRows.push(p);
      patch._primary_person_id = p?.id ?? null;
      patch._primary_person_name = warmPersonDisplayName(p);
      applyPrimaryPersonMirrorValuesToHostRecord(patch, p);
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

type OcmJoinRow = {
  id: string;
  customer_member_id: string;
  start_date?: string | null;
  location_id?: string | null;
  program_room_cohort_key?: string | null;
  program_category_id?: string | null;
  location_program_categories?: { key?: string | null; label?: string | null } | null;
  schedule_type?: string | null;
  outcome_status_key?: string | null;
  fit_status?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type InquiryHydrateChild = {
  id: string;
  customer_member_id: string;
  person_id: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  age: string | null;
  linked_on_inquiry: boolean;
  ocm_id: string | null;
  program_category_id: string | null;
  /** Stable program key derived from the category FK (or opportunity default) — display only. */
  program_key: string | null;
  desired_program_label: string | null;
  schedule_type: string | null;
  desired_schedule_label: string | null;
  outcome_status_key: string | null;
  outcome_status_label: string | null;
  fit_status: string | null;
  notes: string | null;
  start_date: string | null;
  location_id?: string | null;
  location_label?: string | null;
  program_room_cohort_key?: string | null;
  program_room_cohort_label?: string | null;
  /** Enrollment process stage (position) from process_instances — source of truth. */
  stage_key?: string | null;
  /** Provenance of the participation state/stage: "process_instances" (authoritative) or "ocm" (bridge). */
  _participation_source?: "process_instances" | "ocm";
  /** Provenance of operational facts: "durable" (materialized) > "process_instance" (pre-mat draft) > "ocm" (legacy). */
  _operational_facts_source?: "durable" | "process_instance" | "ocm";
  custom_fields: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  /** Profile image when present on linked person/member metadata. */
  photo_url?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const OCM_INQUIRY_SELECT_COLUMNS =
  "id, customer_member_id, start_date, location_id, program_room_cohort_key, program_category_id, location_program_categories(key, label), schedule_type, outcome_status_key, fit_status, notes, metadata, created_at, updated_at";

async function batchLocationLabelsForOrg(
  supabase: AdminSupabase,
  orgId: string,
  locationIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(locationIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data } = await supabase
    .from("locations")
    .select("id, label, city")
    .eq("org_id", orgId)
    .in("id", ids);
  for (const row of data ?? []) {
    const r = row as { id: string; label?: string | null; city?: string | null };
    const label = trimOrNull(r.label) ?? trimOrNull(r.city) ?? r.id.slice(0, 8);
    out.set(String(r.id), label);
  }
  return out;
}

async function attachInquiryChildRowCustomFields(
  supabase: AdminSupabase,
  orgId: string,
  rows: InquiryHydrateChild[],
): Promise<InquiryHydrateChild[]> {
  const ocmIds = rows.map((r) => r.ocm_id).filter((id): id is string => Boolean(id && String(id).trim()));
  const byOcm = await loadInquiryChildCustomFieldValuesByOcmId(supabase, orgId, ocmIds);
  return rows.map((r) => ({
    ...r,
    custom_fields: r.ocm_id ? (byOcm[r.ocm_id] ?? {}) : {},
  }));
}

function mapOcmJoinRowsToInquiryChildrenBlock(
  jrowsIn: OcmJoinRow[],
  memberMap: Map<string, CmBootstrapRow>,
  pmap: Map<string, WarmPersonRow>,
  oppDefaultProgramType: string | null,
  oppDefaultScheduleType: string | null,
  optionLabelMap: Awaited<ReturnType<typeof batchOptionItemLabelsForOrg>>,
  ocmStatusLabelByKey: Map<string, string>,
  locationLabelById: Map<string, string>,
): InquiryHydrateChild[] {
  return jrowsIn.map((r) => {
    const m = memberMap.get(r.customer_member_id) ?? null;
    const pid = trimOrNull(m?.person_id);
    const p = pid ? (pmap.get(pid) ?? null) : null;
    const identity = resolveInquiryChildIdentityFields({
      personId: pid,
      person: p,
      member: m,
    });
    const dob = identity.dob;
    const age = ageFromDobIso(dob);
    const programCategoryId = trimOrNull(r.program_category_id);
    const embeddedCategoryKey = trimOrNull(r.location_program_categories?.key);
    const embeddedCategoryLabel = trimOrNull(r.location_program_categories?.label);
    // Derived display key: embedded category key, else opportunity-level default program key.
    const programKey = embeddedCategoryKey ?? (programCategoryId ? null : oppDefaultProgramType);
    const scheduleType =
      trimOrNull(r.schedule_type) ?? oppDefaultScheduleType;
    const outcomeStatusKey = trimOrNull(r.outcome_status_key);
    const desiredProgramLabel = resolveInquiryChildProgramCategoryLabel({
      program_category_id: programCategoryId,
      program_key: programKey,
      desired_program_label: embeddedCategoryLabel,
      optionLabelLookup: optionLabelMap,
    });
    const desiredScheduleLabel = optionLabelFromBatchMap(
      optionLabelMap,
      "childcare_schedule_type",
      scheduleType,
    );
    const locationId = trimOrNull(r.location_id);
    const cohortKey = trimOrNull(r.program_room_cohort_key);
    const cohortLabel =
      cohortKey ?
        (optionLabelFromBatchMap(optionLabelMap, "childcare_program_type", cohortKey) ?? cohortKey)
      : null;
    // Prefer the configured status_definitions label; else the canonical New Lead label so any legacy
    // `new_inquiry` child row renders "New Lead", never "New Inquiry"; else humanize the key rather
    // than leaking the raw snake_case key. Null key → null label (the child badge is suppressed).
    const outcomeStatusLabel = outcomeStatusKey
      ? (ocmStatusLabelByKey.get(outcomeStatusKey) ??
         canonicalNewLeadStatusLabel(outcomeStatusKey) ??
         humanizeStatusKey(outcomeStatusKey))
      : null;
    const first_name = identity.first_name;
    const last_name = identity.last_name;
    return {
      id: r.id,
      customer_member_id: r.customer_member_id,
      person_id: pid,
      display_name:
        identity.display_name ??
        (pid ? warmPersonDisplayName(p) : null) ??
        r.customer_member_id.slice(0, 8) + "…",
      first_name,
      last_name,
      dob,
      age: age ? age.label : null,
      linked_on_inquiry: true,
      ocm_id: r.id,
      program_category_id: programCategoryId,
      program_key: programKey,
      desired_program_label: desiredProgramLabel,
      schedule_type: scheduleType,
      desired_schedule_label: desiredScheduleLabel,
      outcome_status_key: outcomeStatusKey,
      outcome_status_label: outcomeStatusLabel,
      fit_status: trimOrNull(r.fit_status),
      notes: trimOrNull(r.notes),
      start_date: normalizeIsoDateOnly(r.start_date),
      location_id: locationId,
      location_label: locationId ? (locationLabelById.get(locationId) ?? null) : null,
      program_room_cohort_key: cohortKey,
      program_room_cohort_label: cohortLabel,
      custom_fields: {},
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      photo_url:
        warmPersonPhotoUrl(p)
        ?? (() => {
          const memMeta = (m?.metadata ?? null) as Record<string, unknown> | null;
          if (!memMeta) return null;
          for (const key of ["photo_url", "avatar_url", "profile_photo_url", "profile_image_url", "image_url"]) {
            const value = memMeta[key];
            if (value != null && String(value).trim() !== "") return String(value).trim();
          }
          return null;
        })(),
      created_at: r.created_at ?? null,
      updated_at: r.updated_at ?? null,
    };
  });
}

/**
 * Overlay process_instances (source of truth) onto the OCM-derived child blocks. The Focus Panel /
 * record surface shows child ENROLLMENT PARTICIPATION (state) and PROCESS STAGE from process_instances,
 * not OCM.outcome_status_key. OCM stays only as the enumerator + bridge for participation-detail fields
 * (program/schedule/start/fit — still edited via the OCM PATCH path, retired in a later slice).
 *
 * Match is by customer_member_id (= process_instances.subject_id). A child with no process instance
 * (legacy pre-cutover) keeps its OCM-sourced status as a documented fallback.
 */
/** Pure application of process-instance participation onto children (fetch already resolved). */
export function applyProcessInstanceParticipation(
  children: InquiryHydrateChild[],
  instances: Awaited<ReturnType<typeof listEnrollmentInstancesForLead>>,
  ocmStatusLabelByKey: Map<string, string>,
): InquiryHydrateChild[] {
  if (!children.length) return children;
  if (!instances.length) {
    // No process instances yet (legacy lead) → OCM remains the participation source (bridge fallback).
    return children.map((c) => ({ ...c, _participation_source: "ocm" as const }));
  }
  const piBySubject = new Map(instances.map((pi) => [pi.subject_id, pi]));
  return children.map((c) => {
    const pi = c.customer_member_id ? piBySubject.get(c.customer_member_id) : undefined;
    if (!pi) return { ...c, _participation_source: "ocm" as const };
    const stateKey = trimOrNull(pi.state);
    const stageKey = trimOrNull(pi.stage_key);
    const stateLabel = stateKey
      ? (ocmStatusLabelByKey.get(stateKey) ??
         canonicalNewLeadStatusLabel(stateKey) ??
         humanizeStatusKey(stateKey))
      : null;
    return {
      ...c,
      // Participation state + process stage are authoritative from process_instances.
      outcome_status_key: stateKey,
      outcome_status_label: stateLabel,
      stage_key: stageKey,
      _participation_source: "process_instances" as const,
    };
  });
}

export async function overlayProcessInstanceParticipation(
  supabase: AdminSupabase,
  orgId: string,
  opportunityId: string,
  children: InquiryHydrateChild[],
  ocmStatusLabelByKey: Map<string, string>,
): Promise<InquiryHydrateChild[]> {
  if (!children.length) return children;
  const instances = await listEnrollmentInstancesForLead(supabase as never, { orgId, opportunityId });
  return applyProcessInstanceParticipation(children, instances, ocmStatusLabelByKey);
}

/**
 * Overlay DURABLE operational facts (program / room / schedule / start date) onto the child blocks from
 * the operational enrollment read model (child_enrollment_agreements + child_placements +
 * schedule_assignments) once enrollment has been materialized. Durable facts win; OCM fills only the gaps
 * and remains the fallback for children with no operational agreement yet. Matched by customer_member_id.
 */
/** Pure application of durable operational facts onto children (fetch already resolved). */
export function applyDurableOperationalFacts(
  children: InquiryHydrateChild[],
  facts: Awaited<ReturnType<typeof resolveDurableFactsForChildren>>,
): InquiryHydrateChild[] {
  if (!children.length) return children;
  if (!facts.size) return children.map((c) => ({ ...c, _operational_facts_source: "ocm" as const }));
  return children.map((c) => {
    const f = c.customer_member_id ? facts.get(c.customer_member_id) : undefined;
    if (!f) return { ...c, _operational_facts_source: "ocm" as const };
    return {
      ...c,
      // Durable operational facts are the source once materialized; OCM values fill gaps only.
      desired_program_label: f.programLabel ?? c.desired_program_label,
      program_room_cohort_label: f.roomLabel ?? c.program_room_cohort_label,
      desired_schedule_label: f.scheduleLabel ?? c.desired_schedule_label,
      start_date: normalizeIsoDateOnly(f.startDate) ?? c.start_date,
      program_category_id: f.programCategoryId ?? c.program_category_id,
      location_id: f.siteLocationId ?? c.location_id,
      _operational_facts_source: "durable" as const,
    };
  });
}

export async function overlayDurableOperationalFacts(
  supabase: AdminSupabase,
  orgId: string,
  children: InquiryHydrateChild[],
): Promise<InquiryHydrateChild[]> {
  if (!children.length) return children;
  const facts = await resolveDurableFactsForChildren(
    supabase as never,
    orgId,
    children.map((c) => ({ customerMemberId: c.customer_member_id, siteLocationId: c.location_id ?? null })),
  );
  return applyDurableOperationalFacts(children, facts);
}

/**
 * Overlay PRE-materialization participation facts from process_instances.metadata onto child blocks that
 * are NOT yet materialized (durable overlay left them "ocm"). Priority is durable > process_instance draft
 * > OCM: this runs AFTER the durable overlay and only touches non-durable children. Lets the Focus Panel
 * render program/room/schedule/start for new leads without any OCM row.
 */
export async function overlayProcessDraftParticipation(
  supabase: AdminSupabase,
  orgId: string,
  opportunityId: string,
  children: InquiryHydrateChild[],
): Promise<InquiryHydrateChild[]> {
  const pending = children.filter((c) => c._operational_facts_source !== "durable" && c.customer_member_id);
  if (!pending.length) return children;
  const draft = await resolveProcessDraftFactsForChildren(
    supabase as never,
    orgId,
    opportunityId,
    pending.map((c) => ({ customerMemberId: c.customer_member_id })),
  );
  if (!draft.size) return children;
  return children.map((c) => {
    if (c._operational_facts_source === "durable") return c;
    const f = c.customer_member_id ? draft.get(c.customer_member_id) : undefined;
    if (!f) return c;
    return {
      ...c,
      // Process-instance draft is the source pre-materialization; keep any existing value as a gap-fill.
      desired_program_label: f.programLabel ?? c.desired_program_label,
      program_room_cohort_label: f.roomLabel ?? c.program_room_cohort_label,
      desired_schedule_label: f.scheduleLabel ?? c.desired_schedule_label,
      start_date: normalizeIsoDateOnly(f.startDate) ?? c.start_date,
      program_category_id: f.programCategoryId ?? c.program_category_id,
      location_id: f.siteLocationId ?? c.location_id,
      location_label: f.siteLocationLabel ?? c.location_label,
      _operational_facts_source: "process_instance" as const,
    };
  });
}

function applyInquiryChildrenMetadataFallbacks(
  inquiryChildren: InquiryHydrateChild[],
  oppMeta: Record<string, unknown> | null,
  opportunityId: string,
): InquiryHydrateChild[] {
  let inquiryChildrenOut = [...inquiryChildren];
  if (!inquiryChildrenOut.length && oppMeta && Array.isArray(oppMeta.inquiry_children)) {
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
        const sid = `metadata_child:${opportunityId}:${i}`;
        return {
          id: sid,
          customer_member_id: sid,
          person_id: null,
          display_name: displayName,
          first_name: null,
          last_name: null,
          linked_on_inquiry: false,
          ocm_id: null,
          dob: typeof row.dob === "string" ? row.dob : null,
          age: typeof row.age === "string" ? row.age : null,
          program_category_id: null,
          program_key:
            typeof row.program_type_key === "string"
              ? trimOrNull(row.program_type_key)
              : null,
          desired_program_label:
            typeof row.program_label === "string"
              ? trimOrNull(row.program_label)
              : typeof row.program_short === "string"
                ? trimOrNull(row.program_short)
                : null,
          schedule_type: null,
          desired_schedule_label: null,
          outcome_status_key: null,
          outcome_status_label: null,
          fit_status: null,
          notes: typeof row.notes === "string" ? trimOrNull(row.notes) : null,
          start_date: null,
          custom_fields: {},
          metadata: (row.metadata as Record<string, unknown>) ?? {
            source: "opportunity_metadata",
          },
          created_at: null,
          updated_at: null,
        };
      })
      .filter(Boolean) as InquiryHydrateChild[];
  }
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
      const sid = `metadata_child:${opportunityId}:demo`;
      inquiryChildrenOut = [
        {
          id: sid,
          customer_member_id: sid,
          person_id: null,
          display_name: demoChild,
          first_name: null,
          last_name: null,
          linked_on_inquiry: false,
          ocm_id: null,
          dob: typeof md.child_dob === "string" ? md.child_dob : null,
          age: typeof md.child_age === "string" ? md.child_age : null,
          program_category_id: null,
          program_key:
            typeof md.program_type_key === "string"
              ? trimOrNull(md.program_type_key)
              : null,
          desired_program_label:
            typeof md.program_label === "string"
              ? trimOrNull(md.program_label)
              : typeof md.demo_requested_program === "string"
                ? trimOrNull(md.demo_requested_program)
                : null,
          schedule_type:
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
          start_date: null,
          custom_fields: {},
          metadata: { source: "opportunity_metadata_demo_child_name" },
          created_at: null,
          updated_at: null,
        },
      ];
    }
  }
  return inquiryChildrenOut;
}

/**
 * Drawer shell / drawer_primary: resolve inquiry children rows for immediate section paint.
 * Skips bulk person lookup and custom-field attach (values hydrate on full surface or edit).
 *
 * Option-set label batch (`batchOptionItemLabelsForOrg`) is intentionally omitted here (~400–500ms):
 * read-only rows use item_key fallbacks; editable dropdowns load option sets when edit mode arms.
 */
export async function attachOpportunityInquiryChildrenShell(
  supabase: AdminSupabase,
  orgId: string,
  host: Record<string, unknown>,
): Promise<void> {
  const opportunityId = trimOrNull(host.id);
  if (!opportunityId) {
    host._inquiry_children = [];
    return;
  }
  const householdId = trimOrNull(host.customer_id);
  const oppMeta = (host.metadata as Record<string, unknown> | null) ?? null;
  const oppDefaultProgramType = trimOrNull(host.program_type);
  const oppDefaultScheduleType = trimOrNull(host.schedule_type);
  // Sub-phase instrumentation for `children_orientation_ms` — surfaced on the record so the compose
  // can bubble it into the response `phases_ms` and the dominant first-useful cost is measurable.
  const cph: Record<string, number> = {};

  const ocmJoinP = supabase
    .from("opportunity_customer_members")
    .select(
      OCM_INQUIRY_SELECT_COLUMNS,
    )
    .eq("org_id", orgId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: true });

  const customerMembersP = householdId
    ? supabase
        .from("customer_members")
        .select(
          "id, display_name, relationship, dob, person_id, first_name, last_name, metadata, is_active",
        )
        .eq("org_id", orgId)
        .eq("customer_id", householdId)
        .eq("is_active", true)
        .limit(25)
    : Promise.resolve({ data: [] as CmBootstrapRow[], error: null });

  const tBatch0 = Date.now();
  const [joinRes, cmsRes, ocmMemberDefsTaggedPack] = await Promise.all([
    ocmJoinP,
    customerMembersP,
    fetchEffectiveStatusDefinitionsTagged(supabase, orgId, "opportunity_customer_members", {
      activeOnly: true,
      processLruTtlMs: 600_000,
      nextRevalidateSeconds: 900,
    }),
  ]);
  cph.ocm_members_batch_ms = Date.now() - tBatch0;

  const jrows = (joinRes.data ?? []) as OcmJoinRow[];
  const bootstrapList = ((cmsRes.data ?? []) ?? []) as CmBootstrapRow[];
  const memberIds = [...new Set(jrows.map((r) => r.customer_member_id).filter(Boolean))] as string[];
  const bootstrapById = new Map(bootstrapList.map((r) => [r.id, r]));
  const needingMemberForOcm = memberIds.filter((mid) => !bootstrapById.has(mid));
  if (needingMemberForOcm.length > 0) {
    const { data: supplemental } = await supabase
      .from("customer_members")
      .select(
        "id, display_name, relationship, dob, person_id, first_name, last_name, metadata",
      )
      .eq("org_id", orgId)
      .in("id", needingMemberForOcm);
    for (const row of supplemental ?? []) {
      const m = row as CmBootstrapRow;
      bootstrapById.set(m.id, m);
    }
  }

  const memList: CmBootstrapRow[] = [];
  for (const mid of memberIds) {
    const hit = bootstrapById.get(mid);
    if (hit) memList.push(hit);
  }

  const memberMap = new Map(memList.map((m) => [m.id, m]));
  const pmap = new Map<string, WarmPersonRow>();

  const optionLabelMap = EMPTY_OPTION_LABEL_MAP as Map<string, string>;
  const ocmStatusLabelByKey = displayLabelsFromDefinitions(ocmMemberDefsTaggedPack.rows);
  const tLoc0 = Date.now();
  const locationLabelById = await batchLocationLabelsForOrg(
    supabase,
    orgId,
    jrows.map((r) => trimOrNull(r.location_id)).filter((id): id is string => Boolean(id)),
  );
  cph.location_labels_ms = Date.now() - tLoc0;

  let inquiryBlocks = mapOcmJoinRowsToInquiryChildrenBlock(
    jrows,
    memberMap,
    pmap,
    oppDefaultProgramType,
    oppDefaultScheduleType,
    optionLabelMap,
    ocmStatusLabelByKey,
    locationLabelById,
  );
  let inquiryChildrenMerged = mergeHouseholdActiveChildrenIntoInquiryChildren(
    inquiryBlocks as InquiryChildHydrateRow[],
    bootstrapList,
    pmap,
    oppDefaultProgramType,
    oppDefaultScheduleType,
    optionLabelMap,
  );
  const inquiryChildrenBase = applyInquiryChildrenMetadataFallbacks(inquiryChildrenMerged, oppMeta, opportunityId);

  // ── Overlay chain — first-useful child orientation ──────────────────────────────────────────
  // Precedence of APPLICATION is fixed: placement labels → process-instance participation → durable
  // operational facts → process-instance draft (durable > draft > OCM). But the FETCHES of the first
  // three are mutually independent — each reads only the base children (customer_member_id/location_id)
  // and opportunityId, never a prior overlay's OUTPUT. So the three round-trips are issued CONCURRENTLY
  // and only their pure application stays serial; identical result, one round-trip instead of three.
  // Only the draft overlay depends on the durable overlay's output (it targets the non-durable remainder),
  // so it fetches+applies last.
  // Child-scoped contact links key off customer_member_id + person_id only — both STABLE across the
  // overlay chain (overlays never add/remove children or rewrite those ids). So this round-trip is
  // issued CONCURRENTLY with the overlay fetch instead of after it, removing one serial hop from the
  // dominant children chain. It writes a disjoint host key (`_child_scoped_contact_links`).
  const tLinks0 = Date.now();
  const baseMemberRows = memberRowsFromInquiryChildren(inquiryChildrenBase);
  const contactsP: Promise<unknown> =
    baseMemberRows.length > 0
      ? attachChildScopedContactLinksToRecord(supabase, orgId, baseMemberRows, host).then((r) => {
          cph.child_scoped_contacts_ms = Date.now() - tLinks0;
          return r;
        })
      : Promise.resolve().then(() => {
          host._child_scoped_contact_links = [];
          host._child_scoped_contact_links_query_failed = false;
          cph.child_scoped_contacts_ms = 0;
        });

  const tOverlay0 = Date.now();
  const placementLabeledP = enrichInquiryChildrenWithPlacementOptionLabels(supabase, orgId, inquiryChildrenBase);
  const processInstancesP = listEnrollmentInstancesForLead(supabase as never, { orgId, opportunityId });
  const durableFactsP = resolveDurableFactsForChildren(
    supabase as never,
    orgId,
    inquiryChildrenBase.map((c) => ({
      customerMemberId: c.customer_member_id,
      siteLocationId: c.location_id ?? null,
    })),
  );
  const [placementLabeled, processInstances, durableFacts] = await Promise.all([
    placementLabeledP,
    processInstancesP,
    durableFactsP,
  ]);
  cph.overlay_parallel_fetch_ms = Date.now() - tOverlay0;
  // Apply in precedence order (pure, synchronous).
  let inquiryChildrenOut = applyProcessInstanceParticipation(placementLabeled, processInstances, ocmStatusLabelByKey);
  inquiryChildrenOut = applyDurableOperationalFacts(inquiryChildrenOut, durableFacts);
  // Draft depends on the durable result (targets the non-durable remainder) → fetch+apply last.
  const tDraft0 = Date.now();
  inquiryChildrenOut = await overlayProcessDraftParticipation(supabase, orgId, opportunityId, inquiryChildrenOut);
  cph.process_draft_ms = Date.now() - tDraft0;
  inquiryChildrenOut = await attachCustomerMemberProfileToInquiryChildren(
    supabase,
    orgId,
    inquiryChildrenOut,
  );

  host._inquiry_children = inquiryChildrenOut;
  host._enrollment_participation_by_member = buildEnrollmentParticipationByMemberMap(processInstances);
  host._member_person_graph_pending = memList.some((m) => trimOrNull(m.person_id) != null);
  attachOpportunityChildLifecycleSummary(host);
  await contactsP; // ensure the concurrent contact-links fetch has committed before returning
  host._children_shell_phase_ms = cph;
}

type OppPersonShellRow = {
  id: string;
  person_id: string;
  role_type?: string | null;
};

/** `drawer_visible` / `drawer_primary`: linked adults for inquiry summary (names + channels). */
export async function attachOpportunityPersonsShell(
  supabase: AdminSupabase,
  orgId: string,
  host: Record<string, unknown>,
): Promise<void> {
  const opportunityId = trimOrNull(host.id);
  if (!opportunityId) {
    host._opportunity_persons = [];
    host._additional_contacts_shell_count = 0;
    return;
  }
  const primaryPersonId = trimOrNull(host.primary_person_id);
  const { data: opRows } = await supabase
    .from("opportunity_persons")
    .select("id, person_id, role_type, created_at")
    .eq("org_id", orgId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: true });
  const rows = (opRows ?? []) as OppPersonShellRow[];
  const personIds = [...new Set(rows.map((z) => trimOrNull(z.person_id)).filter(Boolean))] as string[];
  const pmap = new Map<string, WarmPersonRow>();
  if (personIds.length > 0) {
    const { data: people } = await supabase
      .from("persons")
      .select("id, first_name, last_name, full_name, email, phone, metadata")
      .eq("org_id", orgId)
      .in("id", personIds);
    for (const row of (people ?? []) as WarmPersonRow[]) {
      pmap.set(row.id, row);
    }
  }
  const mapped = rows
    .filter((r) => trimOrNull(r.id) && trimOrNull(r.person_id))
    .map((r) => {
      const pid = String(r.person_id).trim();
      const p = pmap.get(pid) ?? null;
      return {
        id: String(r.id).trim(),
        person_id: pid,
        role_type: trimOrNull(r.role_type) ?? "—",
        name: warmPersonDisplayName(p),
        phone: trimOrNull(p?.phone),
        email: trimOrNull(p?.email),
        photo_url: warmPersonPhotoUrl(p),
      };
    });
  host._opportunity_persons = mapped;
  host._additional_contacts_shell_count = mapped.filter(
    (r) => !primaryPersonId || r.person_id !== primaryPersonId,
  ).length;
}

/** Household guardians for inquiry lead summary — merges with `_opportunity_persons` in FamilyContactsPanel. */
export async function attachOpportunityHouseholdCustomerPersonsForDrawer(
  supabase: AdminSupabase,
  orgId: string,
  host: Record<string, unknown>,
): Promise<void> {
  const householdId =
    typeof host.customer_id === "string" && host.customer_id.trim() ? host.customer_id.trim() : null;
  if (!householdId) {
    host._customer_persons = [];
    return;
  }

  const pmap = new Map<string, WarmPersonRow>();
  const rawOpp = (host._opportunity_persons as { person_id?: string }[]) ?? [];
  if (Array.isArray(rawOpp)) {
    for (const row of rawOpp) {
      const pid = trimOrNull(row.person_id);
      if (!pid) continue;
      pmap.set(pid, {
        id: pid,
        first_name: null,
        last_name: null,
        full_name: null,
        email: null,
        phone: null,
      });
    }
  }

  const { data: cpRows } = await supabase
    .from("customer_persons")
    .select("person_id, role_type, is_primary")
    .eq("org_id", orgId)
    .eq("customer_id", householdId);

  const cpPersonIds = [
    ...new Set(
      ((cpRows ?? []) as { person_id?: string | null }[])
        .map((r) => trimOrNull(r.person_id))
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const missingCpPersonIds = cpPersonIds.filter((pid) => !pmap.has(pid));
  if (missingCpPersonIds.length > 0) {
    const { data: cpPeople } = await supabase
      .from("persons")
      .select("id, first_name, last_name, full_name, email, phone, metadata")
      .eq("org_id", orgId)
      .in("id", missingCpPersonIds);
    for (const row of (cpPeople ?? []) as WarmPersonRow[]) {
      pmap.set(row.id, row);
    }
  }

  host._customer_persons = ((cpRows ?? []) as {
    person_id: string;
    role_type?: string | null;
    is_primary?: boolean | null;
  }[]).map((cp) => {
    const p = (pmap.get(cp.person_id) ?? null) as WarmPersonRow | null;
    return {
      customer_id: householdId,
      person_id: cp.person_id,
      role_type: trimOrNull(cp.role_type),
      is_primary: Boolean(cp.is_primary),
      name: warmPersonDisplayName(p),
      phone: trimOrNull(p?.phone),
      email: trimOrNull(p?.email),
      photo_url: warmPersonPhotoUrl(p),
    };
  });
}

/** Header last-activity line — workflow_events + WU/dept rules (no separate client GET when embedded). */
export async function attachOpportunityActivitySignalShell(
  supabase: AdminSupabase,
  orgId: string,
  host: Record<string, unknown>,
): Promise<void> {
  const opportunityId = trimOrNull(host.id);
  if (!opportunityId) {
    host._activity_signal = null;
    return;
  }
  const statusKey =
    trimOrNull(host.status_key) ?? trimOrNull(host.status) ?? null;
  const workUnitId = trimOrNull(host.work_unit_id);
  try {
    let preloadedOrgMetadata: { workUnitMetadata: unknown | null; departmentMetadata: unknown | null } | null =
      null;
    if (workUnitId) {
      const { data: wu } = await supabase
        .from("work_units")
        .select("metadata, department_id")
        .eq("id", workUnitId)
        .eq("org_id", orgId)
        .maybeSingle();
      const workUnitMetadata = (wu as { metadata?: unknown } | null)?.metadata ?? null;
      const deptId = trimOrNull((wu as { department_id?: string | null } | null)?.department_id);
      const departmentMetadata = deptId
        ? await fetchDepartmentMetadataForActivity(supabase, orgId, deptId)
        : null;
      preloadedOrgMetadata = { workUnitMetadata, departmentMetadata };
    }
    const sig = await loadOpportunityActivitySignal({
      supabase,
      orgId,
      opportunityId,
      statusKey,
      workUnitId,
      preloadedOrgMetadata,
    });
    host._activity_signal = sig;
  } catch {
    host._activity_signal = null;
  }
}

/** Lazy member→person hydrate for `_inquiry_children` enrichment (skipped on main full hydrate Pass 6). */
async function respondOpportunityRelationshipMemberOverlay(
  supabase: AdminSupabase,
  orgId: string,
  opportunityId: string,
  opp: Record<string, unknown> & {
    customer_id?: string | null;
    program_type?: string | null;
    schedule_type?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  opportunityRouteStartedAt: number,
  request: NextRequest,
): Promise<NextResponse> {
  const hydrateGraphTimings: Record<string, number> = {};
  const oppMeta =
    opp.metadata === null || typeof opp.metadata !== "object" ? null : (opp.metadata as Record<string, unknown>);
  const primaryBundle = await fetchPrimaryPersonContactHydrate(supabase, orgId, opp);
  const householdId =
    typeof opp.customer_id === "string" && opp.customer_id.trim()
      ? opp.customer_id.trim()
      : null;
  const oppDefaultProgramType = trimOrNull(opp.program_type);
  const oppDefaultScheduleType = trimOrNull(opp.schedule_type);

  const ocmMemberDefsTaggedPackP = fetchEffectiveStatusDefinitionsTagged(
    supabase,
    orgId,
    "opportunity_customer_members",
    {
      activeOnly: true,
      processLruTtlMs: 600_000,
      nextRevalidateSeconds: 900,
    },
  );

  const ocmJoinTimedP = (async () => {
    const t0 = Date.now();
    const r = await supabase
      .from("opportunity_customer_members")
      .select(OCM_INQUIRY_SELECT_COLUMNS)
      .eq("org_id", orgId)
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: true });
    hydrateGraphTimings.ocm_join_ms = Date.now() - t0;
    return r;
  })();

  const oppPersonsRowsTimedP = (async () => {
    const t0 = Date.now();
    const r = await supabase
      .from("opportunity_persons")
      .select("id, person_id, role_type, created_at")
      .eq("org_id", orgId)
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: true });
    hydrateGraphTimings.opportunity_persons_rows_ms = Date.now() - t0;
    return r;
  })();

  const customerMembersTimedP = householdId
    ? (async () => {
        const t0 = Date.now();
        const r = await supabase
          .from("customer_members")
          .select(
            "id, display_name, relationship, dob, person_id, first_name, last_name, metadata, is_active",
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

  const [cmsRes, joinRes, oppPersonRowsRes] = await Promise.all([
    customerMembersTimedP,
    ocmJoinTimedP,
    oppPersonsRowsTimedP,
  ]);

  const jrows = (joinRes.data ?? []) as OcmJoinRow[];
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
  for (const mid of memberIds) {
    const hit = bootstrapById.get(mid);
    if (hit) memList.push(hit);
  }
  const memberMap = new Map(memList.map((m) => [m.id, m]));

  const personIdsFromMembers = [
    ...new Set(memList.map((m) => trimOrNull(m.person_id)).filter(Boolean)),
  ] as string[];
  const oppRowsWarmIds = (((oppPersonRowsRes.data ?? []) ?? []) as { person_id?: string | null }[]).map((z) =>
    trimOrNull(z.person_id),
  );
  const personIdsFromOppRows = [...new Set(oppRowsWarmIds.filter(Boolean))] as string[];

  const pmap = new Map<string, WarmPersonRow>();
  for (const w of primaryBundle.warmPersonRows) {
    if (w.id) pmap.set(w.id, w);
  }

  const memberPersonIdsNeeded = personIdsFromMembers.filter((pid) => !pmap.has(pid));
  const oppPersonIdsNeeded = personIdsFromOppRows.filter((pid) => !pmap.has(pid));
  const allNeeded = [...new Set([...memberPersonIdsNeeded, ...oppPersonIdsNeeded])];
  hydrateGraphTimings.relationship_overlay_member_linked_person_fetch_ms = 0;
  if (allNeeded.length > 0) {
    const tPl = Date.now();
    const { data: personRows } = await supabase
      .from("persons")
      .select("id, first_name, last_name, full_name, date_of_birth, email, phone, metadata")
      .eq("org_id", orgId)
      .in("id", allNeeded);
    hydrateGraphTimings.relationship_overlay_member_linked_person_fetch_ms = Date.now() - tPl;
    for (const pr of (personRows ?? []) as WarmPersonRow[]) {
      if (pr.id) pmap.set(pr.id, pr);
    }
  }

  const [ocmMemberDefsTaggedPack, locationLabelById] = await Promise.all([
    ocmMemberDefsTaggedPackP,
    batchLocationLabelsForOrg(
      supabase,
      orgId,
      jrows.map((r) => trimOrNull(r.location_id)).filter((id): id is string => Boolean(id)),
    ),
  ]);
  const optionLabelMap = EMPTY_OPTION_LABEL_MAP as Map<string, string>;

  const ocmMemberStatusDefs = ocmMemberDefsTaggedPack.rows;
  const ocmStatusTelemetry = ocmMemberDefsTaggedPack.telemetry;
  const ocmOppStatusDefsCacheHit = ocmMemberDefsTaggedPack.combinedCacheHit;
  const ocmStatusLabelByKey = displayLabelsFromDefinitions(ocmMemberStatusDefs);

  let inquiryBlocks = mapOcmJoinRowsToInquiryChildrenBlock(
    jrows,
    memberMap,
    pmap,
    oppDefaultProgramType,
    oppDefaultScheduleType,
    optionLabelMap,
    ocmStatusLabelByKey,
    locationLabelById,
  );
  inquiryBlocks = mergeHouseholdActiveChildrenIntoInquiryChildren(
    inquiryBlocks as InquiryChildHydrateRow[],
    bootstrapList,
    pmap,
    oppDefaultProgramType,
    oppDefaultScheduleType,
    optionLabelMap,
  );
  inquiryBlocks = applyInquiryChildrenMetadataFallbacks(inquiryBlocks, oppMeta, opportunityId);
  inquiryBlocks = await enrichInquiryChildrenWithPlacementOptionLabels(supabase, orgId, inquiryBlocks);
  inquiryBlocks = await attachInquiryChildRowCustomFields(supabase, orgId, inquiryBlocks);
  // Source of truth for participation state + process stage is process_instances (not OCM).
  const enrollmentInstances = await listEnrollmentInstancesForLead(supabase as never, {
    orgId,
    opportunityId,
  });
  inquiryBlocks = applyProcessInstanceParticipation(
    inquiryBlocks,
    enrollmentInstances,
    ocmStatusLabelByKey,
  );
  // Source of truth for operational facts (program/room/schedule/start) is the durable model once
  // materialized (agreement/placement/schedule); OCM is the fallback.
  inquiryBlocks = await overlayDurableOperationalFacts(supabase, orgId, inquiryBlocks);
  // Pre-materialization: participation facts come from process_instances.metadata (no OCM).
  inquiryBlocks = await overlayProcessDraftParticipation(supabase, orgId, opportunityId, inquiryBlocks);

  const overlayRecord: Record<string, unknown> = {
    id: opportunityId,
    org_id: orgId,
    _inquiry_children: inquiryBlocks,
    _enrollment_participation_by_member:
      buildEnrollmentParticipationByMemberMap(enrollmentInstances),
    _member_person_graph_pending: false,
    hydrate_graph_timings_ms_overlay: hydrateGraphTimings,
    ocm_status_defs_overlay: {
      combined_cache_hit: ocmOppStatusDefsCacheHit,
      telemetry: ocmStatusTelemetry,
    },
  };
  {
    const memberRows = memberRowsFromInquiryChildren(inquiryBlocks);
    if (memberRows.length > 0) {
      await attachChildScopedContactLinksToRecord(supabase, orgId, memberRows, overlayRecord);
    } else {
      overlayRecord._child_scoped_contact_links = [];
      overlayRecord._child_scoped_contact_links_query_failed = false;
    }
  }

  const payload = overlayRecord;

  if (process.env.NODE_ENV !== "production") {
    console.warn("[perf.drawer.member_person_graph_overlay]", payload);
  }

  const serverRouteMs = Date.now() - opportunityRouteStartedAt;

  return apiOk(
    { entity: payload },
    {
      request,
      headers: {
        "X-Alloy-Entity-Surface": "relationship_member_persons",
        "X-Alloy-Server-Duration": String(serverRouteMs),
      },
    },
  );
}

/**
 * Fast drawer shell payload — no `_operational_attention` (attaches on `surface=full` only).
 * Used by drawer operational bootstrap and `GET ?surface=drawer_visible`.
 */
export type BuildOpportunityDrawerVisiblePayloadOptions = {
  /** When queue/workspace context already resolved department, skip work_units lookup. */
  hintDepartmentId?: string | null;
  /** Display-only queue row hints — skip customer lookup when present. */
  hintCustomerName?: string | null;
  /** Display-only queue row hints — skip primary person hydrate when name present. */
  hintPrimaryPersonName?: string | null;
  hintPrimaryPersonEmail?: string | null;
  hintPrimaryPersonPhone?: string | null;
};

export async function buildOpportunityDrawerVisiblePayload(
  supabase: AdminSupabase,
  orgId: string,
  data: Record<string, unknown>,
  options?: BuildOpportunityDrawerVisiblePayloadOptions,
): Promise<Record<string, unknown>> {
  const opp = data as Record<string, unknown> & {
    status_key?: string | null;
    status?: string | null;
    customer_id?: string | null;
    primary_contact_id?: string | null;
    primary_person_id?: string | null;
    location_id?: string | null;
    pipeline_stage_id?: string | null;
    work_unit_id?: string | null;
    org_id?: string;
    name?: string | null;
    title?: string | null;
  };
  const wuidForDept = trimOrNull(opp.work_unit_id);
  const hintDepartmentId = trimOrNull(options?.hintDepartmentId ?? null);
  const hintCustomerName = trimOrNull(options?.hintCustomerName ?? null);
  const hintPrimaryPersonName = trimOrNull(options?.hintPrimaryPersonName ?? null);
  const hintPrimaryPersonEmail = trimOrNull(options?.hintPrimaryPersonEmail ?? null);
  const hintPrimaryPersonPhone = trimOrNull(options?.hintPrimaryPersonPhone ?? null);
  const oppPipelineStageId = opp.pipeline_stage_id ?? null;
  const oppOrgIdForDefs = opp.org_id;
  const primaryPersonContactP =
    hintPrimaryPersonName != null
      ? Promise.resolve({
          patch: {
            _primary_person_id: trimOrNull(opp.primary_person_id),
            _primary_person_name: hintPrimaryPersonName,
            _primary_person_email: hintPrimaryPersonEmail,
            _primary_person_phone: hintPrimaryPersonPhone,
            _contact_name: hintPrimaryPersonName,
            _primary_contact_name: hintPrimaryPersonName,
            _primary_contact_email: hintPrimaryPersonEmail,
            _primary_contact_phone: hintPrimaryPersonPhone,
          },
          warmPersonRows: [],
        })
      : fetchPrimaryPersonContactHydrate(supabase, orgId, opp);
  const phaseMs: Record<string, number> = {};
  const tParallel0 = Date.now();
  const wuDeptP = (async () => {
    const t0 = Date.now();
    const row = hintDepartmentId
      ? { data: { department_id: hintDepartmentId, metadata: null } }
      : wuidForDept
        ? await supabase
              .from("work_units")
              .select("department_id, metadata")
              .eq("id", wuidForDept)
              .eq("org_id", orgId)
              .maybeSingle()
        : { data: null };
    phaseMs.wu_dept_lookup_ms = Date.now() - t0;
    return row;
  })();
  const customerP =
    hintCustomerName != null
      ? Promise.resolve({ data: { name: hintCustomerName } })
      : (async () => {
          const t0 = Date.now();
          const row = opp.customer_id
            ? await supabase
                  .from("customers")
                  .select("name")
                  .eq("id", opp.customer_id)
                  .eq("org_id", orgId)
                  .single()
            : { data: null };
          phaseMs.customer_lookup_ms = Date.now() - t0;
          return row;
        })();
  const stageP = (async () => {
    const t0 = Date.now();
    const row = oppPipelineStageId
      ? await supabase
            .from("pipeline_stages")
            .select("name")
            .eq("id", oppPipelineStageId)
            .maybeSingle()
      : { data: null };
    phaseMs.pipeline_stage_lookup_ms = Date.now() - t0;
    return row;
  })();
  const primaryHydrP = (async () => {
    const t0 = Date.now();
    const patch = await primaryPersonContactP;
    phaseMs.primary_person_hydrate_ms = Date.now() - t0;
    return patch;
  })();
  const statusDefsP = (async () => {
    const t0 = Date.now();
    const rows = oppOrgIdForDefs
      ? (
            await fetchEffectiveStatusDefinitionsTagged(supabase, oppOrgIdForDefs, "opportunities", {
                activeOnly: true,
            })
        ).rows
      : [];
    phaseMs.status_defs_ms = Date.now() - t0;
    return rows;
  })();
  const locP = (async () => {
    const t0 = Date.now();
    const row = opp.location_id
      ? await supabase
            .from("locations")
            .select("label, address1, city, state, postal_code")
            .eq("id", opp.location_id)
            .eq("org_id", orgId)
            .maybeSingle()
      : { data: null };
    phaseMs.location_lookup_ms = Date.now() - t0;
    return row;
  })();
  const [wuDeptRowV, customerRowV, stRowV, primaryHydrV, opportunityDefsVisible, locRowV] = await Promise.all([
    wuDeptP,
    customerP,
    stageP,
    primaryHydrP,
    statusDefsP,
    locP,
  ]);
  phaseMs.drawer_primary_parallel_ms = Date.now() - tParallel0;
  const vis: Record<string, unknown> = { ...data };
  vis._work_unit_department_id = hintDepartmentId
    ? hintDepartmentId
    : wuidForDept
      ? trimOrNull((wuDeptRowV.data as { department_id?: string | null } | null)?.department_id ?? null)
      : null;
  vis._customer_name = (customerRowV.data as { name?: string | null } | null)?.name ?? null;
  if (oppPipelineStageId) {
    const stName = (stRowV.data as { name?: string | null } | null)?.name ?? null;
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
    const l = locRowV.data as {
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
    vis._location_id = opp.location_id;
    vis._location_name = locLabel;
    vis._location_label = locLabel;
  } else {
    vis._location_id = null;
    vis._location_name = null;
    vis._location_label = null;
  }
  Object.assign(vis, primaryHydrV.patch);
  vis._drawer_primary_phase_ms = phaseMs;
  const oppSkRawV =
    opp.status_key != null && String(opp.status_key).trim() !== ""
      ? String(opp.status_key).trim()
      : null;
  const stageLabelV =
    vis._pipeline_stage_name != null && String(vis._pipeline_stage_name).trim() !== ""
      ? String(vis._pipeline_stage_name).trim()
      : null;
  vis._status_display = resolveOpportunityStatusDisplay({
    statusKey: oppSkRawV,
    statusDefs: opportunityDefsVisible,
    pipelineStageId: oppPipelineStageId,
    pipelineStageName: stageLabelV,
  });
  const qtV = effectiveOpportunityQuoteDollars(opp as Parameters<typeof effectiveOpportunityQuoteDollars>[0]);
  vis._quote_total_display = qtV;
  Object.assign(
    vis,
    buildOpportunityLifecycleFields({
      statusKey: oppSkRawV,
      quoteTotalDollars: qtV,
      defs: opportunityDefsVisible,
    }),
  );
  vis._field_definitions = [];
  vis._record_surface = "drawer_visible";
  await Promise.all([
    attachOpportunityInquiryChildrenShell(supabase, orgId, vis),
    attachOpportunityPersonsShell(supabase, orgId, vis),
    attachOpportunityActivitySignalShell(supabase, orgId, vis),
    attachOpportunityInquirySummaryTaskPreview(supabase, orgId, vis),
  ]);
  vis._relationship_displays = {};
  const householdIdV =
    typeof opp.customer_id === "string" && opp.customer_id.trim() ? opp.customer_id.trim() : null;
  const householdLabelV = trimOrNull(vis._customer_name) ?? "—";
  const inquiryTitleEarlyV = trimOrNull(vis.name) ?? trimOrNull(vis.title) ?? "—";
  vis._identity = {
    household: householdIdV ? { id: householdIdV, label: householdLabelV } : null,
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
  return vis;
}

/**
 * Opportunity record resolution for `GET /api/admin/entity/opportunities/:id`.
 * Centralizes enrichment, surfaces, lifecycle + quote parity (drawer_visible vs full).
 *
 * Data split (drawer UX):
 * - **drawer_visible (fast shell):** native row + minimal FK labels (pipeline stage placeholder, household name,
 *   primary person/contact identity strings), lifecycle + quote shells, cached opportunity status defs, empty
 *   `_relationship_displays`, `_field_definitions`, `_opportunity_persons` (shell), `_activity_signal`, `_inquiry_children` (shell).
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
  accessDim?: AdminAccessScopeDimensions | null,
): Promise<NextResponse> {
  const opportunityRouteStartedAt = Date.now();
  const { data, error } = await withDbTiming(
    "opportunities.select_by_id",
    { orgId, id },
    async () =>
      supabase
        .from("opportunities")
        .select(OPPORTUNITY_CANONICAL_ADMIN_SELECT)
        .eq("id", id)
        .eq("org_id", orgId)
        .single(),
  );
  if (error || !data) {
    const status = error?.code === "PGRST116" ? 404 : 500;
    return apiError(
      status === 404 ? "NOT_FOUND" : "INTERNAL",
      error?.message || "Not found",
      status,
      undefined,
      { request },
    );
  }
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
  if (
    accessDim &&
    !(await assertOpportunityInAccessScope(supabase, orgId, accessDim, {
      work_unit_id: (opp as { work_unit_id?: string | null }).work_unit_id,
      location_id: opp.location_id ?? null,
    }))
  ) {
    return apiError("NOT_FOUND", "Not found", 404, undefined, { request });
  }
  const out: Record<string, unknown> = { ...data };
  const surfaceParamEarly = (request.nextUrl.searchParams.get("surface") ?? "")
    .trim()
    .toLowerCase();

  if (surfaceParamEarly === "relationship_member_persons") {
    return respondOpportunityRelationshipMemberOverlay(
      supabase,
      orgId,
      id,
      opp,
      opportunityRouteStartedAt,
      request,
    );
  }

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
  const personDisplayName = warmPersonDisplayName;
  const primaryPersonContactP = fetchPrimaryPersonContactHydrate(supabase, orgId, opp);

  if (surfaceParamEarly === "drawer_visible") {
    const enrichStartedAt = Date.now();
    const enrichPhaseMs: Record<string, number> = {};
    const tVis0 = Date.now();
    const vis = await buildOpportunityDrawerVisiblePayload(supabase, orgId, data);
    enrichPhaseMs.visible_build_ms = Date.now() - tVis0;
    const enrichTotalMsV = Date.now() - enrichStartedAt;
    const enrichHeaderV =
      JSON.stringify({ total_ms: enrichTotalMsV, phases_ms: enrichPhaseMs })
        .length < 3900
        ? JSON.stringify({ total_ms: enrichTotalMsV, phases_ms: enrichPhaseMs })
        : JSON.stringify({ total_ms: enrichTotalMsV, phases_ms: {} });
    const serverRouteMsV = Date.now() - opportunityRouteStartedAt;
    const visibleLogMs = enrichTotalMsV;
    const visibleDeptId = trimOrNull(vis._work_unit_department_id as string | null);
    if (process.env.NODE_ENV !== "production" || visibleLogMs > 200) {
      timingOpportunityApiVisible({
        opportunity_id: id,
        org_id: orgId,
        work_unit_id: wuidForDept ?? null,
        department_id: visibleDeptId,
        total_ms: visibleLogMs,
        enrich_phases_ms: enrichPhaseMs,
        server_route_ms: serverRouteMsV,
        source: "network",
      });
    }
    return apiOk(
      { entity: vis },
      {
        request,
        headers: {
          "X-Alloy-Entity-Surface": "drawer_visible",
          "X-Alloy-Opp-Enrich": enrichHeaderV,
          "X-Alloy-Server-Duration": String(serverRouteMsV),
        },
      },
    );
  }

  if (surfaceParamEarly === "drawer_primary" || surfaceParamEarly === "drawer_initial") {
    const enrichStartedAt = Date.now();
    const enrichPhaseMs: Record<string, number> = {};
    const tPrimary0 = Date.now();
    // Queue opener hints (display-only): trust the department hint to skip the work_units lookup only
    // when the hint's work_unit matches this opportunity's actual work_unit. `surface=full` always
    // recomputes department/work-unit from the DB, so a stale hint self-corrects on enrichment.
    const openerHints = readOpportunityDrawerOpenerHints(request.nextUrl.searchParams);
    const oppWorkUnitId = trimOrNull((opp as { work_unit_id?: string | null }).work_unit_id ?? null);
    const trustedHintDepartmentId =
      openerHints.departmentId &&
      openerHints.workUnitId &&
      oppWorkUnitId &&
      openerHints.workUnitId === oppWorkUnitId
        ? openerHints.departmentId
        : null;
    const out = await buildOpportunityDrawerVisiblePayload(supabase, orgId, data, {
      hintDepartmentId: trustedHintDepartmentId,
      hintCustomerName: openerHints.customerName,
      hintPrimaryPersonName: openerHints.primaryPersonName,
      hintPrimaryPersonEmail: openerHints.primaryPersonEmail,
      hintPrimaryPersonPhone: openerHints.primaryPersonPhone,
    });
    enrichPhaseMs.drawer_primary_build_ms = Date.now() - tPrimary0;
    const primaryPhases = (out._drawer_primary_phase_ms ?? {}) as Record<string, number>;
    Object.assign(enrichPhaseMs, primaryPhases);
    out._record_surface =
      surfaceParamEarly === "drawer_initial" ? "drawer_initial" : "drawer_primary";
    const inquiryLinesPrimary = buildOpportunityInquiryLinesLite(out);
    const inquiryTitleEarly =
      trimOrNull(out.name) ??
      trimOrNull(out.title) ??
      (inquiryLinesPrimary.length
        ? inquiryLinesPrimary.map((l) => l.value).join(" · ")
        : null) ??
      "—";
    const householdIdPrimary =
      typeof opp.customer_id === "string" && opp.customer_id.trim()
        ? opp.customer_id.trim()
        : null;
    const householdLabelPrimary = trimOrNull(out._customer_name) ?? "—";
    out._identity = {
      household: householdIdPrimary ? { id: householdIdPrimary, label: householdLabelPrimary } : null,
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
      inquiry: {
        title: inquiryTitleEarly,
        lines: inquiryLinesPrimary,
        section_key: "quote",
      },
    };
    const enrichTotalMsPrimary = Date.now() - enrichStartedAt;
    const enrichHeaderPrimary =
      JSON.stringify({ total_ms: enrichTotalMsPrimary, phases_ms: enrichPhaseMs }).length < 3900
        ? JSON.stringify({ total_ms: enrichTotalMsPrimary, phases_ms: enrichPhaseMs })
        : JSON.stringify({ total_ms: enrichTotalMsPrimary, phases_ms: {} });
    const serverRouteMsPrimary = Date.now() - opportunityRouteStartedAt;
    const primaryDeptId = trimOrNull(out._work_unit_department_id as string | null);
    // Operational attention is intentionally deferred off the drawer_primary critical path; the
    // attention bundle is recomputed on `surface=full`. Resolving it here re-ran the resolver plus
    // extra work_unit / status-def / department lookups synchronously, slowing first paint.
    out._operational_attention_deferred = true;
    if (process.env.NODE_ENV !== "production" || enrichTotalMsPrimary > 200) {
      timingOpportunityDrawerPrimary({
        opportunity_id: id,
        org_id: orgId,
        work_unit_id: wuidForDept ?? null,
        department_id: primaryDeptId,
        total_ms: enrichTotalMsPrimary,
        enrich_phases_ms: enrichPhaseMs,
        server_route_ms: serverRouteMsPrimary,
        payload_bytes: Buffer.byteLength(JSON.stringify(out), "utf8"),
      });
    }
    return apiOk(
      { entity: out },
      {
        request,
        headers: {
          "X-Alloy-Entity-Surface": out._record_surface as string,
          "X-Alloy-Opp-Enrich": enrichHeaderPrimary,
          "X-Alloy-Server-Duration": String(serverRouteMsPrimary),
        },
      },
    );
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
          .select("department_id, metadata")
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
  const tFinShell = Date.now();
  const oppOrgId = oppOrgIdForDefs;
  const oppSkRaw =
    opp.status_key != null && String(opp.status_key).trim() !== ""
      ? String(opp.status_key).trim()
      : null;
  const stageLabel =
    out._pipeline_stage_name != null &&
    String(out._pipeline_stage_name).trim() !== ""
      ? String(out._pipeline_stage_name).trim()
      : null;
  let oppStatusDisplay = resolveOpportunityStatusDisplay({
    statusKey: oppSkRaw,
    statusDefs: opportunityDefs,
    pipelineStageId: oppPipelineStageId,
    pipelineStageName: stageLabel,
  });
  if (oppStatusDisplay != null && isUuidLike(String(oppStatusDisplay))) {
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
  hydrateGraphTimings.opportunity_financial_status_shell_ms = Date.now() - tFinShell;
  markPhase("after_status_defs_and_financial");
  lapSegment("status_resolve_and_lifecycle_shell");
  const relationshipDisplaysMode = await attachDirectFkRelationshipDisplays(
    supabase,
    orgId,
    "opportunities",
    out,
  );
  markPhase("after_relationship_displays");
  lapSegment("relationship_displays_attach");

  const oppMeta = (opp.metadata ?? null) as Record<string, unknown> | null;
  // Opportunity-level legacy field key — not the OCM column (S2 renamed OCM only).
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
      nextRevalidateSeconds: 900,
    },
  );

  const ocmJoinP = supabase
    .from("opportunity_customer_members")
    .select(OCM_INQUIRY_SELECT_COLUMNS)
    .eq("org_id", orgId)
    .eq("opportunity_id", id)
    .order("created_at", { ascending: true });

  const ocmJoinTimedP = (async () => {
    const t0 = Date.now();
    const r = await ocmJoinP;
    hydrateGraphTimings.ocm_join_ms = Date.now() - t0;
    return r;
  })();

  const oppPersonsRowsQuery = supabase
    .from("opportunity_persons")
    .select("id, person_id, role_type, created_at")
    .eq("org_id", orgId)
    .eq("opportunity_id", id)
    .order("created_at", { ascending: true });

  const oppPersonsRowsTimedP = (async () => {
    const t0 = Date.now();
    const r = await oppPersonsRowsQuery;
    hydrateGraphTimings.opportunity_persons_rows_ms = Date.now() - t0;
    return r;
  })();

  const primaryPersonRoleP = (async () => {
    const t0 = Date.now();
    try {
      if (
        !(
          householdId &&
          typeof opp.primary_person_id === "string" &&
          opp.primary_person_id.trim()
        )
      ) {
        return {
          role_key: null as string | null,
          role_label: null as string | null,
        };
      }
      const rr = await resolveCustomerPersonRole(supabase, {
        orgId,
        customerId: householdId,
        personId: opp.primary_person_id.trim(),
      });
      return rr;
    } finally {
      hydrateGraphTimings.primary_role_ms = Date.now() - t0;
    }
  })();

  const contactRoleP = (async (): Promise<{
    contactRoleKey: string | null;
    contactRoleLabel: string | null;
  }> => {
    const t0 = Date.now();
    try {
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
    } finally {
      hydrateGraphTimings.contact_role_chain_ms = Date.now() - t0;
    }
  })();

  const customerMembersTimedP = householdId
    ? (async () => {
        const t0 = Date.now();
        const r = await supabase
          .from("customer_members")
          .select(
            "id, display_name, relationship, dob, person_id, first_name, last_name, metadata, is_active",
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

  const [personRR, contactRR, cmsRes, joinRes, oppPersonsListResEarly] = await Promise.all([
    primaryPersonRoleP,
    contactRoleP,
    customerMembersTimedP,
    ocmJoinTimedP,
    oppPersonsRowsTimedP,
  ]);

  const personRoleKey = personRR.role_key;
  const personRoleLabel = personRR.role_label;
  const contactRoleKey = contactRR.contactRoleKey;
  const contactRoleLabel = contactRR.contactRoleLabel;

  const tIdentityChildSerial0 = Date.now();

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
        const tRelLookup = Date.now();
        const { data: rt } = await supabase
          .from("customer_member_relationship_types")
          .select("label")
          .eq("org_id", orgId)
          .eq("key", relKey)
          .maybeSingle();
        hydrateGraphTimings.customer_member_child_relationship_type_lookup_ms = Date.now() - tRelLookup;
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

  hydrateGraphTimings.identity_child_pick_serial_after_parallel_ms = Date.now() - tIdentityChildSerial0;

  const joinRows = joinRes.data;
  markPhase("after_identity_parallel_fetch");
  lapSegment("identity_roles_and_ocm_join_parallel");
  const jrows = (joinRows ?? []) as OcmJoinRow[];
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
  const personIdsFromMembers = [
    ...new Set(memList.map((m) => trimOrNull(m.person_id)).filter(Boolean)),
  ] as string[];
  const oppRowsWarmIds = (((oppPersonsListResEarly.data ?? []) ?? []) as { person_id?: string | null }[]).map((z) =>
    trimOrNull(z.person_id),
  );
  const personIdsFromOppRows = [...new Set(oppRowsWarmIds.filter(Boolean))] as string[];

  const unionGraphPersonIds = [...new Set([...personIdsFromMembers, ...personIdsFromOppRows])];
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

  /** Member-linked `persons` rows are deferred to `surface=relationship_member_persons` (Pass 6). */
  const memberLinkedPersonIdsDeferred = personIdsFromMembers.filter((pid) => !pmap.has(pid));
  const oppRolesPersonPrefetchIds = personIdsFromOppRows.filter((pid) => !pmap.has(pid));
  out._member_person_graph_pending = memberLinkedPersonIdsDeferred.length > 0;
  hydrateGraphTimings.relationship_member_person_ids_deferred_count =
    memberLinkedPersonIdsDeferred.length;
  hydrateGraphTimings.customer_member_linked_person_bulk_skipped_ms = memberLinkedPersonIdsDeferred.length ? 1 : 0;

  const person_lookup_reused_count = unionGraphPersonIds.filter((pid) => pmap.has(pid)).length;
  const linked_persons_missing_count =
    memberLinkedPersonIdsDeferred.length + oppRolesPersonPrefetchIds.length;

  hydrateGraphTimings.customer_member_person_lookup_ms = 0;
  hydrateGraphTimings.opportunity_roles_person_prefetch_ms = 0;
  if (oppRolesPersonPrefetchIds.length > 0) {
    const tPl = Date.now();
    const { data: personRows } = await supabase
      .from("persons")
      .select("id, first_name, last_name, full_name, date_of_birth, email, phone, metadata")
      .eq("org_id", orgId)
      .in("id", oppRolesPersonPrefetchIds);
    const wall = Date.now() - tPl;
    hydrateGraphTimings.customer_member_person_lookup_ms = wall;
    hydrateGraphTimings.opportunity_roles_person_prefetch_ms = wall;
    for (const pr of (personRows ?? []) as WarmPersonRow[]) {
      if (pr.id) pmap.set(pr.id, pr);
    }
  }

  let person_lookup_missing_count =
    memberLinkedPersonIdsDeferred.length +
    oppRolesPersonPrefetchIds.filter((pid) => !pmap.has(pid)).length;

  lapSegment("customer_member_linked_person_lookup");

  const tInquiry0 = Date.now();
  // Option label batch deferred off full-hydrate first paint — see attachOpportunityInquiryChildrenShell.
  const [ocmMemberDefsTaggedPack, locationLabelById] = await Promise.all([
    ocmMemberDefsTaggedPackP,
    batchLocationLabelsForOrg(
      supabase,
      orgId,
      (jrows as OcmJoinRow[])
        .map((r) => trimOrNull(r.location_id))
        .filter((id): id is string => Boolean(id)),
    ),
  ]);
  const optionLabelMap = EMPTY_OPTION_LABEL_MAP as Map<string, string>;
  const inquiryBatchMs = Date.now() - tInquiry0;
  enrichPhaseMs.inquiry_children_batch_ms = inquiryBatchMs;
  lapSegment("inquiry_ocm_defs_options_opportunity_persons_rows");

  const ocmMemberStatusDefs = ocmMemberDefsTaggedPack.rows;
  const ocmOppStatusDefsCacheHit = ocmMemberDefsTaggedPack.combinedCacheHit;
  const ocmStatusTelemetry = ocmMemberDefsTaggedPack.telemetry;
  const ocmStatusLabelByKey = displayLabelsFromDefinitions(ocmMemberStatusDefs);

  let inquiryBlocks = mapOcmJoinRowsToInquiryChildrenBlock(
    jrows as OcmJoinRow[],
    memberMap,
    pmap,
    oppDefaultProgramType,
    oppDefaultScheduleType,
    optionLabelMap,
    ocmStatusLabelByKey,
    locationLabelById,
  );
  let inquiryChildrenMerged = mergeHouseholdActiveChildrenIntoInquiryChildren(
    inquiryBlocks as InquiryChildHydrateRow[],
    bootstrapList,
    pmap,
    oppDefaultProgramType,
    oppDefaultScheduleType,
    optionLabelMap,
  );
  let inquiryChildrenOut = applyInquiryChildrenMetadataFallbacks(inquiryChildrenMerged, oppMeta, id);
  inquiryChildrenOut = await enrichInquiryChildrenWithPlacementOptionLabels(
    supabase,
    orgId,
    inquiryChildrenOut,
  );
  inquiryChildrenOut = await attachInquiryChildRowCustomFields(supabase, orgId, inquiryChildrenOut);
  inquiryChildrenOut = await attachCustomerMemberProfileToInquiryChildren(
    supabase,
    orgId,
    inquiryChildrenOut,
  );
  out._inquiry_children = inquiryChildrenOut;
  attachOpportunityChildLifecycleSummary(out);
  {
    const memberRows = memberRowsFromInquiryChildren(inquiryChildrenOut);
    if (memberRows.length > 0) {
      await attachChildScopedContactLinksToRecord(supabase, orgId, memberRows, out);
    } else {
      out._child_scoped_contact_links = [];
      out._child_scoped_contact_links_query_failed = false;
    }
  }
  if (process.env.NODE_ENV !== "production") {
    out._debug_inquiry_children = {
      opportunity_id: id,
      customer_id: householdId,
      bootstrap_customer_member_rows: bootstrapList.length,
      bootstrap_active_child_rows: bootstrapList.filter((m) =>
        isActiveChildCustomerMemberForInquiry(m as Record<string, unknown>)
      ).length,
      ocm_join_rows: jrows.length,
      after_ocm_map: inquiryBlocks.length,
      after_household_merge: inquiryChildrenMerged.length,
      after_metadata_fallback: inquiryChildrenOut.length,
      child_customer_member_ids: inquiryChildrenOut.map((c) => c.customer_member_id),
    };
  }
  markPhase("after_inquiry_children_resolved");

  try {
    const memberIds = (out._inquiry_children as { customer_member_id?: string | null }[] | undefined ?? [])
      .map((c) => (c.customer_member_id != null ? String(c.customer_member_id).trim() : ""))
      .filter(Boolean);
    const memberChildIds = new Map<string, string | null>();
    for (const child of (out._inquiry_children as { customer_member_id?: string | null; id?: string | null; person_id?: string | null }[] | undefined) ?? []) {
      const memberId = child.customer_member_id != null ? String(child.customer_member_id).trim() : "";
      if (!memberId) continue;
      memberChildIds.set(memberId, child.person_id != null ? String(child.person_id) : child.id != null ? String(child.id) : null);
    }
    if (memberIds.length > 0 && out.customer_id) {
      out._person_child_relationships_by_member = await attachPersonChildRelationshipsToEntityRecord({
        supabase,
        orgId,
        customerId: String(out.customer_id),
        customerMemberIds: memberIds,
        memberChildIds,
      });
    } else {
      out._person_child_relationships_by_member = [];
    }
  } catch (pcrAttachErr) {
    out._person_child_relationships_by_member = [];
    if (process.env.NODE_ENV !== "production") {
      console.warn("[opportunity_entity] person_child_relationship attach failed", pcrAttachErr);
    }
  }
  lapSegment("inquiry_children_metadata_fallbacks");

  {
    const opRows = oppPersonsListResEarly.data;
    type OppPersonLite = {
      id: string;
      person_id: string;
      role_type?: string | null;
    };
    type PersonRowAgg = WarmPersonRow;
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
        .select("id, first_name, last_name, full_name, date_of_birth, email, phone, metadata")
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
        photo_url: warmPersonPhotoUrl(p),
      };
    });

    if (householdId) {
      const { data: cpRows } = await supabase
        .from("customer_persons")
        .select("person_id, role_type, is_primary")
        .eq("org_id", orgId)
        .eq("customer_id", householdId);
      const cpPersonIds = [
        ...new Set(
          ((cpRows ?? []) as { person_id?: string | null }[])
            .map((r) => trimOrNull(r.person_id))
            .filter((id): id is string => Boolean(id))
        ),
      ];
      const missingCpPersonIds = cpPersonIds.filter((pid) => !pmap.has(pid));
      if (missingCpPersonIds.length > 0) {
        const { data: cpPeople } = await supabase
          .from("persons")
          .select("id, first_name, last_name, full_name, email, phone, metadata")
          .eq("org_id", orgId)
          .in("id", missingCpPersonIds);
        for (const row of (cpPeople ?? []) as PersonRowAgg[]) {
          pmap.set(row.id, row);
        }
      }
      out._customer_persons = ((cpRows ?? []) as {
        person_id: string;
        role_type?: string | null;
        is_primary?: boolean | null;
      }[]).map((cp) => {
        const p = (pmap.get(cp.person_id) ?? null) as PersonRowAgg | null;
        return {
          customer_id: householdId,
          person_id: cp.person_id,
          role_type: trimOrNull(cp.role_type),
          is_primary: Boolean(cp.is_primary),
          name: personDisplayName(p),
          phone: trimOrNull(p?.phone),
          email: trimOrNull(p?.email),
          photo_url: warmPersonPhotoUrl(p),
        };
      });
    }
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

  const wuMetaFull =
    wuidForDept && wuDeptRow.data
      ? (wuDeptRow.data as { metadata?: unknown }).metadata ?? null
      : null;
  const deptMetaFull = await fetchDepartmentMetadataForActivity(
    supabase,
    orgId,
    (wuDeptRow.data as { department_id?: string | null } | null)?.department_id,
  );
  const deptIdFull = trimOrNull((wuDeptRow.data as { department_id?: string | null } | null)?.department_id);
  const attnFull = await attachOpportunityAttentionSuggestionBundle({
    supabase,
    orgId,
    opportunityRow: out as Record<string, unknown>,
    defs: opportunityDefs,
    attentionConfigMetadata: wuMetaFull,
    departmentMetadata: deptMetaFull,
    departmentId: deptIdFull,
    workUnitId: wuidForDept,
    statusKey: oppSkRaw,
    preloadedActivityOrgMetadata: {
      workUnitMetadata: (wuDeptRow.data as { metadata?: unknown } | null)?.metadata ?? null,
      departmentMetadata: deptMetaFull,
    },
    nowMs: Date.now(),
  });
  Object.assign(out, attnFull);

  const tSerialize0 = Date.now();
  const bodyJson = JSON.stringify(out);
  const serialization_ms = Date.now() - tSerialize0;
  const payload_kb = Buffer.byteLength(bodyJson, "utf8") / 1024;

  const fieldRegistryMetaFull: FieldRegistryAttachMeta = {};

  if (process.env.NODE_ENV !== "production" || enrichTotalMs > 250) {
    perfDrawerFullHydrate({
      entity_id: id,
      opportunity_id: id,
      org_id: orgId,
      work_unit_id: trimOrNull((opp as { work_unit_id?: string | null }).work_unit_id),
      total_ms: serverRouteMs,
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
      field_registry_stable_cache_key: fieldRegistryMetaFull.field_registry_stable_cache_key ?? null,
      field_registry_next_cache_hit: fieldRegistryMetaFull.field_registry_next_cache_hit ?? null,
      field_registry_process_cache_hit: fieldRegistryMetaFull.field_registry_process_cache_hit ?? null,
      field_registry_defs_resolve_wall_ms: fieldRegistryMetaFull.field_registry_defs_resolve_wall_ms ?? null,
      field_registry_field_values_wall_ms: fieldRegistryMetaFull.field_registry_field_values_wall_ms ?? null,
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

  // Wrap in the standard success envelope without re-serializing the (large) `out`
  // record: `bodyJson` is reused verbatim inside `data.entity`. @see apiResponse.ts
  const correlationId = resolveCorrelationId(request);
  const envelopeJson = `{"ok":true,"data":{"entity":${bodyJson}},"correlation_id":${JSON.stringify(
    correlationId,
  )}}`;
  return new NextResponse(envelopeJson, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      [CORRELATION_ID_HEADER]: correlationId,
      "X-Alloy-Entity-Surface": "full",
      "X-Alloy-Opp-Enrich": enrichHeader,
      "X-Alloy-Server-Duration": String(serverRouteMs),
    },
  });
}
