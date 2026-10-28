/**
 * FORMS SUBJECT SCOPE — may this actor read a form submission (or a packet session) about this subject?
 *
 * R2 (hosted qar_4246ac22ece0, D8): a department-restricted operator read an out-of-scope child's form answers through
 * `GET /api/admin/forms/submissions/[id]` and the list by child, while every Documents route refused the same actor.
 * Forms reads were admitted by an admin session and checked nothing else.
 *
 * The rule is the canonical department/site rule (`lib/admin/accessScope.ts`), not a Forms-only one:
 *   - an UNRESTRICTED actor (both dimensions "all") reads every subject of its organization;
 *   - a submission tied to an OPPORTUNITY is in scope when that opportunity is — its work unit's department and its
 *     site (`assertOpportunityInAccessScope`), the linkage every CRM route uses;
 *   - a submission whose only subject is a child, a household or a person (no department/site linkage), or none at all
 *     (unattached intake), is readable only by an unrestricted actor — `recordReadableWithoutDeptSiteLinkage`, the same
 *     fail-closed rule the entity drawer and Documents (`documentSubjectInActorScope`) apply to those subjects.
 * A missing access context is no scope at all: fail closed.
 *
 * Organization isolation stays where it is (every query is `org_id`-bound); this adds the dimension that was missing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { resolveOpportunityIdFromSessionSnapshotFields } from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";
import {
    accessScopeRestrictsData,
    assertOpportunityInAccessScope,
    recordReadableWithoutDeptSiteLinkage,
    scopeDimensionsFromAccess,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";

/** The subject columns a submission (or a packet session) carries. Any may be null. */
export type FormsSubjectRef = {
    opportunity_id?: string | null;
    customer_id?: string | null;
    customer_member_id?: string | null;
    person_id?: string | null;
};

/** The caller's scope for a Forms read, or null when the access context failed (fail closed). */
export async function formsReadScope(): Promise<AdminAccessScopeDimensions | null> {
    const access = await getAdminAccessContextCached();
    return access.ok ? scopeDimensionsFromAccess(access) : null;
}

const id = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Opportunity scope linkage for a set of opportunity ids (one read), keyed by id. Missing rows are absent. */
async function opportunityLinkage(
    supabase: SupabaseClient,
    orgId: string,
    opportunityIds: string[],
): Promise<Map<string, { work_unit_id: string | null; location_id: string | null }>> {
    const out = new Map<string, { work_unit_id: string | null; location_id: string | null }>();
    if (opportunityIds.length === 0) return out;
    const { data } = await supabase.from("opportunities").select("id, work_unit_id, location_id").eq("org_id", orgId).in("id", opportunityIds);
    for (const r of (data ?? []) as Array<{ id: string; work_unit_id: string | null; location_id: string | null }>) {
        out.set(String(r.id), { work_unit_id: r.work_unit_id ?? null, location_id: r.location_id ?? null });
    }
    return out;
}

/** Is this one subject inside the actor's department/site scope? */
export async function formsSubjectInActorScope(
    supabase: SupabaseClient,
    orgId: string,
    scope: AdminAccessScopeDimensions | null,
    subject: FormsSubjectRef,
): Promise<boolean> {
    if (!scope) return false;
    if (!accessScopeRestrictsData(scope)) return true;
    const opp = id(subject.opportunity_id);
    if (opp) {
        const link = (await opportunityLinkage(supabase, orgId, [opp])).get(opp);
        if (!link) return false;
        return assertOpportunityInAccessScope(supabase, orgId, scope, link);
    }
    return recordReadableWithoutDeptSiteLinkage(scope);
}

/**
 * Keep only the rows whose subject is inside the actor's scope — the list half of {@link formsSubjectInActorScope}.
 * An unrestricted actor gets the rows untouched; a restricted one keeps only opportunity-linked rows in its scope.
 */
export async function filterFormsRowsInActorScope<T extends FormsSubjectRef>(
    supabase: SupabaseClient,
    orgId: string,
    scope: AdminAccessScopeDimensions | null,
    rows: readonly T[],
): Promise<T[]> {
    if (!scope) return [];
    if (!accessScopeRestrictsData(scope)) return [...rows];
    const opps = [...new Set(rows.map((r) => id(r.opportunity_id)).filter((x): x is string => Boolean(x)))];
    const links = await opportunityLinkage(supabase, orgId, opps);
    const allowed = new Set<string>();
    for (const o of opps) {
        const link = links.get(o);
        if (link && (await assertOpportunityInAccessScope(supabase, orgId, scope, link))) allowed.add(o);
    }
    return rows.filter((r) => {
        const o = id(r.opportunity_id);
        return o ? allowed.has(o) : recordReadableWithoutDeptSiteLinkage(scope);
    });
}

/**
 * By id: does the submission exist in the organization AND sit inside the caller's scope? Routes answer both cases with
 * the same 404, so an out-of-scope submission's existence is never disclosed.
 */
export async function formSubmissionReadableById(supabase: SupabaseClient, orgId: string, submissionId: string): Promise<boolean> {
    const { data } = await supabase
        .from("form_submissions")
        .select("opportunity_id, customer_id, customer_member_id, person_id")
        .eq("org_id", orgId)
        .eq("id", submissionId)
        .maybeSingle();
    if (!data) return false;
    return formsSubjectInActorScope(supabase, orgId, await formsReadScope(), data as FormsSubjectRef);
}

// ── packet sessions ──────────────────────────────────────────────────────────────────────────────────────────────
// A packet session has no subject columns: its subject is the trusted, server-written `crm_snapshot` (opportunity,
// household, child) or the `launch_context` source entity. Its opportunity, when known, decides; otherwise the
// no-linkage rule applies (and a session naming nothing is readable only unrestricted — fail closed).

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The subject a packet session is about, from its persisted snapshot fields. */
export function packetSessionSubject(row: { crm_snapshot?: unknown; launch_context?: unknown }): FormsSubjectRef {
    const snap = record(row.crm_snapshot);
    const lc = record(row.launch_context);
    const sourceType = typeof lc.source_entity_type === "string" ? lc.source_entity_type.trim().toLowerCase() : "";
    const source = id(lc.source_entity_id);
    return {
        opportunity_id: resolveOpportunityIdFromSessionSnapshotFields(row.crm_snapshot, row.launch_context),
        customer_id: id(snap.customer_id) ?? (sourceType === "customer" ? source : null),
        customer_member_id: id(snap.customer_member_id) ?? (sourceType === "customer_member" ? source : null),
        person_id: id(snap.person_id) ?? (sourceType === "person" ? source : null),
    };
}

/** By id: does the packet session exist in the organization AND sit inside the caller's scope? (One 404 for both.) */
export async function packetSessionReadableById(supabase: SupabaseClient, orgId: string, packetSessionId: string): Promise<boolean> {
    const { data } = await supabase.from("form_packet_sessions").select("crm_snapshot, launch_context").eq("org_id", orgId).eq("id", packetSessionId).maybeSingle();
    if (!data) return false;
    return formsSubjectInActorScope(supabase, orgId, await formsReadScope(), packetSessionSubject(data as { crm_snapshot?: unknown; launch_context?: unknown }));
}

/** Keep only the packet sessions inside the caller's scope (rows must carry crm_snapshot and launch_context). */
export async function filterPacketSessionsInActorScope<T extends { crm_snapshot?: unknown; launch_context?: unknown }>(
    supabase: SupabaseClient,
    orgId: string,
    scope: AdminAccessScopeDimensions | null,
    rows: readonly T[],
): Promise<T[]> {
    const keyed = rows.map((r) => ({ row: r, ...packetSessionSubject(r) }));
    const kept = await filterFormsRowsInActorScope(supabase, orgId, scope, keyed);
    return kept.map((k) => k.row);
}

/**
 * A subject named in a link's or a launch's metadata (`source_entity_type/id`, `selected_customer_member_id`,
 * `recipient_person_id`, `launch_fks`), resolved to the subject columns the rule reads. Unknown types fail closed.
 */
export function namedSubject(entityType: unknown, entityId: unknown): FormsSubjectRef | null {
    const t = typeof entityType === "string" ? entityType.trim().toLowerCase().replace(/s$/, "") : "";
    const v = id(entityId);
    if (!v) return null;
    if (t === "opportunity") return { opportunity_id: v };
    if (t === "customer") return { customer_id: v };
    if (t === "customer_member") return { customer_member_id: v };
    if (t === "person") return { person_id: v };
    return { customer_id: v }; // an unrecognised subject type is treated as unlinked: unrestricted actors only
}

/** The subject a public / packet link's metadata names (launch source, selected child, recipient, anchor opportunity). */
export function linkMetadataSubject(metadata: unknown): FormsSubjectRef | null {
    const m = record(metadata);
    const opp = id(m.opportunity_id) ?? id(m.anchor_opportunity_id) ?? (String(m.source_entity_type ?? "").toLowerCase().startsWith("opportunit") ? id(m.source_entity_id) : null);
    const named = namedSubject(m.source_entity_type, m.source_entity_id);
    const child = id(m.composer_child_id) ?? id(m.selected_customer_member_id) ?? (Array.isArray(m.selected_customer_member_ids) ? id(m.selected_customer_member_ids[0]) : null);
    const person = id(m.composer_recipient_id) ?? id(m.recipient_person_id);
    if (!opp && !named && !child && !person) return null;
    return { opportunity_id: opp, customer_id: named?.customer_id ?? null, customer_member_id: named?.customer_member_id ?? child, person_id: named?.person_id ?? person };
}

/** Keep the links whose named subject is in scope; a link naming no subject carries no subject data and is kept. */
export async function filterLinksInActorScope<T extends { metadata?: unknown }>(
    supabase: SupabaseClient,
    orgId: string,
    scope: AdminAccessScopeDimensions | null,
    links: readonly T[],
): Promise<T[]> {
    if (!scope) return [];
    if (!accessScopeRestrictsData(scope)) return [...links];
    const keyed = links.map((l) => ({ link: l, subject: linkMetadataSubject(l.metadata) }));
    const named = keyed.filter((k) => k.subject).map((k) => ({ ...k.subject!, k }));
    const kept = new Set((await filterFormsRowsInActorScope(supabase, orgId, scope, named)).map((x) => x.k));
    return keyed.filter((k) => !k.subject || kept.has(k)).map((k) => k.link);
}
